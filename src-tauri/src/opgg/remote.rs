//! Client for fetching champion statistics and status from the Rift Server (NAS).

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::data::models::{Champion, RankTier};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub patch: Option<String>,
    pub last_updated: Option<u64>,
    pub crawling: bool,
    pub crawl_progress: Option<CrawlProgress>,
    #[serde(default)]
    pub tiers: serde_json::Value,
    #[serde(default)]
    pub supported_tiers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawlProgress {
    pub tier: String,
    pub done: u32,
    pub total: u32,
    pub champion: String,
}

/// Ping and retrieve status from the Rift Server.
pub async fn check_status(server_url: &str) -> Result<ServerStatus> {
    let url = format!("{}/api/status", server_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let res = client.get(&url).send().await.with_context(|| format!("connecting to {url}"))?;
    if !res.status().is_success() {
        bail!("server returned status: {}", res.status());
    }
    let status: ServerStatus = res.json().await.context("parsing server status response")?;
    Ok(status)
}

/// Fetch the pre-computed champion dataset for a specific rank tier from the Rift Server.
pub async fn fetch_stats(server_url: &str, tier: RankTier) -> Result<Vec<Champion>> {
    let url = format!("{}/api/stats?tier={}", server_url.trim_end_matches('/'), tier.as_opgg_tier());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let res = client.get(&url).send().await.with_context(|| format!("fetching stats from {url}"))?;
    if !res.status().is_success() {
        bail!("server returned status {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    let champions: Vec<Champion> = res.json().await.context("parsing champion dataset from server")?;
    Ok(champions)
}

/// Request the Rift Server to perform a refresh of its dataset.
pub async fn trigger_refresh(server_url: &str, tier: Option<&str>) -> Result<()> {
    let tier_param = tier.unwrap_or("all");
    let url = format!("{}/api/refresh?tier={tier_param}", server_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    let res = client.post(&url).send().await.with_context(|| format!("triggering refresh at {url}"))?;
    if !res.status().is_success() && res.status().as_u16() != 409 {
        bail!("server returned error: {}", res.text().await.unwrap_or_default());
    }
    Ok(())
}
