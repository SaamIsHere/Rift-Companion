//! TFT (Teamfight Tactics) backend module for Rift Companion.

pub mod models;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;
use anyhow::{bail, Result};

use self::models::{TftAugment, TftItem, TftMetaDeck};

static META_DECKS_CACHE: Mutex<Option<(Vec<TftMetaDeck>, Instant)>> = Mutex::new(None);
static ITEMS_CACHE: Mutex<Option<(Vec<TftItem>, Instant)>> = Mutex::new(None);
static AUGMENTS_CACHE: Mutex<Option<(Vec<TftAugment>, Instant)>> = Mutex::new(None);

/// Path to cached TFT meta decks on disk.
pub fn tft_meta_path() -> PathBuf {
    let mut p = crate::data::store::default_data_path();
    p.set_file_name("tft_meta.json");
    p
}

/// Load TFT meta decks from disk if present, or seed from embedded Set 18 data and write to disk.
/// Sanitizes board unit coordinates to guarantee all units are placed on distinct cells.
pub fn sanitize_decks(mut decks: Vec<TftMetaDeck>) -> Vec<TftMetaDeck> {
    for deck in &mut decks {
        let mut used = std::collections::HashSet::new();
        let mut has_collisions = false;
        for u in &deck.units {
            if u.cell.x < 1 || u.cell.x > 7 || u.cell.y < 1 || u.cell.y > 4 {
                has_collisions = true;
                break;
            }
            if !used.insert((u.cell.x, u.cell.y)) {
                has_collisions = true;
                break;
            }
        }
        if has_collisions {
            used.clear();
            let mut need_placement = Vec::new();
            for (idx, u) in deck.units.iter().enumerate() {
                if u.cell.x >= 1 && u.cell.x <= 7 && u.cell.y >= 1 && u.cell.y <= 4 && used.insert((u.cell.x, u.cell.y)) {
                    continue;
                }
                need_placement.push(idx);
            }
            let front_cols = [4, 3, 5, 2, 6, 1, 7];
            let back_cols = [1, 7, 2, 6, 3, 5, 4];
            for idx in need_placement {
                let is_front = idx % 2 == 0;
                let rows: [u8; 4] = if is_front { [4, 3, 2, 1] } else { [1, 2, 3, 4] };
                let cols = if is_front { front_cols } else { back_cols };
                'outer: for y in rows {
                    for x in cols {
                        if used.insert((x, y)) {
                            deck.units[idx].cell = models::TftBoardCell { x, y };
                            break 'outer;
                        }
                    }
                }
            }
        }
    }
    decks
}

pub fn load_or_seed_meta_decks() -> Vec<TftMetaDeck> {
    let path = tft_meta_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(decks) = serde_json::from_str::<Vec<TftMetaDeck>>(&content) {
                if !decks.is_empty() {
                    return sanitize_decks(decks);
                }
            }
        }
    }

    let fallback = sanitize_decks(get_fallback_meta_decks());
    if !fallback.is_empty() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&fallback) {
            let _ = std::fs::write(&path, json);
        }
    }
    fallback
}

/// Synchronize TFT meta data from the Rift Server, cache to disk, and update in-memory state.
pub async fn sync_from_server(server_url: &str, api_key: Option<&str>) -> Result<Vec<TftMetaDeck>> {
    let raw_decks = crate::opgg::remote::fetch_tft_meta(server_url, api_key).await?;
    let decks = sanitize_decks(raw_decks);
    if !decks.is_empty() {
        let path = tft_meta_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&decks) {
            let _ = std::fs::write(&path, json);
        }
        let mut cache = META_DECKS_CACHE.lock().unwrap();
        *cache = Some((decks.clone(), Instant::now()));
        tracing::info!(decks = decks.len(), "synchronized TFT meta decks from Rift Server");
        return Ok(decks);
    }
    bail!("server returned 0 TFT decks")
}

pub async fn fetch_meta_decks(_lang: Option<&str>) -> Result<Vec<TftMetaDeck>> {
    // Check in-memory cache first (0ms latency on tab switch)
    {
        let cache = META_DECKS_CACHE.lock().unwrap();
        if let Some((ref data, _)) = *cache {
            return Ok(data.clone());
        }
    }

    // Load from disk cache or seed from embedded Set 18 dataset
    let fetched = load_or_seed_meta_decks();

    // Update in-memory cache
    {
        let mut cache = META_DECKS_CACHE.lock().unwrap();
        *cache = Some((fetched.clone(), Instant::now()));
    }

    Ok(fetched)
}

pub async fn fetch_item_combinations(_lang: Option<&str>) -> Result<Vec<TftItem>> {
    {
        let cache = ITEMS_CACHE.lock().unwrap();
        if let Some((ref data, _)) = *cache {
            return Ok(data.clone());
        }
    }

    let items = get_fallback_items();
    {
        let mut cache = ITEMS_CACHE.lock().unwrap();
        *cache = Some((items.clone(), Instant::now()));
    }

    Ok(items)
}

pub async fn fetch_augments(_lang: Option<&str>) -> Result<Vec<TftAugment>> {
    {
        let cache = AUGMENTS_CACHE.lock().unwrap();
        if let Some((ref data, _)) = *cache {
            return Ok(data.clone());
        }
    }

    let augments = get_fallback_augments();
    {
        let mut cache = AUGMENTS_CACHE.lock().unwrap();
        *cache = Some((augments.clone(), Instant::now()));
    }

    Ok(augments)
}

static SET18_DATA_JSON: &str = include_str!("set18_data.json");
static SET18_ITEMS_JSON: &str = include_str!("set18_items.json");
static SET18_AUGMENTS_JSON: &str = include_str!("set18_augments.json");

/// Authentic, high-fidelity meta compositions representing current top tier TFT Set 18 compositions
/// from TFT Academy with full 4x7 hex board positioning, itemization, traits, and leveling tempo.
pub fn get_fallback_meta_decks() -> Vec<TftMetaDeck> {
    match serde_json::from_str::<Vec<TftMetaDeck>>(SET18_DATA_JSON) {
        Ok(decks) => decks,
        Err(e) => {
            tracing::error!("Failed to parse embedded Set 18 TFT data: {e}");
            Vec::new()
        }
    }
}

/// Complete TFT item recipes matrix: all 10 basic components + full combinations.
pub fn get_fallback_items() -> Vec<TftItem> {
    match serde_json::from_str::<Vec<TftItem>>(SET18_ITEMS_JSON) {
        Ok(items) => items,
        Err(e) => {
            tracing::error!("Failed to parse embedded Set 18 items data: {e}");
            Vec::new()
        }
    }
}

pub fn get_fallback_augments() -> Vec<TftAugment> {
    match serde_json::from_str::<Vec<TftAugment>>(SET18_AUGMENTS_JSON) {
        Ok(augments) => augments,
        Err(e) => {
            tracing::error!("Failed to parse embedded Set 18 augments data: {e}");
            Vec::new()
        }
    }
}
