//! Rift Companion — Tauri backend entry point.
//!
//! Responsibilities:
//!   * discover & connect to the local League Client (LCU) websocket,
//!   * normalise the champ-select session into a clean `DraftState`,
//!   * run the weighted scoring engine,
//!   * push live updates to the webview via events.

mod commands;
mod data;
mod draft;
mod engine;
mod lcu;

use std::sync::{Arc, Mutex};

use data::repository::Repository;
use draft::DraftState;
use engine::weights::Weights;

/// Connection lifecycle reported to the UI.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    /// No League client / lockfile found yet.
    Searching,
    /// Lockfile found and websocket attached.
    Connected,
}

/// Cheaply-cloneable application state shared between Tauri commands and the
/// background LCU watcher task.
#[derive(Clone)]
pub struct Shared {
    pub repo: Arc<Repository>,
    pub weights: Arc<Mutex<Weights>>,
    pub latest_draft: Arc<Mutex<Option<DraftState>>>,
    pub connection: Arc<Mutex<ConnectionStatus>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rift_companion_lib=info".into()),
        )
        .init();

    // Static + dynamic stats are loaded once at startup (embedded for the prototype).
    let repo = Arc::new(Repository::load_embedded().expect("failed to load champion dataset"));

    let shared = Shared {
        repo,
        weights: Arc::new(Mutex::new(Weights::default())),
        latest_draft: Arc::new(Mutex::new(None)),
        connection: Arc::new(Mutex::new(ConnectionStatus::Searching)),
    };

    tauri::Builder::default()
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_connection_status,
            commands::get_draft_state,
            commands::get_recommendations,
            commands::set_weights,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let shared = shared.clone();
            // Long-running watcher on Tauri's async (tokio) runtime.
            tauri::async_runtime::spawn(async move {
                lcu::run_watcher(handle, shared).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Rift Companion");
}
