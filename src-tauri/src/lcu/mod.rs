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
use crate::{draft, engine, opgg, ConnectionStatus, Shared};

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

                // We may already be in champ select — pull the current state once.
                if let Ok(Some(value)) = client::get_session(&lock).await {
                    handle_session(&app, &shared, value);
                }

                while let Some(msg) = ws.next().await {
                    match msg {
                        Ok(Message::Text(txt)) => {
                            if let Some(data) = parse_event(&txt) {
                                handle_session(&app, &shared, data);
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

/// Extract the `data` object from an `[8, "<event>", { data, ... }]` frame.
fn parse_event(txt: &str) -> Option<serde_json::Value> {
    let parsed: serde_json::Value = serde_json::from_str(txt).ok()?;
    let payload = parsed.as_array()?.get(2)?;
    payload.get("data").cloned()
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
