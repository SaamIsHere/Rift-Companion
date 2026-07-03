//! Minimal authenticated REST client for the LCU.
//!
//! The LCU serves HTTPS with a self-signed certificate on 127.0.0.1, secured by
//! HTTP Basic auth (`riot:<password>` from the lockfile). For a local prototype
//! we accept the self-signed cert; production code should pin Riot's root CA.

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::lcu::lockfile::Lockfile;

pub fn auth_header(lock: &Lockfile) -> String {
    let token = STANDARD.encode(format!("riot:{}", lock.password));
    format!("Basic {token}")
}

fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()?)
}

/// Fetch the current champ-select session, if any (404 → not in champ select).
pub async fn get_session(lock: &Lockfile) -> Result<Option<serde_json::Value>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-champ-select/v1/session",
        lock.port
    );
    let resp = client
        .get(url)
        .header("Authorization", auth_header(lock))
        .send()
        .await?;

    if resp.status().is_success() {
        Ok(Some(resp.json().await?))
    } else {
        Ok(None)
    }
}

#[derive(serde::Deserialize)]
struct RankedStats {
    #[serde(rename = "queueMap", default)]
    queue_map: std::collections::HashMap<String, QueueRank>,
}
#[derive(serde::Deserialize)]
struct QueueRank {
    #[serde(default)]
    tier: String,
}

/// Fetch the local player's current Ranked Solo/Duo tier (`"IRON"`.."CHALLENGER"`),
/// for defaulting the rank-tier dropdown (Issue #13). Returns `None` if the
/// player is unranked or the endpoint can't be reached.
pub async fn get_ranked_solo_tier(lock: &Lockfile) -> Result<Option<String>> {
    let client = http_client()?;
    let url = format!("https://127.0.0.1:{}/lol-ranked/v1/current-ranked-stats", lock.port);
    let resp = client
        .get(url)
        .header("Authorization", auth_header(lock))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(None);
    }
    let stats: RankedStats = resp.json().await?;
    Ok(stats
        .queue_map
        .get("RANKED_SOLO_5x5")
        .map(|q| q.tier.clone())
        .filter(|t| !t.is_empty() && t != "NONE"))
}
