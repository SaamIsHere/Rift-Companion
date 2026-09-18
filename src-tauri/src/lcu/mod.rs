//! LCU orchestration: discover the client, attach to the websocket, normalise
//! each champ-select update, score it, and emit results to the webview.

pub mod client;
pub mod lockfile;
pub mod models;
pub mod websocket;

use std::time::Duration;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::tungstenite::Message;

use crate::data::models::RankTier;
use crate::{draft, engine, opgg, ConnectionStatus, DraftState, Shared};

/// Runs forever: (re)discovers the client and processes events, reconnecting on drop.
pub async fn run_watcher(app: AppHandle, shared: Shared) {
    loop {
        let lock = match lockfile::find() {
            Some(l) => l,
            None => {
                set_status(&app, &shared, ConnectionStatus::Searching);
                tokio::time::sleep(Duration::from_secs(3)).await;
                continue;
            }
        };

        tracing::info!(port = lock.port, "LCU lockfile found; connecting");

        match websocket::connect(&lock).await {
            Ok(mut ws) => {
                // Only report Connected — and fire the REST-dependent setup — once the
                // websocket handshake has actually succeeded. The lockfile can appear
                // on disk slightly before the LCU's internal HTTPS API is accepting
                // connections (a startup race most noticeable when the League client
                // is launched *after* this app); reporting Connected right after
                // `lockfile::find()` above flapped Connected/Searching every retry
                // until the API actually came up. A completed websocket handshake is
                // concrete proof the API is actually up.
                set_status(&app, &shared, ConnectionStatus::Connected);

                // Fetch the active account's profile for the title bar (Issue #9).
                // Persist to disk so it is remembered across sessions (Issue #40).
                match client::get_current_summoner(&lock).await {
                    Ok(Some(profile)) => {
                        let _ = crate::data::store::write_cached_profile(&profile);
                        *shared.profile.lock().unwrap() = Some(profile.clone());
                        let _ = app.emit("lcu://profile", &profile);
                    }
                    Ok(None) => tracing::debug!("current summoner not available yet"),
                    Err(e) => tracing::warn!("failed to fetch current summoner: {e}"),
                }

                // Auto-detect the local player's rank tier as the data-fetch default,
                // unless they've already picked one manually from the dropdown
                // (Issue #13). Best-effort: unranked/unreachable just keeps whatever
                // tier is already active.
                if !*shared.rank_manual.lock().unwrap() {
                    if let Ok(Some(tier_str)) = client::get_ranked_solo_tier(&lock).await {
                        let detected = RankTier::from_lcu_tier(&tier_str);
                        let current = *shared.rank_tier.lock().unwrap();
                        if detected != current {
                            tracing::info!(tier = detected.as_opgg_tier(), "auto-detected rank tier from LCU profile");
                            *shared.rank_tier.lock().unwrap() = detected;
                            let _ = app.emit("rank://update", detected);

                            // Persist detected rank tier
                            {
                                let mut settings = shared.settings.lock().unwrap();
                                settings.rank_tier = Some(detected);
                                let _ = crate::data::store::write_settings(&settings);
                            }
                            let patch = crate::data::store::read_meta().map(|m| m.patch).unwrap_or_default();
                            let _ = crate::data::store::write_meta(&patch, crate::data::store::now_unix(), detected, false);

                            let server_url = shared.settings.lock().unwrap().server_url.clone();
                            if !server_url.trim().is_empty() {
                                let shared_clone = shared.clone();
                                let app_clone = app.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = app_clone.emit("rank-refresh://status", "refreshing");
                                    match opgg::remote::fetch_stats(&server_url, detected).await {
                                        Ok(champions) => {
                                            let count = champions.len();
                                            let repo = crate::data::repository::Repository::from_champions(champions);
                                            *shared_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                                            tracing::info!(tier = detected.as_opgg_tier(), champions = count, "loaded champion stats from Rift Server");
                                            let draft = shared_clone.latest_draft.lock().unwrap().clone();
                                            if let Some(d) = draft {
                                                let weights = shared_clone.weights.lock().unwrap();
                                                let recs = engine::recommend(shared_clone.repo.lock().unwrap().as_ref(), &d, &weights);
                                                let _ = app_clone.emit("recommendations://update", &recs);
                                            }
                                            let _ = app_clone.emit("rank-refresh://status", "idle");
                                        }
                                        Err(e) => {
                                            tracing::warn!("failed to fetch stats from server ({server_url}): {e:#}");
                                            let _ = app_clone.emit("rank-refresh://status", "error");
                                        }
                                    }
                                });
                            } else {
                                opgg::refresh::trigger_refresh(app.clone(), shared.clone(), detected);
                            }
                        }
                    }
                }

                // Check current gameflow phase first!
                let initial_phase = match client::get_gameflow_phase(&lock).await {
                    Ok(Some(p)) => p,
                    _ => "None".to_string(),
                };
                *shared.gameflow_phase.lock().unwrap() = initial_phase.clone();
                let _ = app.emit("gameflow://phase", &initial_phase);

                if initial_phase == "ChampSelect" {
                    if let Ok(Some(value)) = client::get_session(&lock).await {
                        handle_session(&app, &shared, value);
                    }
                } else if is_in_match(&initial_phase) {
                    let got_live = check_liveclient_data(&app, &shared).await;
                    if !got_live {
                        if let Ok(Some(gf_val)) = client::get_gameflow_session(&lock).await {
                            handle_gameflow_session(&app, &shared, gf_val);
                        }
                    }
                    let app_poller = app.clone();
                    let shared_poller = shared.clone();
                    tauri::async_runtime::spawn(async move {
                        for _ in 0..1800 {
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            let p = shared_poller.gameflow_phase.lock().unwrap().clone();
                            if !is_in_match(&p) {
                                break;
                            }
                            if p == "GameStart" || p == "InProgress" || p == "Reconnect" {
                                check_liveclient_data(&app_poller, &shared_poller).await;
                            }
                        }
                    });
                }

                while let Some(msg) = ws.next().await {
                    match msg {
                        Ok(Message::Text(txt)) => {
                            if let Some(ev) = parse_event(&txt) {
                                if ev.uri.contains("gameflow-phase") {
                                    if let Some(phase) = ev.data.as_str() {
                                        tracing::info!(phase, "gameflow phase update");
                                        *shared.gameflow_phase.lock().unwrap() = phase.to_string();
                                        let _ = app.emit("gameflow://phase", phase);

                                        if phase == "ChampSelect" {
                                            tracing::info!(phase, "entered champ select");
                                        } else if phase == "GameStart" || phase == "InProgress" || phase == "Reconnect" {
                                            tracing::info!(phase, "match active / in-progress; preserving match state");
                                            let got_live = check_liveclient_data(&app, &shared).await;
                                            if !got_live {
                                                if let Ok(Some(gf_val)) = client::get_gameflow_session(&lock).await {
                                                    handle_gameflow_session(&app, &shared, gf_val);
                                                }
                                            }
                                            let app_poller = app.clone();
                                            let shared_poller = shared.clone();
                                            tauri::async_runtime::spawn(async move {
                                                for _ in 0..1800 {
                                                    tokio::time::sleep(Duration::from_secs(2)).await;
                                                    let p = shared_poller.gameflow_phase.lock().unwrap().clone();
                                                    if !is_in_match(&p) {
                                                        break;
                                                    }
                                                    if p == "GameStart" || p == "InProgress" || p == "Reconnect" {
                                                        check_liveclient_data(&app_poller, &shared_poller).await;
                                                    }
                                                }
                                            });
                                        } else if !is_in_match(phase) {
                                            tracing::info!(phase, "gameflow phase is not an active match; clearing session");
                                            clear_session(&app, &shared);
                                        }
                                    }
                                } else if ev.uri.contains("gameflow") && ev.uri.contains("session") {
                                    let current_phase = shared.gameflow_phase.lock().unwrap().clone();
                                    if is_in_match(&current_phase) {
                                        let got_live = check_liveclient_data(&app, &shared).await;
                                        if !got_live {
                                            handle_gameflow_session(&app, &shared, ev.data);
                                        }
                                    }
                                } else if ev.uri.contains("champ-select") {
                                    let is_404 = ev.data.get("httpStatus").and_then(|s| s.as_i64()) == Some(404);
                                    if ev.event_type == "Delete" || ev.data.is_null() || is_404 {
                                        let current_phase = shared.gameflow_phase.lock().unwrap().clone();
                                        if !is_in_match(&current_phase) {
                                            tracing::info!(current_phase, "champ-select session closed and not in match; clearing session");
                                            clear_session(&app, &shared);
                                        } else {
                                            tracing::info!(current_phase, "champ-select session closed but match is starting/in-progress; preserving state");
                                        }
                                    } else {
                                        handle_session(&app, &shared, ev.data);
                                    }
                                }
                            }
                        }
                        Ok(Message::Close(_)) | Err(_) => break,
                        _ => {}
                    }
                }
            }
            Err(e) => tracing::warn!("LCU websocket connect failed: {e}"),
        }

        set_status(&app, &shared, ConnectionStatus::Searching);
        tracing::info!("LCU disconnected; retrying");
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

