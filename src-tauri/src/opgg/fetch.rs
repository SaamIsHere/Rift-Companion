//! OP.GG → normalized `Champion[]` crawl (Rust port of scripts/ingest-opgg.mjs).

use std::collections::HashMap;

use anyhow::{Context, Result};
use serde_json::{json, Value};

use crate::data::models::{Champion, DamageType, Role, RoleStats, WinRateCell};
use crate::opgg::client::McpClient;

const DDRAGON: &str = "https://ddragon.leagueoflegends.com";
const SYNERGY_POSITIONS: [&str; 4] = ["jungle", "mid", "adc", "support"];

pub struct CrawlOpts {
    pub positions: Vec<String>,
    pub limit: usize,
    pub delay_ms: u64,
}

struct DdChamp {
    key: String,  // Data Dragon CamelCase key (icon), e.g. "MonkeyKing"
    name: String, // display name
    tags: Vec<String>,
}

/// Latest Data Dragon patch version (cheap; used for the staleness check).
pub async fn current_version() -> Result<String> {
    let http = reqwest::Client::builder().build()?;
    let versions: Vec<String> = http
        .get(format!("{DDRAGON}/api/versions.json"))
        .send()
        .await?
        .json()
        .await?;
    versions.into_iter().next().context("empty Data Dragon versions list")
}

async fn load_ddragon(http: &reqwest::Client) -> Result<(String, HashMap<u32, DdChamp>, HashMap<String, u32>)> {
    let version = {
        let v: Vec<String> = http.get(format!("{DDRAGON}/api/versions.json")).send().await?.json().await?;
        v.into_iter().next().context("empty Data Dragon versions list")?
    };
    let data: Value = http
        .get(format!("{DDRAGON}/cdn/{version}/data/en_US/champion.json"))
        .send()
        .await?
        .json()
        .await?;
    let mut by_id = HashMap::new();
    let mut resolve = HashMap::new();
    if let Some(map) = data.get("data").and_then(|d| d.as_object()) {
        for e in map.values() {
            let key = e.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let id: u32 = e.get("key").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()).unwrap_or(0);
            if id == 0 {
                continue;
            }
            let name = e.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let tags = e
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
                .unwrap_or_default();
            resolve.insert(key.clone(), id);
            resolve.insert(name.clone(), id);
            resolve.insert(champion_arg(&key), id);
            by_id.insert(id, DdChamp { key, name, tags });
        }
    }
    Ok((version, by_id, resolve))
}

/// Data Dragon CamelCase key → OP.GG UPPER_SNAKE champion argument (XinZhao → XIN_ZHAO).
fn champion_arg(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    let mut out = String::new();
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 && c.is_ascii_uppercase() {
            let prev = chars[i - 1];
            let next_lower = chars.get(i + 1).map(|n| n.is_ascii_lowercase()).unwrap_or(false);
            if prev.is_ascii_lowercase() || prev.is_ascii_digit() || (prev.is_ascii_uppercase() && next_lower) {
                out.push('_');
            }
        }
        out.push(c);
    }
    out.to_uppercase()
}

fn map_damage(d: &str) -> DamageType {
    match d {
        "AP" => DamageType::Magic,
        "BOTH" => DamageType::Mixed,
        _ => DamageType::Physical,
    }
}
fn round3(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}
fn role_from_key(k: &str) -> Option<Role> {
    Some(match k {
        "top" => Role::Top,
        "jungle" => Role::Jungle,
        "mid" => Role::Mid,
        "adc" => Role::Adc,
        "support" => Role::Support,
        _ => return None,
    })
}
fn uint(v: &Value, key: &str) -> Option<u32> {
    v.get(key).and_then(|x| x.as_u64()).map(|x| x as u32)
}

