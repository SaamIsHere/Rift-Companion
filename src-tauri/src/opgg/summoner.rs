//! OP.GG MCP Summoner Profile and Match History integration.

use anyhow::Result;
use serde_json::{json, Value};

use super::client::McpClient;

pub async fn fetch_profile(
    client: &McpClient,
    game_name: &str,
    tag_line: &str,
    region: &str,
) -> Result<Value> {
    client.initialize().await?;
    let fields = json!([
        "data.summoner.{level,game_name,tagline,profile_image_url}",
        "data.summoner.league_stats[].tier_info.{tier,division,lp,tier_image_url}",
        "data.summoner.league_stats[].{game_type,win,lose}",
        "data.summoner.most_champions.champion_stats[].{champion_name,id,play,win,lose,kill,death,assist,minion_kill,neutral_minion_kill,game_length_second}",
        "data.summoner.recent_champion_stats[].{champion_name,id,play,win,kill,death,assist}"
    ]);

    let args = json!({
        "game_name": game_name,
        "tag_line": tag_line,
        "region": region,
        "desired_output_fields": fields
    });

    client.call_tool("lol_get_summoner_profile", args).await
}

pub async fn fetch_matches(
    client: &McpClient,
    game_name: &str,
    tag_line: &str,
    region: &str,
    limit: usize,
) -> Result<Value> {
    client.initialize().await?;
    let fields = json!([
        "data.game_history[].{created_at,game_length_second,game_type,id}",
        "data.game_history[].participants[].{champion_id,champion_name,items[],position,spells[],team_key}",
        "data.game_history[].participants[].rune.{primary_page_id,primary_rune_id,secondary_page_id}",
        "data.game_history[].participants[].stats.{kill,death,assist,result,gold_earned,total_damage_dealt_to_champions,minion_kill,neutral_minion_kill,op_score,op_score_rank,champion_level,ward_place,vision_wards_bought_in_game}",
        "data.game_history[].participants[].summoner.{game_name,tagline,profile_image_url}",
        "data.game_history[].teams[].game_stat.{champion_kill,is_win,gold_earned}"
    ]);

    let capped_limit = limit.clamp(5, 20);
    let args = json!({
        "game_name": game_name,
        "tag_line": tag_line,
        "region": region,
        "limit": capped_limit,
        "desired_output_fields": fields
    });

    client.call_tool("lol_list_summoner_matches", args).await
}

pub async fn fetch_pro_player(
    client: &McpClient,
    player_name: &str,
    region: &str,
) -> Result<Value> {
    client.initialize().await?;
    let args = json!({
        "player_name": player_name,
        "region": region,
    });
    client.call_tool("lol_get_pro_player_riot_id", args).await
}

pub async fn fetch_game_detail(
    client: &McpClient,
    game_id: &str,
    region: &str,
    created_at: &str,
    focus_riot_id: Option<&str>,
) -> Result<Value> {
    client.initialize().await?;
    let mut args = json!({
        "game_id": game_id,
        "region": region,
        "created_at": created_at,
    });
    if let Some(focus) = focus_riot_id {
        args["focus_riot_id"] = json!(focus);
    }
    client.call_tool("lol_get_summoner_game_detail", args).await
}

/// Extract array of champion stats from either Next.js RSC payload or raw HTML
pub fn extract_champion_stats_from_text(text: &str) -> Vec<Value> {
    let clean = text.replace("\\\"", "\"").replace("\\\\", "\\");
    let pos = match clean.find("\"my_champion_stats\"") {
        Some(p) => p,
        None => return Vec::new(),
    };

    let start = match clean[pos..].find('[') {
        Some(s) => pos + s,
        None => return Vec::new(),
    };

    let mut depth = 0;
    let mut end = None;
    for (i, c) in clean[start..].char_indices() {
        if c == '[' {
            depth += 1;
        } else if c == ']' {
            depth -= 1;
            if depth == 0 {
                end = Some(start + i + 1);
                break;
            }
        }
    }

    let end = match end {
        Some(e) => e,
        None => return Vec::new(),
    };

    let arr: Value = match serde_json::from_str(&clean[start..end]) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    if let Some(list) = arr.as_array() {
        list.iter()
            .filter(|item| item.get("id").and_then(|id| id.as_i64()).unwrap_or(0) != 0)
            .cloned()
            .collect()
    } else {
        Vec::new()
    }
}

/// Fetch season champion statistics specifically for a given queue (e.g. "SOLORANKED", "FLEXRANKED")
pub async fn fetch_queue_champions(
    http: &reqwest::Client,
    game_name: &str,
    tag_line: &str,
    region: &str,
    queue_type: &str,
) -> Result<Vec<Value>> {
    let region_lower = region.to_lowercase();
    let enc_name = game_name.trim().replace(' ', "%20");
    let enc_tag = tag_line.trim().replace(' ', "%20");
    let url = format!(
        "https://op.gg/lol/summoners/{}/{}-{}/champions?queue_type={}",
        region_lower, enc_name, enc_tag, queue_type
    );

    for attempt in 0..2 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }

        let resp = http
            .get(&url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .header("Accept", "text/x-component, text/html, */*")
            .header("RSC", "1")
            .send()
            .await;

        let text = match resp {
            Ok(r) if r.status().is_success() => r.text().await.unwrap_or_default(),
            _ => String::new(),
        };

        let stats = extract_champion_stats_from_text(&text);
        if !stats.is_empty() {
            tracing::info!(
                "fetch_queue_champions [{queue_type}] attempt {}: extracted {} champions",
                attempt + 1,
                stats.len()
            );
            return Ok(stats);
        }

        // Fallback: If RSC payload didn't yield stats, try standard HTML request
        let html_resp = http
            .get(&url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await;

        if let Ok(r) = html_resp {
            if r.status().is_success() {
                let html_text = r.text().await.unwrap_or_default();
                let html_stats = extract_champion_stats_from_text(&html_text);
                if !html_stats.is_empty() {
                    tracing::info!(
                        "fetch_queue_champions [{queue_type}] HTML fallback: extracted {} champions",
                        html_stats.len()
                    );
                    return Ok(html_stats);
                }
            }
        }
    }

    tracing::warn!("fetch_queue_champions [{queue_type}] returned 0 champions for {}#{}", game_name, tag_line);
    Ok(Vec::new())
}