pub fn is_in_match(phase: &str) -> bool {
    matches!(phase, "ChampSelect" | "GameStart" | "InProgress" | "Reconnect")
}

struct LcuEvent {
    event_type: String,
    uri: String,
    data: serde_json::Value,
}

/// Extract `(eventType, uri, data)` from an `[8, "<event>", { data, eventType, uri, ... }]` frame.
fn parse_event(txt: &str) -> Option<LcuEvent> {
    let parsed: serde_json::Value = serde_json::from_str(txt).ok()?;
    let payload = parsed.as_array()?.get(2)?;
    let event_type = payload.get("eventType").and_then(|v| v.as_str()).unwrap_or("Update").to_string();
    let uri = payload.get("uri").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let data = payload.get("data").cloned().unwrap_or(serde_json::Value::Null);
    Some(LcuEvent { event_type, uri, data })
}

pub async fn check_liveclient_data(app: &AppHandle, shared: &Shared) -> bool {
    let players = match client::get_liveclient_playerlist().await {
        Ok(Some(p)) if !p.is_empty() => p,
        _ => return false,
    };
    let active = client::get_liveclient_activeplayer().await.ok().flatten();

    let repo = shared.repo.lock().unwrap().clone();
    let existing_draft = shared.latest_draft.lock().unwrap().clone();

    if let Some(state) = draft::from_live_client(
        repo.as_ref(),
        &players,
        active.as_ref(),
        existing_draft.as_ref(),
    ) {
        if !state.allies.is_empty() || !state.enemies.is_empty() {
            tracing::info!(
                allies = state.allies.len(),
                enemies = state.enemies.len(),
                "in-game match state updated from Live Client API (port 2999)"
            );
            *shared.latest_draft.lock().unwrap() = Some(state.clone());
            let _ = app.emit("champ-select://update", &state);
            return true;
        }
    }
    false
}

