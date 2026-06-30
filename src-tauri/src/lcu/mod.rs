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

use crate::{draft, engine, ConnectionStatus, Shared};

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

        set_status(&app, &shared, ConnectionStatus::Connected);
        tracing::info!(port = lock.port, "LCU lockfile found; connecting");

        // We may already be in champ select — pull the current state once.
        if let Ok(Some(value)) = client::get_session(&lock).await {
            handle_session(&app, &shared, value);
        }

        match websocket::connect(&lock).await {
            Ok(mut ws) => {
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
    let state = draft::from_session(repo.as_ref(), &session);

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
    *shared.connection.lock().unwrap() = status.clone();
    let _ = app.emit("lcu://connection", &status);
}
