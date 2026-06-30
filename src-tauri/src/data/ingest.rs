//! Source-agnostic ingest: install a normalized champion-stats JSON as the
//! active dataset.
//!
//! The **normalized format is exactly the `Vec<Champion>` schema** documented in
//! `data::models` (the same shape as the embedded `stats.patch-*.json`). Any
//! data source — OP.GG, lolalytics, a Riot Match-V5 aggregation — only needs a
//! small adapter that emits this JSON; the importer, repository, and engine
//! never change. That keeps the choice of data provider a pluggable detail.

use anyhow::{Context, Result};

use crate::data::models::Champion;

/// Validate that `json` matches the normalized `Champion[]` schema.
pub fn validate(json: &str) -> Result<Vec<Champion>> {
    serde_json::from_str(json).context("normalized stats JSON did not match the Champion[] schema")
}

/// Validate a normalized JSON file and install it as the active dataset at
/// `out_path` (re-serialized to a canonical form). Returns the champion count.
/// Re-running with a new patch fully replaces the dataset.
pub fn build_file(json_path: &str, out_path: &str) -> Result<usize> {
    let raw = std::fs::read_to_string(json_path)
        .with_context(|| format!("reading normalized stats from {json_path}"))?;
    let champions = validate(&raw)?;
    if let Some(parent) = std::path::Path::new(out_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let canonical = serde_json::to_string_pretty(&champions)?;
    std::fs::write(out_path, canonical).with_context(|| format!("writing dataset to {out_path}"))?;
    Ok(champions.len())
}
