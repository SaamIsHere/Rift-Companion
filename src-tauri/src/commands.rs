//! Tauri command handlers exposed to the frontend via `invoke`.

use tauri::{AppHandle, Emitter, State};

use crate::draft::DraftState;
use crate::engine::{self, weights::Weights, Recommendation};
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

fn compute(state: &Shared) -> Vec<Recommendation> {
    let draft = state.latest_draft.lock().unwrap().clone();
    match draft {
        Some(d) => engine::recommend(&state.repo, &d, &state.weights.lock().unwrap()),
        None => Vec::new(),
    }
}