fn clear_session(app: &AppHandle, shared: &Shared) {
    *shared.latest_draft.lock().unwrap() = None;
    *shared.gameflow_phase.lock().unwrap() = "None".to_string();
    shared.weights.lock().unwrap().mode = crate::engine::weights::ScoringMode::Default;
    shared.enemy_role_overrides.lock().unwrap().clear();
    shared.ally_role_overrides.lock().unwrap().clear();
    let _ = app.emit("champ-select://update", None::<DraftState>);
    let _ = app.emit("gameflow://phase", "None");
    let _ = app.emit("recommendations://update", Vec::<crate::engine::Recommendation>::new());
    let _ = app.emit("scoring-mode://update", crate::engine::weights::ScoringMode::Default);
}

fn handle_gameflow_session(app: &AppHandle, shared: &Shared, data: serde_json::Value) {
    let session: models::GameflowSession = match serde_json::from_value(data) {
        Ok(s) => s,
        Err(e) => {
            tracing::debug!("ignoring non-gameflow-session payload: {e}");
            return;
        }
    };

    let repo = shared.repo.lock().unwrap().clone();
    let local_profile = shared.profile.lock().unwrap().clone();
    let local_puuid = local_profile.as_ref().map(|p| p.puuid.as_str());
    let local_name = local_profile.as_ref().map(|p| p.display_name.as_str());
    let existing_draft = shared.latest_draft.lock().unwrap().clone();

    if let Some(mut state) = draft::from_gameflow(
        repo.as_ref(),
        &session,
        local_puuid,
        local_name,
        existing_draft.as_ref(),
    ) {
        // Re-apply any enemy role overrides
        {
            let mut overrides = shared.enemy_role_overrides.lock().unwrap();
            if !overrides.is_empty() {
                let live_ids: std::collections::HashSet<u32> =
                    state.enemies.iter().map(|p| p.champion_id).collect();
                overrides.retain(|id, _| live_ids.contains(id));
                for pick in state.enemies.iter_mut() {
                    if let Some(role) = overrides.get(&pick.champion_id) {
                        pick.role = Some(*role);
                    }
                }
            }
        }
        // Re-apply any ally role overrides
        {
            let mut overrides = shared.ally_role_overrides.lock().unwrap();
            if !overrides.is_empty() {
                let live_ids: std::collections::HashSet<u32> =
                    state.allies.iter().map(|p| p.champion_id).collect();
                overrides.retain(|id, _| live_ids.contains(id));
                for pick in state.allies.iter_mut() {
                    if let Some(role) = overrides.get(&pick.champion_id) {
                        pick.role = Some(*role);
                        if pick.is_local {
                            state.local_role = Some(*role);
                        }
                    }
                }
            }
        }

        tracing::info!(
            allies = state.allies.len(),
            enemies = state.enemies.len(),
            "in-game match state updated from gameflow"
        );

        *shared.latest_draft.lock().unwrap() = Some(state.clone());
        let _ = app.emit("champ-select://update", &state);
    }
}

