//! Rift Companion — Tauri backend entry point.
//!
//! Responsibilities:
//!   * discover & connect to the local League Client (LCU) websocket,
//!   * normalise the champ-select session into a clean `DraftState`,
//!   * run the weighted scoring engine,
//!   * push live updates to the webview via events.

pub mod commands;
pub mod data;
pub mod draft;
pub mod engine;
pub mod lcu;
pub mod opgg;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

use data::models::{RankTier, Role};
use data::repository::Repository;
use data::store::Settings;
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
    /// Active account's summoner profile, fetched on LCU connect (Issue #9).
    pub profile: Arc<Mutex<Option<lcu::client::Summoner>>>,
    /// Manual enemy-role reassignments from the draft board, keyed by champion id.
    /// Re-applied on every LCU session push so they survive the next websocket frame.
    pub enemy_role_overrides: Arc<Mutex<HashMap<u32, Role>>>,
    /// Manual ally-role reassignments from the draft board, keyed by champion id.
    pub ally_role_overrides: Arc<Mutex<HashMap<u32, Role>>>,
    /// Rank tier OP.GG data is currently fetched for (Issue #13).
    pub rank_tier: Arc<Mutex<RankTier>>,
    /// Whether `rank_tier` was set explicitly via the UI dropdown; if so, LCU
    /// auto-detection on (re)connect no longer overrides it.
    pub rank_manual: Arc<Mutex<bool>>,
    /// Serializes OP.GG crawls so a periodic refresh and a manual/auto-detected
    /// rank change can never run concurrently against the MCP endpoint.
    pub refresh_lock: Arc<tokio::sync::Mutex<()>>,
    /// User-adjustable app settings (Issue #15): appearance, behavior, data controls.
    pub settings: Arc<Mutex<Settings>>,
    /// Current LCU gameflow phase ("None", "ChampSelect", "GameStart", "InProgress", etc.)
    pub gameflow_phase: Arc<Mutex<String>>,
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

    // Seed persisted user settings (Issue #15 & #40); comp-weight rides along on `weights`.
    let settings = data::store::read_settings().unwrap_or_default();
    let always_on_top = settings.always_on_top;

    // Seed the rank-tier selection from settings.json first, falling back to stats.meta.json
    // so a manual choice survives a restart even when remote server is configured (Issue #40).
    let meta = data::store::read_meta();
    let rank_tier = settings
        .rank_tier
        .or_else(|| meta.as_ref().map(|m| m.tier))
        .unwrap_or_default();
    let rank_manual = settings.rank_manual || meta.as_ref().map(|m| m.manual).unwrap_or(false);

    // Seed cached summoner profile (Issue #40) so the last known user survives restart.
    let cached_profile = data::store::read_cached_profile();

    let shared = Shared {
        repo,
        weights: Arc::new(Mutex::new(Weights { comp: settings.comp_weight, mode: Default::default() })),
        latest_draft: Arc::new(Mutex::new(None)),
        connection: Arc::new(Mutex::new(ConnectionStatus::Searching)),
        profile: Arc::new(Mutex::new(cached_profile)),
        enemy_role_overrides: Arc::new(Mutex::new(HashMap::new())),
        ally_role_overrides: Arc::new(Mutex::new(HashMap::new())),
        rank_tier: Arc::new(Mutex::new(rank_tier)),
        rank_manual: Arc::new(Mutex::new(rank_manual)),
        refresh_lock: Arc::new(tokio::sync::Mutex::new(())),
        settings: Arc::new(Mutex::new(settings)),
        gameflow_phase: Arc::new(Mutex::new("None".to_string())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_connection_status,
            commands::get_gameflow_phase,
            commands::get_profile,
            commands::get_draft_state,
            commands::get_recommendations,
            commands::set_weights,
            commands::set_scoring_mode,
            commands::get_scoring_mode,
            commands::hover_champion,
            commands::get_champion_recommendation,
            commands::set_enemy_role,
            commands::set_champion_role,
            commands::swap_champion_roles,
            commands::get_rank_tier,
            commands::set_rank_tier,
            commands::get_settings,
            commands::set_settings,
            commands::force_refresh_data,
            commands::get_pairwise_stat,
            commands::test_server_connection,
            commands::open_in_browser,
            commands::get_latest_patch_info,
            commands::get_champion_build,
            commands::get_champion_overview,
            commands::get_champions_by_role,
            commands::get_player_profile,
            commands::get_player_matches,
            commands::get_match_detail,
            commands::simulate_draft,
            commands::simulate_champion_recommendation,
            commands::simulate_match_analysis,
            commands::save_custom_wallpaper,
            commands::delete_custom_wallpaper,
            commands::get_custom_wallpaper,
        ])
        .setup(move |app| {
            let is_quitting = Arc::new(AtomicBool::new(false));

            // Set up System Tray icon and context menu (Show Window, Quit)
            if let Some(icon) = app.default_window_icon().cloned() {
                let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                let is_quitting_tray = is_quitting.clone();
                let _tray = TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("Rift Companion")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(move |app, event| {
                        match event.id.as_ref() {
                            "quit" => {
                                is_quitting_tray.store(true, Ordering::SeqCst);
                                app.exit(0);
                            }
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        match event {
                            TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            }
                            | TrayIconEvent::DoubleClick {
                                button: MouseButton::Left,
                                ..
                            } => {
                                let app = tray.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        }
                    })
                    .build(app)?;
            }

            // Apply the persisted always-on-top preference and attach close-behavior event handler
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(always_on_top);
                let _ = window.show();
                let _ = window.set_focus();

                let is_quitting_win = is_quitting.clone();
                let shared_win = shared.clone();
                let win_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if is_quitting_win.load(Ordering::SeqCst) {
                            return;
                        }
                        let behavior = {
                            let s = shared_win.settings.lock().unwrap();
                            s.close_behavior.clone()
                        };
                        match behavior.as_str() {
                            "minimize" => {
                                api.prevent_close();
                                let _ = win_clone.minimize();
                            }
                            "tray" => {
                                api.prevent_close();
                                let _ = win_clone.hide();
                            }
                            _ => {
                                api.prevent_close();
                                is_quitting_win.store(true, Ordering::SeqCst);
                                win_clone.app_handle().exit(0);
                            }
                        }
                    }
                });
            }
            // Long-running LCU watcher on Tauri's async (tokio) runtime.
            {
                let handle = app.handle().clone();
                let shared = shared.clone();
                tauri::async_runtime::spawn(async move {
                    lcu::run_watcher(handle, shared).await;
                });
            }
            // Data refresher: If remote Rift Server URL is set, load directly from server on startup into memory.
            // Otherwise, fall back to local background refresher (OP.GG -> dataset; daily / on patch change).
            let (server_url, api_key) = {
                let s = shared.settings.lock().unwrap();
                (s.server_url.clone(), s.api_key.clone())
            };
            if !server_url.trim().is_empty() {
                let handle = app.handle().clone();
                let shared = shared.clone();
                let s_url = server_url.clone();
                let key = api_key.clone();
                tauri::async_runtime::spawn(async move {
                    let tier = *shared.rank_tier.lock().unwrap();
                    let _ = handle.emit("rank-refresh://status", "refreshing");
                    match opgg::remote::fetch_stats(&s_url, tier, Some(&key)).await {
                        Ok(champions) => {
                            let count = champions.len();
                            if let Ok(json) = serde_json::to_string(&champions) {
                                let path = data::store::default_data_path();
                                let _ = std::fs::write(&path, json);
                            }
                            let repo = Repository::from_champions(champions);
                            *shared.repo.lock().unwrap() = Arc::new(repo);
                            tracing::info!(tier = tier.as_opgg_tier(), champions = count, "seeded champion stats from Rift Server");
                            let draft = shared.latest_draft.lock().unwrap().clone();
                            if let Some(d) = draft {
                                let repo = shared.repo.lock().unwrap().clone();
                                let weights = shared.weights.lock().unwrap();
                                let recs = engine::recommend(repo.as_ref(), &d, &weights);
                                let _ = handle.emit("recommendations://update", &recs);
                            }
                            let _ = handle.emit("rank-refresh://status", "idle");
                        }
                        Err(e) => {
                            tracing::warn!("failed to seed stats from Rift Server ({s_url}): {e:#}; using local/embedded repo");
                            let _ = handle.emit("rank-refresh://status", "idle");
                        }
                    }
                });
            } else {
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
