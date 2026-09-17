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

/// Fetch the current gameflow phase ("ChampSelect", "GameStart", "InProgress", "None", etc.).
pub async fn get_gameflow_phase(lock: &Lockfile) -> Result<Option<String>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-gameflow/v1/gameflow-phase",
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

/// Fetch the current gameflow session, if any.
pub async fn get_gameflow_session(lock: &Lockfile) -> Result<Option<serde_json::Value>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-gameflow/v1/session",
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
    #[serde(default)]
    pub puuid: String,
    #[serde(default)]
    pub game_name: String,
    #[serde(default)]
    pub tag_line: String,
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
    #[serde(default)]
    puuid: String,
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
            raw.game_name.clone()
        } else {
            format!("{}#{}", raw.game_name, raw.tag_line)
        }
    } else {
        raw.display_name.clone()
    };
    Ok(Some(Summoner {
        display_name,
        level: raw.summoner_level,
        profile_icon_id: raw.profile_icon_id,
        puuid: raw.puuid,
        game_name: raw.game_name,
        tag_line: raw.tag_line,
    }))
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RankedQueueEntry {
    pub queue_type: String,
    pub tier: String,
    pub division: String,
    pub league_points: i32,
    pub wins: i32,
    pub losses: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct RankedOverview {
    pub solo: Option<RankedQueueEntry>,
    pub flex: Option<RankedQueueEntry>,
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
    #[serde(default)]
    division: String,
    #[serde(default, rename = "leaguePoints")]
    league_points: i32,
    #[serde(default)]
    wins: i32,
    #[serde(default)]
    losses: i32,
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

/// Fetch full Ranked Solo and Flex statistics for the local account.
pub async fn get_all_ranked_stats(lock: &Lockfile) -> Result<Option<RankedOverview>> {
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

    let map_entry = |key: &str| -> Option<RankedQueueEntry> {
        let q = stats.queue_map.get(key)?;
        if q.tier.is_empty() || q.tier == "NONE" {
            return None;
        }
        Some(RankedQueueEntry {
            queue_type: key.to_string(),
            tier: q.tier.clone(),
            division: q.division.clone(),
            league_points: q.league_points,
            wins: q.wins,
            losses: q.losses,
        })
    };

    Ok(Some(RankedOverview {
        solo: map_entry("RANKED_SOLO_5x5"),
        flex: map_entry("RANKED_FLEX_SR"),
    }))
}

/// Fetch full game detail for a specific gameId from local LCU API.
pub async fn get_local_game_detail(
    lock: &Lockfile,
    game_id: u64,
) -> Result<Option<serde_json::Value>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-match-history/v1/games/{}",
        lock.port, game_id
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

/// Fetch recent match history list directly from local LCU API,
/// augmented with full 10-player participant data.
pub async fn get_local_matches(
    lock: &Lockfile,
    beg_index: usize,
    end_index: usize,
) -> Result<Option<serde_json::Value>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-match-history/v1/products/lol/current-summoner/matches?begIndex={}&endIndex={}",
        lock.port, beg_index, end_index
    );
    let resp = client
        .get(url)
        .header("Authorization", auth_header(lock))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let mut val: serde_json::Value = resp.json().await?;

    // Enhance each game in the list with full 10-player data from /lol-match-history/v1/games/{id}
    if let Some(games) = val.get_mut("games").and_then(|g| g.get_mut("games")).and_then(|g| g.as_array_mut()) {
        let game_ids: Vec<u64> = games
            .iter()
            .filter_map(|g| g.get("gameId").and_then(|id| id.as_u64()))
            .collect();

        if !game_ids.is_empty() {
            let mut tasks = Vec::new();
            for gid in &game_ids {
                tasks.push(get_local_game_detail(lock, *gid));
            }
            let results = futures_util::future::join_all(tasks).await;

            for (i, res) in results.into_iter().enumerate() {
                if let Ok(Some(full_detail)) = res {
                    if let Some(target_game) = games.get_mut(i) {
                        if let Some(parts) = full_detail.get("participants") {
                            target_game["participants"] = parts.clone();
                        }
                        if let Some(idents) = full_detail.get("participantIdentities") {
                            target_game["participantIdentities"] = idents.clone();
                        }
                        if let Some(teams) = full_detail.get("teams") {
                            target_game["teams"] = teams.clone();
                        }
                    }
                }
            }
        }
    }

    Ok(Some(val))
}

/// Fetch local player champion mastery list from LCU.
pub async fn get_local_champion_mastery(lock: &Lockfile) -> Result<Option<serde_json::Value>> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-champion-mastery/v1/local-player/champion-mastery",
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

/// Hover a champion in the League of Legends client during champ select (without locking in).
pub async fn hover_champion_in_lcu(lock: &Lockfile, champion_id: u32) -> Result<bool> {
    let client = http_client()?;
    let session_val = match get_session(lock).await? {
        Some(v) => v,
        None => return Ok(false),
    };

    let local_cell = match session_val.get("localPlayerCellId").and_then(|v| v.as_i64()) {
        Some(c) => c,
        None => return Ok(false),
    };

    let actions = match session_val.get("actions").and_then(|v| v.as_array()) {
        Some(a) => a,
        None => return Ok(false),
    };

    let mut target_action_id = None;
    for round in actions {
        if let Some(round_actions) = round.as_array() {
            for a in round_actions {
                let actor = a.get("actorCellId").and_then(|v| v.as_i64()).unwrap_or(-1);
                let action_type = a.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let completed = a.get("completed").and_then(|v| v.as_bool()).unwrap_or(false);
                let in_progress = a.get("isInProgress").and_then(|v| v.as_bool()).unwrap_or(false);
                if actor == local_cell && action_type == "pick" && !completed {
                    let id = a.get("id").and_then(|v| v.as_i64());
                    if in_progress {
                        target_action_id = id;
                        break;
                    } else if target_action_id.is_none() {
                        target_action_id = id;
                    }
                }
            }
        }
        if target_action_id.is_some() {
            break;
        }
    }

    let action_id = match target_action_id {
        Some(id) => id,
        None => return Ok(false),
    };

    let url = format!(
        "https://127.0.0.1:{}/lol-champ-select/v1/session/actions/{}",
        lock.port, action_id
    );

    let body = serde_json::json!({
        "championId": champion_id,
        "completed": false
    });

    let resp = client
        .patch(url)
        .header("Authorization", auth_header(lock))
        .json(&body)
        .send()
        .await?;

    Ok(resp.status().is_success())
}
