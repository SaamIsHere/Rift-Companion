//! Minimal authenticated REST client for the LCU.
//!
//! The LCU serves HTTPS with a self-signed certificate on 127.0.0.1, secured by
//! HTTP Basic auth (`riot:<password>` from the lockfile). For a local prototype
//! we accept the self-signed cert; production code should pin Riot's root CA.

use std::sync::OnceLock;

use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::lcu::lockfile::Lockfile;

pub fn auth_header(lock: &Lockfile) -> String {
    let token = STANDARD.encode(format!("riot:{}", lock.password));
    format!("Basic {token}")
}

/// `reqwest::Client` owns a connection pool and TLS config, so it's built
/// once and reused rather than per-call — the LCU's port doesn't change for
/// the lifetime of a client session, and every call already targets 127.0.0.1.
fn http_client() -> Result<&'static reqwest::Client> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()?;
    Ok(CLIENT.get_or_init(|| client))
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

/// Active account's summoner profile, fetched on client connect (Issue #9, persisted in Issue #40).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Summoner {
    /// Riot ID ("Name#TAG") when available, falling back to the legacy `displayName`.
    pub display_name: String,
    pub level: u32,
    pub profile_icon_id: u32,
}

#[derive(serde::Deserialize)]
struct CurrentSummonerResponse {
    #[serde(default, rename = "gameName")]
    game_name: String,
    #[serde(default, rename = "tagLine")]
    tag_line: String,
    #[serde(default, rename = "displayName")]
    display_name: String,
    #[serde(default, rename = "summonerLevel")]
    summoner_level: u32,
    #[serde(default, rename = "profileIconId")]
    profile_icon_id: u32,
}

/// Fetch the active account's summoner name, level and profile icon.
/// Returns `None` if the endpoint can't be reached (e.g. client not fully signed in yet).
pub async fn get_current_summoner(lock: &Lockfile) -> Result<Option<Summoner>> {
    let client = http_client()?;
    let url = format!("https://127.0.0.1:{}/lol-summoner/v1/current-summoner", lock.port);
    let resp = client
        .get(url)
        .header("Authorization", auth_header(lock))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(None);
    }
    let raw: CurrentSummonerResponse = resp.json().await?;
    let display_name = if !raw.game_name.is_empty() {
        if raw.tag_line.is_empty() {
            raw.game_name
        } else {
            format!("{}#{}", raw.game_name, raw.tag_line)
        }
    } else {
        raw.display_name
    };
    Ok(Some(Summoner {
        display_name,
        level: raw.summoner_level,
        profile_icon_id: raw.profile_icon_id,
    }))
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
