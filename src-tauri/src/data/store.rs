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

use serde::{Deserialize, Serialize};

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
}

fn meta_path() -> PathBuf {
    let mut p = default_data_path();
    p.set_file_name("stats.meta.json");
    p
}

pub fn read_meta() -> Option<DatasetMeta> {
    serde_json::from_str(&std::fs::read_to_string(meta_path()).ok()?).ok()
}

pub fn write_meta(patch: &str, fetched_at: u64) -> std::io::Result<()> {
    let meta = DatasetMeta { patch: patch.to_string(), fetched_at };
    std::fs::write(meta_path(), serde_json::to_string_pretty(&meta).unwrap_or_default())
}
