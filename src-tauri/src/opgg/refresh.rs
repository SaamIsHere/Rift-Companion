//! Background task that keeps the champion dataset current.
//!
//! On startup and then periodically, it checks whether the on-disk dataset is
//! stale — a new patch is live, the selected rank tier changed, or the data
//! is older than [`MAX_AGE_SECS`] — and if so re-crawls OP.GG, persists the
//! result (+ a metadata sidecar), and hot-reloads the in-memory [`Repository`]
//! so an open champ-select updates live. [`trigger_refresh`] exposes the same
//! crawl-and-swap logic to manual (dropdown) and LCU-auto-detected rank
//! changes, which need it to run immediately rather than on the next tick.

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::data::models::RankTier;
use crate::data::repository::Repository;
use crate::data::store;
use crate::engine;
use crate::opgg::fetch::{self, CrawlOpts};
use crate::Shared;

const POSITIONS: [&str; 5] = ["top", "jungle", "mid", "adc", "support"];
const MAX_AGE_SECS: u64 = 24 * 3600; // refresh at least daily
const CHECK_INTERVAL_SECS: u64 = 6 * 3600; // re-check a few times a day while running

pub async fn run_refresher(app: AppHandle, shared: Shared) {
    loop {
        if let Err(e) = tick(&app, &shared).await {
            tracing::warn!("champion-data refresh failed: {e:#}");
        }
        tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;
    }
}

async fn tick(app: &AppHandle, shared: &Shared) -> anyhow::Result<()> {
    let tier = *shared.rank_tier.lock().unwrap();
    let version = fetch::current_version().await?;
    let stale = match store::read_meta() {
        None => true,
        Some(m) => m.patch != version || m.tier != tier || store::now_unix().saturating_sub(m.fetched_at) >= MAX_AGE_SECS,
    };
    if !stale {
        tracing::info!(patch = %version, tier = tier.as_opgg_tier(), "champion data is up to date");
        return Ok(());
    }
    refresh_now(app, shared, tier).await
}

/// Crawl OP.GG for `tier`, persist it as the active dataset, hot-swap the
/// in-memory repository, and re-rank the current draft (if any). Shared by
/// the periodic ticker and by manual/auto-detected rank changes.
pub async fn refresh_now(app: &AppHandle, shared: &Shared, tier: RankTier) -> anyhow::Result<()> {
    // Serialize crawls: a periodic tick and a rank change triggered at nearly
    // the same moment must not hit OP.GG concurrently.
    let _guard = shared.refresh_lock.lock().await;

    let version = fetch::current_version().await?;
    tracing::info!(patch = %version, tier = tier.as_opgg_tier(), "refreshing champion data from OP.GG (this runs in the background)...");
    let limit = std::env::var("RIFT_OPGG_LIMIT").ok().and_then(|s| s.parse().ok()).unwrap_or(usize::MAX);
    let opts = CrawlOpts {
        positions: POSITIONS.iter().map(|s| s.to_string()).collect(),
        limit,
        delay_ms: 150,
        tier,
    };
    let (patch, champions) = fetch::crawl(&opts, |done, total| {
        let _ = app.emit("rank-refresh://progress", serde_json::json!({ "done": done, "total": total }));
    })
    .await?;
    if champions.is_empty() {
        anyhow::bail!("crawl produced 0 champions; keeping the existing dataset");
    }
    let count = champions.len();

    // Persist for next launch, then hot-reload the in-memory index.
    let path = store::default_data_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, serde_json::to_string_pretty(&champions)?)?;
    let manual = *shared.rank_manual.lock().unwrap();
    store::write_meta(&patch, store::now_unix(), tier, manual)?;

    let repo = Repository::from_champions(champions);
    *shared.repo.lock().unwrap() = Arc::new(repo);
    tracing::info!(patch = %patch, tier = tier.as_opgg_tier(), champions = count, "champion data refreshed");

    // Re-rank the current draft, if any, so a live champ-select picks up the new data.
    let draft = shared.latest_draft.lock().unwrap().clone();
    if let Some(d) = draft {
        let repo = shared.repo.lock().unwrap().clone();
        let weights = shared.weights.lock().unwrap();
        let recs = engine::recommend(repo.as_ref(), &d, &weights);
        let _ = app.emit("recommendations://update", &recs);
    }
    Ok(())
}

/// Fire-and-forget wrapper around [`refresh_now`] for callers that can't
/// await it directly (a Tauri command handler, the LCU watcher loop). Emits
/// `"rank://update"` immediately (the caller has already committed `tier` to
/// `shared.rank_tier` — the selection itself doesn't wait on the crawl) and
/// `"rank-refresh://status"` (`"refreshing"` → `"idle"`/`"error"`) around the
/// crawl, so the frontend dropdown reflects the active tier right away instead
/// of only after a multi-minute background crawl finishes.
pub fn trigger_refresh(app: AppHandle, shared: Shared, tier: RankTier) {
    let _ = app.emit("rank://update", tier);
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("rank-refresh://status", "refreshing");
        match refresh_now(&app, &shared, tier).await {
            Ok(()) => {
                let _ = app.emit("rank-refresh://status", "idle");
            }
            Err(e) => {
                tracing::warn!("rank refresh failed: {e:#}");
                let _ = app.emit("rank-refresh://status", "error");
            }
        }
    });
}
