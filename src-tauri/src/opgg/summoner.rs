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

