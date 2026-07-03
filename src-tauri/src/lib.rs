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
mod opgg;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use data::models::Role;
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
    /// Behind a Mutex so the background refresher can hot-swap the dataset.
    pub repo: Arc<Mutex<Arc<Repository>>>,
    pub weights: Arc<Mutex<Weights>>,
    pub latest_draft: Arc<Mutex<Option<DraftState>>>,
    pub connection: Arc<Mutex<ConnectionStatus>>,
    /// Manual enemy-role reassignments from the draft board, keyed by champion id.
    /// Re-applied on every LCU session push so they survive the next websocket frame.
    pub enemy_role_overrides: Arc<Mutex<HashMap<u32, Role>>>,
}

/// CLI entry point: install a normalized champion-stats JSON (the `Champion[]`
/// schema) as the active dataset. Invoked as `rift-companion ingest <json> [out]`.
pub fn run_ingest(json_path: Option<&str>, out_path: Option<&str>) -> anyhow::Result<()> {
    let json_path = json_path
        .ok_or_else(|| anyhow::anyhow!("usage: rift-companion ingest <normalized.json> [out_path]"))?;
    let default_out = data::store::default_data_path();
    let out = out_path
        .map(str::to_string)
        .unwrap_or_else(|| default_out.to_string_lossy().into_owned());
    let n = data::ingest::build_file(json_path, &out)?;
    println!("Installed {n} champions as the active dataset: {out}");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rift_companion_lib=info".into()),
        )
        .init();

    // Champion stats are loaded from a runtime JSON dataset (seeded from the
    // embedded demo data on first run, replaceable per-patch via `ingest`). Fall
    // back to the embedded JSON if the file is ever unusable so the app starts.
    let data_path = data::store::default_data_path();
    let repo = Repository::open_or_seed(&data_path.to_string_lossy())
        .inspect(|r| tracing::info!(path = %data_path.display(), champions = r.len(), "loaded champion stats dataset"))
        .or_else(|e| {
            tracing::warn!("dataset load failed ({e:#}); using embedded dataset");
            Repository::load_embedded()
        })
        .expect("failed to load champion dataset");
    let repo = Arc::new(Mutex::new(Arc::new(repo)));

    let shared = Shared {
        repo,
        weights: Arc::new(Mutex::new(Weights::default())),
        latest_draft: Arc::new(Mutex::new(None)),
        connection: Arc::new(Mutex::new(ConnectionStatus::Searching)),
        enemy_role_overrides: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_connection_status,
            commands::get_draft_state,
            commands::get_recommendations,
            commands::set_weights,
            commands::set_enemy_role,
        ])
        .setup(move |app| {
            // Long-running LCU watcher on Tauri's async (tokio) runtime.
            {
                let handle = app.handle().clone();
                let shared = shared.clone();
                tauri::async_runtime::spawn(async move {
                    lcu::run_watcher(handle, shared).await;
                });
            }
            // Background champion-data refresher (OP.GG → dataset; daily / on patch change).
            {
                let handle = app.handle().clone();
                let shared = shared.clone();
                tauri::async_runtime::spawn(async move {
                    opgg::refresh::run_refresher(handle, shared).await;
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Rift Companion");
}