/// Crawl OP.GG for the requested positions and return `(patch, champions)`.
pub async fn crawl(opts: &CrawlOpts) -> Result<(String, Vec<Champion>)> {
    let http = reqwest::Client::builder().build()?;
    let (version, by_id, resolve) = load_ddragon(&http).await?;

    let mut mcp = McpClient::new()?;
    mcp.initialize().await?;

    let mut champs: HashMap<u32, Champion> = HashMap::new();
    let mut work: Vec<(u32, String, String)> = Vec::new(); // (id, role, ddragon key)

    // 1) Per-position roster + global win rate / games.
    for pos in &opts.positions {
        let fields: Vec<String> = ["champion", "win_rate", "play", "role_rate", "tier"]
            .iter()
            .map(|f| format!("data.positions.{pos}[].{f}"))
            .collect();
        let meta = mcp
            .call_tool("lol_list_lane_meta_champions", json!({ "position": pos, "desired_output_fields": fields }))
            .await?;
        let list = meta
            .pointer(&format!("/data/positions/{pos}"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut n = 0usize;
        for row in &list {
            if n >= opts.limit {
                break;
            }
            let id = match row.get("champion") {
                Some(Value::Number(num)) => num.as_u64().map(|x| x as u32),
                Some(Value::String(s)) => resolve.get(s).copied(),
                _ => None,
            };
            let Some(id) = id else { continue };
            let Some(dd) = by_id.get(&id) else { continue };
            let wr = row.get("win_rate").and_then(|v| v.as_f64()).unwrap_or(0.5);
            let games = uint(row, "play").unwrap_or(0);
            let rec = champs.entry(id).or_insert_with(|| Champion {
                champion_id: id,
                name: dd.name.clone(),
                image: dd.key.clone(),
                damage: DamageType::Physical,
                frontline: dd.tags.iter().any(|t| t == "Tank"),
                roles: Vec::new(),
                stats: HashMap::new(),
            });
            if let Some(role) = role_from_key(pos) {
                if !rec.roles.contains(&role) {
                    rec.roles.push(role);
                }
            }
            rec.stats.insert(
                pos.clone(),
                RoleStats { global_winrate: round3(wr), games, matchups: HashMap::new(), synergies: HashMap::new() },
            );
            work.push((id, pos.clone(), dd.key.clone()));
            n += 1;
        }
        tracing::debug!(position = %pos, champions = n, "opgg lane meta");
        tokio::time::sleep(std::time::Duration::from_millis(opts.delay_ms)).await;
    }

    // 2) Per (champion, role): damage type, matchups, synergies.
    let total = work.len();
    for (idx, (id, role, key)) in work.iter().enumerate() {
        let mut fields: Vec<String> = vec![
            "data.damage_type".into(),
            "data.strong_counters[].champion_id".into(),
            "data.strong_counters[].win_rate".into(),
            "data.strong_counters[].play".into(),
            "data.weak_counters[].champion_id".into(),
            "data.weak_counters[].win_rate".into(),
            "data.weak_counters[].play".into(),
        ];
        for sp in SYNERGY_POSITIONS {
            fields.push(format!("data.synergies.{sp}[].synergy_champion_id"));
            fields.push(format!("data.synergies.{sp}[].win_rate"));
            fields.push(format!("data.synergies.{sp}[].play"));
        }
        let args = json!({
            "game_mode": "ranked", "champion": champion_arg(key), "position": role,
            "desired_output_fields": fields
        });
        match mcp.call_tool("lol_get_champion_analysis", args).await {
            Ok(an) => {
                let d = an.get("data").cloned().unwrap_or(Value::Null);
                if let Some(c) = champs.get_mut(id) {
                    if let Some(dt) = d.get("damage_type").and_then(|v| v.as_str()) {
                        c.damage = map_damage(dt);
                    }
                    if let Some(rs) = c.stats.get_mut(role) {
                        // strong_counters: opponent's win rate → my WR = 1 - win_rate
                        for sc in d.get("strong_counters").and_then(|v| v.as_array()).into_iter().flatten() {
                            if let (Some(oid), Some(w)) = (uint(sc, "champion_id"), sc.get("win_rate").and_then(|v| v.as_f64())) {
                                rs.matchups.insert(oid, WinRateCell { winrate: round3(1.0 - w), games: uint(sc, "play").unwrap_or(0) });
                            }
                        }
                        // weak_counters: my win rate, used directly
                        for wc in d.get("weak_counters").and_then(|v| v.as_array()).into_iter().flatten() {
                            if let (Some(oid), Some(w)) = (uint(wc, "champion_id"), wc.get("win_rate").and_then(|v| v.as_f64())) {
                                rs.matchups.insert(oid, WinRateCell { winrate: round3(w), games: uint(wc, "play").unwrap_or(0) });
                            }
                        }
                        for sp in SYNERGY_POSITIONS {
                            for s in d.pointer(&format!("/synergies/{sp}")).and_then(|v| v.as_array()).into_iter().flatten() {
                                if let (Some(aid), Some(w)) = (uint(s, "synergy_champion_id"), s.get("win_rate").and_then(|v| v.as_f64())) {
                                    rs.synergies.insert(aid, WinRateCell { winrate: round3(w), games: uint(s, "play").unwrap_or(0) });
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => tracing::debug!("opgg analysis {key}/{role} failed: {e}"),
        }
        if (idx + 1) % 40 == 0 {
            tracing::info!("opgg analysis {}/{}", idx + 1, total);
        }
        tokio::time::sleep(std::time::Duration::from_millis(opts.delay_ms)).await;
    }

    let out: Vec<Champion> = champs.into_values().filter(|c| !c.stats.is_empty()).collect();
    Ok((version, out))
}
