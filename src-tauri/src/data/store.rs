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
    /// Behavior: action when clicking the window close button (X): "close", "minimize", or "tray".
    #[serde(default = "default_close_behavior")]
    pub close_behavior: String,
    /// Behavior: app startup mode: "none", "system_boot", or "league_launch".
    #[serde(default = "default_startup_behavior")]
    pub startup_behavior: String,
    /// Behavior: the team-composition bonus weight (mirrors `engine::weights::Weights.comp`).
    #[serde(default = "default_comp_weight")]
    pub comp_weight: f64,
    /// Data Source: Optional Rift Server URL on local NAS or Cloudflare (e.g. "https://xxxx.trycloudflare.com").
    #[serde(default = "default_server_url")]
    pub server_url: String,
    /// Pre-shared API Key for remote Rift Server authentication.
    #[serde(default = "default_api_key")]
    pub api_key: String,
    /// Selected rank tier (Issue #13 & #40).
    #[serde(default)]
    pub rank_tier: Option<RankTier>,
    /// Whether rank tier was set manually by the user (Issue #40).
    #[serde(default)]
    pub rank_manual: bool,
    /// Active UI theme (e.g. "void", "hextech", "noxus", "freljord", etc.)
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Optional custom wallpaper image path
    #[serde(default)]
    pub custom_wallpaper: Option<String>,
    /// Wallpaper display scope: "landing_only" or "all_tabs"
    #[serde(default = "default_wallpaper_scope")]
    pub wallpaper_scope: String,
    /// Live Match import: whether runes auto-import is enabled.
    #[serde(default = "default_auto_import_runes")]
    pub auto_import_runes: bool,
    /// Live Match import: whether summoner spells auto-import is enabled.
    #[serde(default = "default_auto_import_spells")]
    pub auto_import_spells: bool,
    /// Live Match import: whether item sets auto-import is enabled.
    #[serde(default = "default_auto_import_items")]
    pub auto_import_items: bool,
    /// Live Match import: preferred flash key ("D" or "F").
    #[serde(default = "default_flash_key")]
    pub flash_key: String,
}

fn default_close_behavior() -> String {
    "close".to_string()
}

fn default_startup_behavior() -> String {
    "none".to_string()
}

fn default_comp_weight() -> f64 {
    crate::engine::weights::Weights::default().comp
}

fn default_server_url() -> String {
    "https://companion.sam-rift.win".to_string()
}

fn default_api_key() -> String {
    crate::opgg::remote::DEFAULT_PRESHARED_API_KEY.to_string()
}

fn default_theme() -> String {
    "void".to_string()
}

fn default_wallpaper_scope() -> String {
    "all_tabs".to_string()
}

fn default_auto_import_runes() -> bool {
    false
}

fn default_auto_import_spells() -> bool {
    false
}

fn default_auto_import_items() -> bool {
    false
}

fn default_flash_key() -> String {
    "D".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            compact_density: false,
            always_on_top: false,
            close_behavior: default_close_behavior(),
            startup_behavior: default_startup_behavior(),
            comp_weight: default_comp_weight(),
            server_url: default_server_url(),
            api_key: default_api_key(),
            rank_tier: None,
            rank_manual: false,
            theme: default_theme(),
            custom_wallpaper: None,
            wallpaper_scope: default_wallpaper_scope(),
            auto_import_runes: default_auto_import_runes(),
            auto_import_spells: default_auto_import_spells(),
            auto_import_items: default_auto_import_items(),
            flash_key: default_flash_key(),
        }
    }
}

fn settings_path() -> PathBuf {
    let mut p = default_data_path();
    p.set_file_name("settings.json");
    p
}

pub fn read_settings() -> Option<Settings> {
    let mut s: Settings = serde_json::from_str(&std::fs::read_to_string(settings_path()).ok()?).ok()?;
    if s.server_url.contains("192.168.") || s.server_url.trim().is_empty() || s.server_url.contains("trycloudflare.com") {
        s.server_url = default_server_url();
        let _ = write_settings(&s);
    }
    Some(s)
}

pub fn write_settings(settings: &Settings) -> std::io::Result<()> {
    if let Some(parent) = settings_path().parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(settings_path(), serde_json::to_string_pretty(settings).unwrap_or_default())
}

fn profile_path() -> PathBuf {
    let mut p = default_data_path();
    p.set_file_name("profile.json");
    p
}

/// Read the last known summoner profile (Issue #40) cached from an earlier session.
pub fn read_cached_profile() -> Option<crate::lcu::client::Summoner> {
    serde_json::from_str(&std::fs::read_to_string(profile_path()).ok()?).ok()
}

/// Persist the active summoner profile to disk so it survives app restarts.
pub fn write_cached_profile(profile: &crate::lcu::client::Summoner) -> std::io::Result<()> {
    if let Some(parent) = profile_path().parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(profile_path(), serde_json::to_string_pretty(profile).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_defaults() {
        let s = Settings::default();
        assert_eq!(s.close_behavior, "close");
        assert_eq!(s.startup_behavior, "none");
        assert_eq!(s.wallpaper_scope, "all_tabs");
        assert_eq!(s.auto_import_runes, false);
        assert_eq!(s.auto_import_spells, false);
        assert_eq!(s.auto_import_items, false);
        assert_eq!(s.flash_key, "D");
    }

    #[test]
    fn test_deserialize_empty_json_uses_new_defaults() {
        let json = "{}";
        let s: Settings = serde_json::from_str(json).expect("should deserialize");
        assert_eq!(s.close_behavior, "close");
        assert_eq!(s.startup_behavior, "none");
        assert_eq!(s.wallpaper_scope, "all_tabs");
        assert_eq!(s.auto_import_runes, false);
        assert_eq!(s.auto_import_spells, false);
        assert_eq!(s.auto_import_items, false);
        assert_eq!(s.flash_key, "D");
    }

    #[test]
    fn test_deserialize_preserves_custom_user_settings() {
        let json = r#"{
            "close_behavior": "minimize",
            "startup_behavior": "system_boot",
            "wallpaper_scope": "landing_only",
            "auto_import_runes": true,
            "auto_import_spells": true,
            "auto_import_items": true,
            "flash_key": "F"
        }"#;
        let s: Settings = serde_json::from_str(json).expect("should deserialize");
        assert_eq!(s.close_behavior, "minimize");
        assert_eq!(s.startup_behavior, "system_boot");
        assert_eq!(s.wallpaper_scope, "landing_only");
        assert_eq!(s.auto_import_runes, true);
        assert_eq!(s.auto_import_spells, true);
        assert_eq!(s.auto_import_items, true);
        assert_eq!(s.flash_key, "F");
    }
}

