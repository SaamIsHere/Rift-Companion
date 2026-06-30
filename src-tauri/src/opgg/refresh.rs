//! Background task that keeps the champion dataset current.
//!
//! On startup and then periodically, it checks whether the on-disk dataset is
//! stale — a new patch is live, or the data is older than [`MAX_AGE_SECS`] — and
//! if so re-crawls OP.GG, persists the result (+ a metadata sidecar), and
//! hot-reloads the in-memory [`Repository`] so an open champ-select updates live.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};

use crate::data::repository::Repository;
use crate::data::store;
use crate::engine;
use crate::opgg::fetch::{self, CrawlOpts};
use crate::Shared;

const POSITIONS: [&str; 5] = ["top", "jungle", "mid", "adc", "support"];
const MAX_AGE_SECS: u64 = 24 * 3600; // refresh at least daily
const CHECK_INTERVAL_SECS: u64 = 6 * 3600; // re-check a few times a day while running

fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub async fn run_refresher(app: AppHandle, shared: Shared) {
    loop {
        if let Err(e) = tick(&app, &shared).await {
            tracing::warn!("champion-data refresh failed: {e:#}");
        }
        tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;
    }
}

async fn tick(app: &AppHandle, shared: &Shared) -> anyhow::Result<()> {
    let version = fetch::current_version().await?;
    let stale = match store::read_meta() {
        None => true,
        Some(m) => m.patch != version || now_unix().saturating_sub(m.fetched_at) >= MAX_AGE_SECS,
    };
    if !stale {
        tracing::info!(patch = %version, "champion data is up to date");
        return Ok(());
    }

    tracing::info!(patch = %version, "refreshing champion data from OP.GG (this runs in the background)...");
    let limit = std::env::var("RIFT_OPGG_LIMIT").ok().and_then(|s| s.parse().ok()).unwrap_or(usize::MAX);
    let opts = CrawlOpts {
        positions: POSITIONS.iter().map(|s| s.to_string()).collect(),
        limit,
        delay_ms: 150,
    };
    let (patch, champions) = fetch::crawl(&opts).await?;
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
    store::write_meta(&patch, now_unix())?;

    let repo = Repository::from_champions(champions);
    *shared.repo.lock().unwrap() = Arc::new(repo);
    tracing::info!(patch = %patch, champions = count, "champion data refreshed");

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
