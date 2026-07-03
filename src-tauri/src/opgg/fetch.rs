//! OP.GG → normalized `Champion[]` crawl (Rust port of scripts/ingest-opgg.mjs).

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::{stream, StreamExt};
use serde_json::{json, Value};

use crate::data::models::{Champion, DamageType, RankTier, Role, RoleStats, WinRateCell};
use crate::opgg::client::McpClient;

const DDRAGON: &str = "https://ddragon.leagueoflegends.com";
const SYNERGY_POSITIONS: [&str; 4] = ["jungle", "mid", "adc", "support"];

/// Below this many recorded games at the selected tier, a champion/role's
/// matchup+synergy sample is too thin to trust — re-fetch it at Emerald+
/// instead so niche ranks don't ship empty-looking cards (Issue #13).
const MIN_TIER_SAMPLE_GAMES: u64 = 300;

/// Max in-flight `lol_get_champion_analysis` requests during the per-champion
/// crawl step. OP.GG's MCP endpoint responds slowly (~3s/call observed), so a
/// fully sequential crawl of the whole roster took 10-15 minutes with nothing
/// but a static "refreshing" indicator — bounded concurrency cuts that down
/// substantially while staying reasonably polite to a free third-party API.
const ANALYSIS_CONCURRENCY: usize = 6;

pub struct CrawlOpts {
    pub positions: Vec<String>,
    pub limit: usize,
    pub delay_ms: u64,
    pub tier: RankTier,
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
fn analysis_args(key: &str, role: &str, tier: RankTier, fields: &[String]) -> Value {
    json!({
        "game_mode": "ranked", "champion": champion_arg(key), "position": role,
        "tier": tier.as_opgg_tier(), "desired_output_fields": fields
    })
}

/// Crawl OP.GG for the requested positions and return `(patch, champions)`.
/// `on_progress(done, total)` is called after each per-champion analysis
/// fetch completes, so callers can surface live progress instead of a
/// static "refreshing" indicator for what can be a multi-minute crawl.
pub async fn crawl(opts: &CrawlOpts, mut on_progress: impl FnMut(usize, usize)) -> Result<(String, Vec<Champion>)> {
    let http = reqwest::Client::builder().build()?;
    let (version, by_id, resolve) = load_ddragon(&http).await?;

    let mcp = McpClient::new()?;
    mcp.initialize().await?;
    // Shared across the concurrent analysis fetches below so they reuse one
    // MCP session instead of each caller needing its own client/handshake.
    let mcp = Arc::new(mcp);

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

    // 2) Per (champion, role): damage type, matchups, synergies — filtered to
    // the selected rank tier (`lol_get_champion_analysis` is the only OP.GG
    // tool in this crawl that accepts a `tier` argument; the lane-meta roster
    // call above has no such parameter). Fetched with bounded concurrency
    // (`ANALYSIS_CONCURRENCY` in-flight at a time) since each call is
    // network-latency-bound, not CPU-bound — merging results back into
    // `champs` stays single-threaded since `buffer_unordered` yields
    // completions one at a time to this loop.
    let total = work.len();
    let tier = opts.tier;
    let mut analysis_stream = stream::iter(work.into_iter().map(|(id, role, key)| {
        let mcp = mcp.clone();
        async move {
            let mut fields: Vec<String> = vec![
                "data.damage_type".into(),
                "data.summary.average_stats.play".into(),
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

            let mut d = match mcp.call_tool("lol_get_champion_analysis", analysis_args(&key, &role, tier, &fields)).await {
                Ok(an) => an.get("data").cloned().unwrap_or(Value::Null),
                Err(e) => {
                    tracing::debug!("opgg analysis {key}/{role} failed: {e}");
                    return (id, role, Value::Null);
                }
            };

            // Sparse sample at a niche tier: fall back to the Emerald+ default
            // rather than shipping a near-empty matchup/synergy card.
            let sample = d.pointer("/summary/average_stats/play").and_then(|v| v.as_u64()).unwrap_or(0);
            if tier != RankTier::EmeraldPlus && sample < MIN_TIER_SAMPLE_GAMES {
                tracing::debug!(champion = %key, %role, tier = tier.as_opgg_tier(), sample, "sparse tier sample; falling back to emerald_plus");
                match mcp.call_tool("lol_get_champion_analysis", analysis_args(&key, &role, RankTier::EmeraldPlus, &fields)).await {
                    Ok(an) => d = an.get("data").cloned().unwrap_or(Value::Null),
                    Err(e) => tracing::debug!("opgg fallback analysis {key}/{role} failed: {e}"),
                }
            }

            (id, role, d)
        }
    }))
    .buffer_unordered(ANALYSIS_CONCURRENCY);

    let mut done = 0usize;
    while let Some((id, role, d)) = analysis_stream.next().await {
        done += 1;
        on_progress(done, total);

        if let Some(c) = champs.get_mut(&id) {
            if let Some(dt) = d.get("damage_type").and_then(|v| v.as_str()) {
                c.damage = map_damage(dt);
            }
            if let Some(rs) = c.stats.get_mut(&role) {
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

        if done % 40 == 0 || done == total {
            tracing::info!("opgg analysis {}/{}", done, total);
        }
    }

    let out: Vec<Champion> = champs.into_values().filter(|c| !c.stats.is_empty()).collect();
    Ok((version, out))
}