/// Normalise → score → emit. This is the heart of Phase 1/2 wiring.
fn handle_session(app: &AppHandle, shared: &Shared, data: serde_json::Value) {
    let session: models::ChampSelectSession = match serde_json::from_value(data) {
        Ok(s) => s,
        Err(e) => {
            tracing::debug!("ignoring non-session payload: {e}");
            return;
        }
    };

    if session.my_team.is_empty() && session.their_team.is_empty() {
        clear_session(app, shared);
        return;
    }

    // If starting a brand new champ select session, reset scoring mode to Default
    let is_new_session = shared.latest_draft.lock().unwrap().is_none();
    if is_new_session {
        shared.weights.lock().unwrap().mode = crate::engine::weights::ScoringMode::Default;
        let _ = app.emit("scoring-mode://update", crate::engine::weights::ScoringMode::Default);
    }

    let repo = shared.repo.lock().unwrap().clone();
    let mut state = draft::from_session(repo.as_ref(), &session);

    // Re-apply any manual enemy-role reassignments from the draft board, since
    // `state` above is rebuilt from scratch on every session push. Overrides
    // for champions no longer present (game ended / new draft) are dropped.
    {
        let mut overrides = shared.enemy_role_overrides.lock().unwrap();
        if !overrides.is_empty() {
            let live_ids: std::collections::HashSet<u32> =
                state.enemies.iter().map(|p| p.champion_id).collect();
            overrides.retain(|id, _| live_ids.contains(id));
            for pick in state.enemies.iter_mut() {
                if let Some(role) = overrides.get(&pick.champion_id) {
                    pick.role = Some(*role);
                }
            }
        }
    }
    // Re-apply any manual ally-role reassignments
    {
        let mut overrides = shared.ally_role_overrides.lock().unwrap();
        if !overrides.is_empty() {
            let live_ids: std::collections::HashSet<u32> =
                state.allies.iter().map(|p| p.champion_id).collect();
            overrides.retain(|id, _| live_ids.contains(id));
            for pick in state.allies.iter_mut() {
                if let Some(role) = overrides.get(&pick.champion_id) {
                    pick.role = Some(*role);
                    if pick.is_local {
                        state.local_role = Some(*role);
                    }
                }
            }
        }
    }

    // Phase 1 deliverable: log champ-select state changes to the console.
    tracing::info!(
        role = ?state.local_role,
        allies = state.allies.len(),
        enemies = state.enemies.len(),
        bans = state.bans.len(),
        "champ-select update"
    );

    let recs = {
        let weights = shared.weights.lock().unwrap();
        engine::recommend(repo.as_ref(), &state, &weights)
    };

    *shared.latest_draft.lock().unwrap() = Some(state.clone());
    let _ = app.emit("champ-select://update", &state);
    let _ = app.emit("recommendations://update", &recs);
}

fn set_status(app: &AppHandle, shared: &Shared, status: ConnectionStatus) {
    // Note (Issue #40): Do not drop `shared.profile` on disconnect.
    // The last connected account is preserved across sessions until a new account logs in.
    *shared.connection.lock().unwrap() = status.clone();
    let _ = app.emit("lcu://connection", &status);
}
