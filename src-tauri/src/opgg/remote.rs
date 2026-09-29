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

pub const DEFAULT_PRESHARED_API_KEY: &str = "";

fn client_with_auth(timeout_secs: u64, api_key: Option<&str>) -> Result<reqwest::Client> {
    let mut headers = reqwest::header::HeaderMap::new();
    let key = api_key.unwrap_or(DEFAULT_PRESHARED_API_KEY);
    if !key.trim().is_empty() {
        if let Ok(val) = reqwest::header::HeaderValue::from_str(key.trim()) {
            headers.insert("X-Rift-Key", val);
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .default_headers(headers)
        .build()?;
    Ok(client)
}

/// Ping and retrieve status from the Rift Server.
pub async fn check_status(server_url: &str, api_key: Option<&str>) -> Result<ServerStatus> {
    let url = format!("{}/api/status", server_url.trim_end_matches('/'));
    let client = client_with_auth(5, api_key)?;
    let res = client.get(&url).send().await.with_context(|| format!("connecting to {url}"))?;
    if !res.status().is_success() {
        bail!("server returned status: {}", res.status());
    }
    let status: ServerStatus = res.json().await.context("parsing server status response")?;
    Ok(status)
}

/// Fetch the pre-computed champion dataset for a specific rank tier from the Rift Server.
pub async fn fetch_stats(server_url: &str, tier: RankTier, api_key: Option<&str>) -> Result<Vec<Champion>> {
    let url = format!("{}/api/stats?tier={}", server_url.trim_end_matches('/'), tier.as_opgg_tier());
    let client = client_with_auth(15, api_key)?;
    let res = client.get(&url).send().await.with_context(|| format!("fetching stats from {url}"))?;
    if !res.status().is_success() {
        bail!("server returned status {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    let champions: Vec<Champion> = res.json().await.context("parsing champion dataset from server")?;
    Ok(champions)
}

/// Request the Rift Server to perform a refresh of its dataset.
pub async fn trigger_refresh(server_url: &str, tier: Option<&str>, api_key: Option<&str>) -> Result<()> {
    let tier_param = tier.unwrap_or("all");
    let url = format!("{}/api/refresh?tier={tier_param}", server_url.trim_end_matches('/'));
    let client = client_with_auth(5, api_key)?;
    let res = client.post(&url).send().await.with_context(|| format!("triggering refresh at {url}"))?;
    if !res.status().is_success() && res.status().as_u16() != 409 {
        bail!("server returned error: {}", res.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Fetch build data for a single champion and role from the Rift Server.
pub async fn fetch_build(
    server_url: &str,
    champion_slug: &str,
    role: &str,
    tier: RankTier,
    api_key: Option<&str>,
) -> Result<crate::data::models::ChampionBuildStats> {
    let url = format!(
        "{}/api/build?champion={}&role={}&tier={}",
        server_url.trim_end_matches('/'),
        champion_slug,
        role,
        tier.as_opgg_tier()
    );
    let client = client_with_auth(3, api_key)?;
    let res = client.get(&url).send().await.with_context(|| format!("fetching build from {url}"))?;
    if !res.status().is_success() {
        bail!("server returned status: {}", res.status());
    }
    #[derive(Deserialize)]
    struct BuildResponse {
        build: Option<crate::data::models::ChampionBuildStats>,
    }
    let body: BuildResponse = res.json().await.context("parsing build response from server")?;
    body.build.ok_or_else(|| anyhow::anyhow!("no build found in response"))
}

/// Query the Rift Server for a previously saved match detail.
pub async fn get_cached_match(
    server_url: &str,
    game_id: &str,
    api_key: Option<&str>,
) -> Result<Option<serde_json::Value>> {
    let clean_id = game_id.trim();
    let url = format!("{}/api/match/{}", server_url.trim_end_matches('/'), clean_id);
    let client = client_with_auth(3, api_key)?;
    let res = client.get(&url).send().await?;
    if res.status().as_u16() == 404 {
        return Ok(None);
    }
    if !res.status().is_success() {
        bail!("server returned error {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    let data: serde_json::Value = res.json().await?;
    Ok(Some(data))
}

/// Store/log a match detail on the Rift Server.
pub async fn save_cached_match(
    server_url: &str,
    game_id: &str,
    detail: &serde_json::Value,
    api_key: Option<&str>,
) -> Result<()> {
    let clean_id = game_id.trim();
    let url = format!("{}/api/match/{}", server_url.trim_end_matches('/'), clean_id);
    let client = client_with_auth(5, api_key)?;
    let res = client.post(&url).json(detail).send().await?;
    if !res.status().is_success() {
        bail!("failed to save match to server {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Query the Rift Server for a previously saved player profile & matches.
pub async fn get_cached_profile(
    server_url: &str,
    game_name: &str,
    tag_line: &str,
    region: &str,
    api_key: Option<&str>,
) -> Result<Option<serde_json::Value>> {
    let url = format!("{}/api/profile", server_url.trim_end_matches('/'));
    let client = client_with_auth(3, api_key)?;
    let res = client
        .get(&url)
        .query(&[("name", game_name), ("tag", tag_line), ("region", region)])
        .send()
        .await?;
    if res.status().as_u16() == 404 {
        return Ok(None);
    }
    if !res.status().is_success() {
        bail!("server returned error {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    let data: serde_json::Value = res.json().await?;
    Ok(Some(data))
}

/// Store/log a player profile & matches on the Rift Server.
pub async fn save_cached_profile(
    server_url: &str,
    payload: &serde_json::Value,
    api_key: Option<&str>,
) -> Result<()> {
    let url = format!("{}/api/profile", server_url.trim_end_matches('/'));
    let client = client_with_auth(5, api_key)?;
    let res = client.post(&url).json(payload).send().await?;
    if !res.status().is_success() {
        bail!("failed to save profile to server {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    Ok(())
}


