//! Tauri command handlers exposed to the frontend via `invoke`.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::data::models::{RankTier, Role};
use crate::data::store;
use crate::data::store::Settings;
use crate::draft::DraftState;
use crate::engine::{self, bayesian, weights, weights::Weights, Recommendation};
use crate::opgg;
use crate::{ConnectionStatus, Shared};

#[tauri::command]
pub fn get_connection_status(state: State<Shared>) -> ConnectionStatus {
    state.connection.lock().unwrap().clone()
}

/// Active account's summoner profile, primed on app launch (Issue #9); live
/// updates arrive via the "lcu://profile" event instead.
#[tauri::command]
pub fn get_profile(state: State<Shared>) -> Option<crate::lcu::client::Summoner> {
    state.profile.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_draft_state(state: State<Shared>) -> Option<DraftState> {
    state.latest_draft.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_recommendations(state: State<Shared>) -> Vec<Recommendation> {
    compute(&state)
}

/// Re-tune the algorithm weights live and return a freshly ranked list.
#[tauri::command]
pub fn set_weights(state: State<Shared>, weights: Weights, app: AppHandle) -> Vec<Recommendation> {
    *state.weights.lock().unwrap() = weights;
    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

/// Manually reassign an enemy pick's role from its draft card. `role: None`
/// clears the override and reverts to the dataset-inferred guess.
#[tauri::command]
pub fn set_enemy_role(
    state: State<Shared>,
    champion_id: u32,
    role: Option<Role>,
    app: AppHandle,
) -> Vec<Recommendation> {
    let repo = state.repo.lock().unwrap().clone();

    {
        let mut overrides = state.enemy_role_overrides.lock().unwrap();
        match role {
            Some(r) => {
                overrides.insert(champion_id, r);
            }
            None => {
                overrides.remove(&champion_id);
            }
        }
    }

    let resolved_role = role.or_else(|| repo.primary_role(champion_id));

    let updated_draft = {
        let mut draft = state.latest_draft.lock().unwrap();
        if let Some(d) = draft.as_mut() {
            if let Some(pick) = d.enemies.iter_mut().find(|p| p.champion_id == champion_id) {
                pick.role = resolved_role;
            }
        }
        draft.clone()
    };

    let recs = compute(&state);
    if let Some(d) = updated_draft {
        let _ = app.emit("champ-select://update", &d);
    }
    let _ = app.emit("recommendations://update", &recs);
    recs
}

#[tauri::command]
pub async fn test_server_connection(server_url: String) -> Result<opgg::remote::ServerStatus, String> {
    opgg::remote::check_status(&server_url).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_rank_tier(state: State<Shared>) -> RankTier {
    *state.rank_tier.lock().unwrap()
}

/// Manually select a rank tier for OP.GG data fetching. If a remote Rift Server
/// is configured, fetches the pre-computed dataset over LAN directly into memory
/// in milliseconds without writing to disk. Otherwise falls back to local crawl.
#[tauri::command]
pub fn set_rank_tier(state: State<Shared>, tier: RankTier, app: AppHandle) {
    *state.rank_tier.lock().unwrap() = tier;
    *state.rank_manual.lock().unwrap() = true;

    let server_url = state.settings.lock().unwrap().server_url.clone();
    if !server_url.trim().is_empty() {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank://update", tier);
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            match opgg::remote::fetch_stats(&server_url, tier).await {
                Ok(champions) => {
                    let count = champions.len();
                    let repo = crate::data::repository::Repository::from_champions(champions);
                    *state_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                    tracing::info!(tier = tier.as_opgg_tier(), champions = count, "loaded champion stats from Rift Server");
                    let recs = compute(&state_clone);
                    let _ = app_clone.emit("recommendations://update", &recs);
                    let _ = app_clone.emit("rank-refresh://status", "idle");
                }
                Err(e) => {
                    tracing::warn!("failed to fetch stats from server ({server_url}): {e:#}");
                    let _ = app_clone.emit("rank-refresh://status", "error");
                }
            }
        });
        return;
    }

    let patch = store::read_meta().map(|m| m.patch).unwrap_or_default();
    let _ = store::write_meta(&patch, store::now_unix(), tier, true);

    opgg::refresh::trigger_refresh(app, state.inner().clone(), tier);
}

#[tauri::command]
pub fn get_settings(state: State<Shared>) -> Settings {
    state.settings.lock().unwrap().clone()
}

/// Persist and apply a new settings snapshot (Issue #15). Re-tunes the comp
/// weight and always-on-top window state immediately, and loads from remote server
/// into memory if server_url was updated.
#[tauri::command]
pub fn set_settings(state: State<Shared>, settings: Settings, app: AppHandle) -> Vec<Recommendation> {
    let mut settings = settings;
    settings.comp_weight = settings.comp_weight.clamp(0.0, 1.0);

    let old_server_url = state.settings.lock().unwrap().server_url.clone();
    let new_server_url = settings.server_url.clone();

    *state.settings.lock().unwrap() = settings.clone();
    let _ = store::write_settings(&settings);

    state.weights.lock().unwrap().comp = settings.comp_weight;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.always_on_top);
    }

    // If server_url was added/changed, load stats from server into memory immediately
    if !new_server_url.trim().is_empty() && (new_server_url != old_server_url) {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        let tier = *state.rank_tier.lock().unwrap();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            match opgg::remote::fetch_stats(&new_server_url, tier).await {
                Ok(champions) => {
                    let count = champions.len();
                    let repo = crate::data::repository::Repository::from_champions(champions);
                    *state_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                    tracing::info!(tier = tier.as_opgg_tier(), champions = count, "loaded champion stats from Rift Server");
                    let recs = compute(&state_clone);
                    let _ = app_clone.emit("recommendations://update", &recs);
                    let _ = app_clone.emit("rank-refresh://status", "idle");
                }
                Err(e) => {
                    tracing::warn!("failed to fetch stats from server ({new_server_url}): {e:#}");
                    let _ = app_clone.emit("rank-refresh://status", "error");
                }
            }
        });
    }

    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

