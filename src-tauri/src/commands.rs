//! Tauri command handlers exposed to the frontend via `invoke`.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::data::models::{RankTier, Role};
use crate::data::store;
use crate::data::store::Settings;
use crate::draft::DraftState;
use crate::engine::{self, weights::Weights, Recommendation};
use crate::opgg;
use crate::{ConnectionStatus, Shared};

#[tauri::command]
pub fn get_connection_status(state: State<Shared>) -> ConnectionStatus {
    state.connection.lock().unwrap().clone()
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
pub fn get_rank_tier(state: State<Shared>) -> RankTier {
    *state.rank_tier.lock().unwrap()
}

/// Manually select a rank tier for OP.GG data fetching. Persists the choice
/// immediately (so it survives a restart even if the crawl below fails) and
/// kicks off a background re-crawl at the new tier.
#[tauri::command]
pub fn set_rank_tier(state: State<Shared>, tier: RankTier, app: AppHandle) {
    *state.rank_tier.lock().unwrap() = tier;
    *state.rank_manual.lock().unwrap() = true;

    let patch = store::read_meta().map(|m| m.patch).unwrap_or_default();
    let _ = store::write_meta(&patch, store::now_unix(), tier, true);

    opgg::refresh::trigger_refresh(app, state.inner().clone(), tier);
}

#[tauri::command]
pub fn get_settings(state: State<Shared>) -> Settings {
    state.settings.lock().unwrap().clone()
}

/// Persist and apply a new settings snapshot (Issue #15). Re-tunes the comp
/// weight and always-on-top window state immediately and returns a freshly
/// ranked list, mirroring `set_weights`.
#[tauri::command]
pub fn set_settings(state: State<Shared>, settings: Settings, app: AppHandle) -> Vec<Recommendation> {
    let mut settings = settings;
    settings.comp_weight = settings.comp_weight.clamp(0.0, 1.0);

    *state.settings.lock().unwrap() = settings.clone();
    let _ = store::write_settings(&settings);

    state.weights.lock().unwrap().comp = settings.comp_weight;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.always_on_top);
    }

    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

/// Force an immediate OP.GG re-crawl at the currently selected rank tier,
/// instead of waiting for the periodic 6h/24h auto-refresh.
#[tauri::command]
pub fn force_refresh_data(state: State<Shared>, app: AppHandle) {
    let tier = *state.rank_tier.lock().unwrap();
    opgg::refresh::trigger_refresh(app, state.inner().clone(), tier);
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
