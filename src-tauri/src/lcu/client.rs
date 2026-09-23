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

/// Fetch active live match player list directly from League of Legends game client (`https://127.0.0.1:2999`).
pub async fn get_liveclient_playerlist() -> Result<Option<Vec<crate::lcu::models::LiveClientPlayer>>> {
    let client = http_client()?;
    let url = "https://127.0.0.1:2999/liveclientdata/playerlist";
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_millis(1000))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => Ok(Some(r.json().await?)),
        _ => Ok(None),
    }
}

/// Fetch active player info from League of Legends game client (`https://127.0.0.1:2999`).
pub async fn get_liveclient_activeplayer() -> Result<Option<crate::lcu::models::LiveClientActivePlayer>> {
    let client = http_client()?;
    let url = "https://127.0.0.1:2999/liveclientdata/activeplayer";
    let resp = client
        .get(url)
        .timeout(std::time::Duration::from_millis(1000))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => Ok(Some(r.json().await?)),
        _ => Ok(None),
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

/// Fetch summoner details (Riot ID gameName#tagLine) for a given PUUID via `/lol-summoner/v2/summoners/puuid/{puuid}`.
pub async fn get_summoner_by_puuid(lock: &Lockfile, puuid: &str) -> Result<Option<String>> {
    if puuid.is_empty() {
        return Ok(None);
    }
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-summoner/v2/summoners/puuid/{}",
        lock.port, puuid
    );
    let resp = client
        .get(url)
        .header("Authorization", auth_header(lock))
        .timeout(std::time::Duration::from_millis(1500))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(None);
    }
    let v: serde_json::Value = resp.json().await?;
    let game_name = v.get("gameName").and_then(|s| s.as_str()).unwrap_or("");
    let tag_line = v.get("tagLine").and_then(|s| s.as_str()).unwrap_or("");
    let display_name = v.get("displayName").and_then(|s| s.as_str()).unwrap_or("");

    if !game_name.is_empty() {
        if !tag_line.is_empty() {
            Ok(Some(format!("{}#{}", game_name, tag_line)))
        } else {
            Ok(Some(game_name.to_string()))
        }
    } else if !display_name.is_empty() {
        Ok(Some(display_name.to_string()))
    } else {
        Ok(None)
    }
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

/// Sets a rune page in the League of Legends client via LCU perks API.
pub async fn set_rune_page_in_lcu(
    lock: &Lockfile,
    name: &str,
    primary_style_id: u32,
    sub_style_id: u32,
    selected_perk_ids: &[u32],
) -> Result<bool> {
    let client = http_client()?;
    let pages_url = format!("https://127.0.0.1:{}/lol-perks/v1/pages", lock.port);

    let body = serde_json::json!({
        "name": name,
        "primaryStyleId": primary_style_id,
        "subStyleId": sub_style_id,
        "selectedPerkIds": selected_perk_ids,
        "current": true
    });

    // 1. Fetch current pages to find an existing editable page to overwrite
    let get_res = client
        .get(&pages_url)
        .header("Authorization", auth_header(lock))
        .send()
        .await;

    if let Ok(resp) = get_res {
        if resp.status().is_success() {
            if let Ok(pages) = resp.json::<Vec<serde_json::Value>>().await {
                let target_page = pages.iter().find(|p| {
                    p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(false)
                        && p.get("name").and_then(|v| v.as_str()).map(|n| n.starts_with("Rift")).unwrap_or(false)
                }).or_else(|| {
                    pages.iter().find(|p| {
                        p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(false)
                            && p.get("current").and_then(|v| v.as_bool()).unwrap_or(false)
                    })
                }).or_else(|| {
                    pages.iter().find(|p| {
                        p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(false)
                    })
                });

                if let Some(p) = target_page {
                    if let Some(id) = p.get("id").and_then(|v| v.as_i64()) {
                        let put_url = format!("https://127.0.0.1:{}/lol-perks/v1/pages/{}", lock.port, id);
                        let put_res = client
                            .put(&put_url)
                            .header("Authorization", auth_header(lock))
                            .json(&body)
                            .send()
                            .await;

                        if let Ok(put_resp) = put_res {
                            if put_resp.status().is_success() {
                                return Ok(true);
                            }
                        }

                        // If PUT wasn't accepted, try deleting and recreating
                        let _ = client
                            .delete(&put_url)
                            .header("Authorization", auth_header(lock))
                            .send()
                            .await;
                    }
                }
            }
        }
    }

    // 2. Fallback: POST a new page
    let post_resp = client
        .post(&pages_url)
        .header("Authorization", auth_header(lock))
        .json(&body)
        .send()
        .await?;

    Ok(post_resp.status().is_success())
}