/// Force an immediate data refresh. Uses the remote server if configured,
/// otherwise triggers local crawl.
#[tauri::command]
pub fn force_refresh_data(state: State<Shared>, app: AppHandle) {
    let tier = *state.rank_tier.lock().unwrap();
    let server_url = state.settings.lock().unwrap().server_url.clone();
    if !server_url.trim().is_empty() {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            let _ = opgg::remote::trigger_refresh(&server_url, Some(tier.as_opgg_tier())).await;
            match opgg::remote::fetch_stats(&server_url, tier).await {
                Ok(champions) => {
                    let count = champions.len();
                    let repo = crate::data::repository::Repository::from_champions(champions);
                    *state_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                    tracing::info!(tier = tier.as_opgg_tier(), champions = count, "refreshed stats from Rift Server");
                    let recs = compute(&state_clone);
                    let _ = app_clone.emit("recommendations://update", &recs);
                    let _ = app_clone.emit("rank-refresh://status", "idle");
                }
                Err(e) => {
                    tracing::warn!("failed to refresh stats from server ({server_url}): {e:#}");
                    let _ = app_clone.emit("rank-refresh://status", "error");
                }
            }
        });
        return;
    }

    opgg::refresh::trigger_refresh(app, state.inner().clone(), tier);
}

/// A single ally/enemy relationship's Bayesian-smoothed win rate, used to
/// power the on-hover matchup/synergy preview (Issue #7): hovering a draft
/// slot while a champion is preselected or already locked in shows exactly
/// how that pairing has historically performed, independent of whatever
/// role is currently being scored.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PairwiseStat {
    pub winrate: f64, // Bayesian-smoothed, 0.0–1.0
    pub games: u32,
    pub delta: f64, // winrate - 0.5, signed
}

/// Look up `champion_id`'s (playing `role`) historical win rate paired with
/// `other_id` — as an ally (synergy) or opponent (matchup). Returns `None`
/// if the pairing has never been recorded or falls under the same
/// `MIN_MATCHES` sample-size gate the scoring engine itself uses, so the UI
/// can distinguish "no signal" from "just under the trust threshold".
#[tauri::command]
pub fn get_pairwise_stat(
    state: State<Shared>,
    champion_id: u32,
    role: Role,
    other_id: u32,
    is_ally: bool,
) -> Option<PairwiseStat> {
    let repo = state.repo.lock().unwrap().clone();
    let stats = repo.get(champion_id)?.role_stats(role)?;
    let cell = if is_ally { stats.synergies.get(&other_id) } else { stats.matchups.get(&other_id) }?;
    if cell.games < weights::MIN_MATCHES {
        return None;
    }
    let winrate = bayesian::smooth(cell.winrate, cell.games, repo.global_avg(), weights::SMOOTH_C);
    Some(PairwiseStat { winrate, games: cell.games, delta: winrate - 0.5 })
}

fn compute(state: &Shared) -> Vec<Recommendation> {
    let draft = state.latest_draft.lock().unwrap().clone();
    match draft {
        Some(d) => {
            let repo = state.repo.lock().unwrap().clone();
            engine::recommend(repo.as_ref(), &d, &state.weights.lock().unwrap())
        }
        None => Vec::new(),
    }
}
