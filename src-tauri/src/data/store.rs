//! On-disk location of the active champion-stats dataset.
//!
//! The dataset is a normalized `Champion[]` JSON file (see `data::ingest`),
//! loaded at runtime so it can be replaced per-patch without recompiling.
//!
//! Why JSON and not SQLite (yet): on this machine the GNU Rust toolchain links
//! MSVCRT while the available `gcc` is UCRT-based, so bundled SQLite links but
//! fails to load (STATUS_ENTRYPOINT_NOT_FOUND). A SQLite-backed store can
//! replace this later without touching the engine — `Repository`'s query surface
//! stays identical either way — once a matching C toolchain is installed.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::data::models::RankTier;

pub fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Active dataset path, aligned with the Tauri app identifier so the `ingest`
/// CLI and the running app agree on the same file.
pub fn default_data_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("com.riftcompanion.app").join("stats.json")
}

/// Metadata sidecar describing the installed dataset, used by the refresh policy
/// to decide when the data is stale (new patch, or older than the max age).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetMeta {
    pub patch: String,
    pub fetched_at: u64, // unix seconds
    /// Rank tier the dataset's matchup/synergy stats were fetched for.
    #[serde(default)]
    pub tier: RankTier,
    /// Whether `tier` was set explicitly via the UI dropdown (true) or is
    /// still following LCU auto-detection / the default (false).
    #[serde(default)]
    pub manual: bool,
}

fn meta_path() -> PathBuf {
    let mut p = default_data_path();
    p.set_file_name("stats.meta.json");
    p
}

pub fn read_meta() -> Option<DatasetMeta> {
    serde_json::from_str(&std::fs::read_to_string(meta_path()).ok()?).ok()
}

pub fn write_meta(patch: &str, fetched_at: u64, tier: RankTier, manual: bool) -> std::io::Result<()> {
    let meta = DatasetMeta { patch: patch.to_string(), fetched_at, tier, manual };
    std::fs::write(meta_path(), serde_json::to_string_pretty(&meta).unwrap_or_default())
}

/// User-adjustable app settings (Issue #15), persisted as a sidecar next to
/// `stats.json`/`stats.meta.json` so choices survive a restart.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Appearance: tighter padding/gaps on the recommendation cards.
    #[serde(default)]
    pub compact_density: bool,
    /// Behavior: keep the window pinned above other windows (e.g. the League client).
    #[serde(default)]
    pub always_on_top: bool,
    /// Behavior: the team-composition bonus weight (mirrors `engine::weights::Weights.comp`).
    #[serde(default = "default_comp_weight")]
    pub comp_weight: f64,
}

fn default_comp_weight() -> f64 {
    crate::engine::weights::Weights::default().comp
}

impl Default for Settings {
    fn default() -> Self {
        Settings { compact_density: false, always_on_top: false, comp_weight: default_comp_weight() }
    }
}

fn settings_path() -> PathBuf {
    let mut p = default_data_path();
    p.set_file_name("settings.json");
    p
}

pub fn read_settings() -> Option<Settings> {
    serde_json::from_str(&std::fs::read_to_string(settings_path()).ok()?).ok()
}

pub fn write_settings(settings: &Settings) -> std::io::Result<()> {
    if let Some(parent) = settings_path().parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(settings_path(), serde_json::to_string_pretty(settings).unwrap_or_default())
}