/// Sets summoner spells in champ select via `/lol-champ-select/v1/session/my-selection`.
pub async fn set_summoner_spells_in_lcu(
    lock: &Lockfile,
    spell1_id: u64,
    spell2_id: u64,
) -> Result<bool> {
    let client = http_client()?;
    let url = format!(
        "https://127.0.0.1:{}/lol-champ-select/v1/session/my-selection",
        lock.port
    );
    let body = serde_json::json!({
        "spell1Id": spell1_id,
        "spell2Id": spell2_id
    });
    let resp = client
        .patch(url)
        .header("Authorization", auth_header(lock))
        .json(&body)
        .send()
        .await?;

    Ok(resp.status().is_success())
}

async fn save_item_sets_to_url(
    client: &reqwest::Client,
    lock: &Lockfile,
    target_id: u64,
    account_id: u64,
    champion_id: u32,
    set_title: &str,
    new_set: &serde_json::Value,
) -> Result<bool> {
    let sets_url = format!("https://127.0.0.1:{}/lol-item-sets/v1/item-sets/{}/sets", lock.port, target_id);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let get_res = client
        .get(&sets_url)
        .header("Authorization", auth_header(lock))
        .send()
        .await;

    let mut item_sets: Vec<serde_json::Value> = Vec::new();
    let mut root_account_id = account_id;

    if let Ok(resp) = get_res {
        if resp.status().is_success() {
            if let Ok(mut current_data) = resp.json::<serde_json::Value>().await {
                if let Some(acc) = current_data.get("accountId").and_then(|v| v.as_u64()) {
                    root_account_id = acc;
                }
                if let Some(existing_sets) = current_data.get_mut("itemSets").and_then(|v| v.as_array_mut()) {
                    existing_sets.retain(|s| {
                        let title = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
                        let champs = s.get("associatedChampions").and_then(|v| v.as_array());
                        let has_champ = champs.map(|c| c.iter().any(|cid| cid.as_u64() == Some(champion_id as u64))).unwrap_or(false);
                        !(title == set_title || (title.starts_with("Rift:") && has_champ))
                    });
                    item_sets = std::mem::take(existing_sets);
                }
            }
        }
    }

    item_sets.push(new_set.clone());

    let payload = serde_json::json!({
        "accountId": root_account_id,
        "itemSets": item_sets,
        "timestamp": now
    });

    let put_resp = client
        .put(&sets_url)
        .header("Authorization", auth_header(lock))
        .json(&payload)
        .send()
        .await;

    if let Ok(resp) = put_resp {
        if resp.status().is_success() {
            return Ok(true);
        }
    }

    let post_resp = client
        .post(&sets_url)
        .header("Authorization", auth_header(lock))
        .json(&payload)
        .send()
        .await?;

    Ok(post_resp.status().is_success())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ItemSetBlockInput {
    pub name: String,
    pub items: Vec<u64>,
}

/// Creates or updates a champion's item set via `/lol-item-sets/v1/item-sets/{summonerId}/sets`.
pub async fn set_item_set_in_lcu(
    lock: &Lockfile,
    champion_id: u32,
    champ_name: &str,
    blocks_input: Vec<ItemSetBlockInput>,
) -> Result<bool> {
    let client = http_client()?;

    let current_summoner_url = format!("https://127.0.0.1:{}/lol-summoner/v1/current-summoner", lock.port);
    let summoner_resp = client
        .get(&current_summoner_url)
        .header("Authorization", auth_header(lock))
        .send()
        .await?;

    if !summoner_resp.status().is_success() {
        return Ok(false);
    }

    let summoner_json: serde_json::Value = summoner_resp.json().await?;
    let summoner_id = summoner_json.get("summonerId").and_then(|v| v.as_u64()).unwrap_or(0);
    let account_id = summoner_json.get("accountId").and_then(|v| v.as_u64()).unwrap_or(summoner_id);

    if summoner_id == 0 && account_id == 0 {
        return Ok(false);
    }

    let mut blocks = Vec::new();

    for block in blocks_input {
        if !block.items.is_empty() {
            let items: Vec<serde_json::Value> = block
                .items
                .iter()
                .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
                .collect();
            blocks.push(serde_json::json!({
                "type": block.name,
                "items": items
            }));
        }
    }

    let set_title = format!("Rift: {}", champ_name);
    let new_set = serde_json::json!({
        "title": set_title,
        "type": "custom",
        "associatedChampions": [champion_id],
        "associatedMaps": [11, 12],
        "map": "any",
        "mode": "any",
        "priority": true,
        "sortrank": 1,
        "blocks": blocks
    });

    if summoner_id > 0 {
        if let Ok(true) = save_item_sets_to_url(client, lock, summoner_id, account_id, champion_id, &set_title, &new_set).await {
            return Ok(true);
        }
    }

    if account_id > 0 && account_id != summoner_id {
        if let Ok(true) = save_item_sets_to_url(client, lock, account_id, account_id, champion_id, &set_title, &new_set).await {
            return Ok(true);
        }
    }

    Ok(false)
}
