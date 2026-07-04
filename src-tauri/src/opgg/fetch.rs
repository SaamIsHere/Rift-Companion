//! OP.GG → normalized `Champion[]` crawl (Rust port of scripts/ingest-opgg.mjs).

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::{stream, StreamExt};
use serde_json::{json, Value};

use crate::data::models::{Champion, DamageType, RankTier, Role, RoleStats, WinRateCell};
use crate::opgg::client::McpClient;

const DDRAGON: &str = "https://ddragon.leagueoflegends.com";
/// All 5 lanes; the crawl loop skips the subject's own position (querying
/// `lol_get_champion_synergies` for `my_position === synergy_position` isn't
/// meaningful). Omitting "top" here silently dropped every top-lane synergy
/// cell from the dataset (Issue #20) back when this list fed the embedded
/// `data.synergies.<pos>` field instead of the dedicated synergies tool.
const SYNERGY_POSITIONS: [&str; 5] = ["top", "jungle", "mid", "adc", "support"];

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
fn synergy_args(key: &str, my_position: &str, synergy_position: &str, fields: &[String]) -> Value {
    json!({
        "champion": champion_arg(key), "my_position": my_position,
        "synergy_position": synergy_position, "desired_output_fields": fields
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
            let fields: Vec<String> = vec![
                "data.damage_type".into(),
                "data.summary.average_stats.play".into(),
                "data.strong_counters[].champion_id".into(),
                "data.strong_counters[].win_rate".into(),
                "data.strong_counters[].play".into(),
                "data.weak_counters[].champion_id".into(),
                "data.weak_counters[].win_rate".into(),
                "data.weak_counters[].play".into(),
                "data.summary.positions[].counters[].champion_id".into(),
                "data.summary.positions[].counters[].win".into(),
                "data.summary.positions[].counters[].play".into(),
            ];

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

            // The main analysis call's embedded `data.synergies.*` field only
            // returns ~3 partners per ally lane; the dedicated
            // `lol_get_champion_synergies` tool returns ~10 for the same
            // pairing (verified live: Lucian/adc's support synergies went
            // from {Yuumi, Leona, Nautilus} to 10 entries including Braum) —
            // worth 4 extra calls per champion/role to meaningfully widen the
            // hover preview's (Issue #17) ally-side coverage.
            let synergy_fields = vec![
                "data.synergies[].synergy_champion_id".to_string(),
                "data.synergies[].win_rate".to_string(),
                "data.synergies[].play".to_string(),
            ];
            let mut synergies = serde_json::Map::new();
            for sp in SYNERGY_POSITIONS.iter().filter(|&&sp| sp != role.as_str()) {
                match mcp.call_tool("lol_get_champion_synergies", synergy_args(&key, &role, sp, &synergy_fields)).await {
                    Ok(res) => {
                        if let Some(list) = res.pointer("/data/synergies").cloned() {
                            synergies.insert((*sp).to_string(), list);
                        }
                    }
                    Err(e) => tracing::debug!("opgg synergies {key}/{role} vs {sp} failed: {e}"),
                }
            }
            if let Some(obj) = d.as_object_mut() {
                obj.insert("synergies".to_string(), Value::Object(synergies));
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
                merge_matchups(&mut rs.matchups, &d);
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

    let mut out: Vec<Champion> = champs.into_values().filter(|c| !c.stats.is_empty()).collect();
    for c in out.iter_mut() {
        order_roles_by_play(c);
    }
    Ok((version, out))
}

/// Order `roles` by per-role game count, most-played first. `roles[0]` is the
/// champion's *primary* role (`Repository::primary_role`), which is what infers
/// hidden enemy positions in drafts — so it must reflect actual play volume,
/// not the fixed top→support position-crawl order above, which tagged every
/// champion appearing in the top roster as "top-primary" (e.g. Xin Zhao top
/// over jungle at 15k vs 61k games — Issue #19).
fn order_roles_by_play(c: &mut Champion) {
    let Champion { roles, stats, .. } = c;
    roles.sort_by_key(|r| std::cmp::Reverse(stats.get(r.as_key()).map_or(0, |s| s.games)));
}

/// Merge one champion/role's OP.GG counters analysis (`data`, the value at
/// `lol_get_champion_analysis`'s `data` key) into `matchups`.
///
/// `strong_counters`/`weak_counters` both report the *favoured* side's win
/// rate, not necessarily the subject's own — verified live against
/// mcp-api.op.gg (Issue #17/#18): a champion and its opponent report the
/// *identical* win_rate + play for the same matchup, e.g. Ezreal's
/// weak_counters lists Yasuo at 0.58/1413 games, and Yasuo's own
/// strong_counters lists Ezreal at that same 0.58/1413 — so 0.58 is Yasuo's
/// win rate in both places, not Ezreal's. The subject IS the favoured side
/// in `strong_counters` (used directly), but the opponent is in
/// `weak_counters` (inverted for the subject's own rate). Getting this
/// backwards (the bug, pre-fix) made every genuine counter-pick show up as a
/// "rough matchup" and vice versa.
///
/// `strong_counters`/`weak_counters` only cover ~6 champions total (top 3
/// each), which starved the hover preview (Issue #17) of data for almost any
/// opponent that isn't a standout matchup. `summary.positions[].counters`
/// reports the subject's own raw win/play counts directly (no polarity
/// ambiguity) for a separate top-3 list that often names different
/// opponents — merged in to fill gaps without overwriting the
/// already-classified strong/weak cells above.
fn merge_matchups(matchups: &mut HashMap<u32, WinRateCell>, data: &Value) {
    for sc in data.get("strong_counters").and_then(|v| v.as_array()).into_iter().flatten() {
        if let (Some(oid), Some(w)) = (uint(sc, "champion_id"), sc.get("win_rate").and_then(|v| v.as_f64())) {
            matchups.insert(oid, WinRateCell { winrate: round3(w), games: uint(sc, "play").unwrap_or(0) });
        }
    }
    for wc in data.get("weak_counters").and_then(|v| v.as_array()).into_iter().flatten() {
        if let (Some(oid), Some(w)) = (uint(wc, "champion_id"), wc.get("win_rate").and_then(|v| v.as_f64())) {
            matchups.insert(oid, WinRateCell { winrate: round3(1.0 - w), games: uint(wc, "play").unwrap_or(0) });
        }
    }
    for pos in data.pointer("/summary/positions").and_then(|v| v.as_array()).into_iter().flatten() {
        for c in pos.get("counters").and_then(|v| v.as_array()).into_iter().flatten() {
            if let (Some(oid), Some(play)) = (uint(c, "champion_id"), uint(c, "play")) {
                if play == 0 {
                    continue;
                }
                let win = uint(c, "win").unwrap_or(0);
                matchups
                    .entry(oid)
                    .or_insert_with(|| WinRateCell { winrate: round3(win as f64 / play as f64), games: play });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_are_ordered_by_play_volume() {
        // Lux-shaped case from the real dataset: crawled as mid first (position
        // order), but actually a support main by nearly 2:1 games.
        let mut c = Champion {
            champion_id: 99,
            name: "Lux".into(),
            image: "Lux".into(),
            damage: DamageType::Magic,
            frontline: false,
            roles: vec![Role::Mid, Role::Adc, Role::Support],
            stats: HashMap::from([
                ("mid".to_string(), RoleStats { global_winrate: 0.5, games: 64_688, matchups: HashMap::new(), synergies: HashMap::new() }),
                ("adc".to_string(), RoleStats { global_winrate: 0.5, games: 5_141, matchups: HashMap::new(), synergies: HashMap::new() }),
                ("support".to_string(), RoleStats { global_winrate: 0.5, games: 111_132, matchups: HashMap::new(), synergies: HashMap::new() }),
            ]),
        };
        order_roles_by_play(&mut c);
        assert_eq!(c.roles, vec![Role::Support, Role::Mid, Role::Adc]);
    }

    #[test]
    fn merge_matchups_orients_counters_toward_the_subject() {
        // Real response captured live from mcp-api.op.gg for
        // lol_get_champion_analysis(champion: EZREAL, position: adc):
        // Yasuo/Senna are Ezreal's *weak_counters* (Ezreal is disadvantaged),
        // Varus is a *strong_counters* entry (Ezreal is favoured), and Lux
        // only appears in the separate positions[].counters[] list. Issue #18
        // was filed because the pre-fix code inverted the wrong list, so
        // Yasuo/Senna (genuine counters to Ezreal) scored as good picks *for*
        // Ezreal instead of bad ones.
        let data: Value = serde_json::from_str(
            r#"{
                "strong_counters": [{"champion_id": 110, "win_rate": 0.51, "play": 3460}],
                "weak_counters": [
                    {"champion_id": 157, "win_rate": 0.58, "play": 1413},
                    {"champion_id": 235, "win_rate": 0.57, "play": 11838}
                ],
                "summary": {
                    "positions": [{
                        "name": "ADC",
                        "counters": [
                            {"champion_id": 157, "champion_name": "Yasuo", "play": 1413, "win": 598},
                            {"champion_id": 235, "champion_name": "Senna", "play": 11838, "win": 5145},
                            {"champion_id": 99, "champion_name": "Lux", "play": 1032, "win": 449}
                        ]
                    }]
                }
            }"#,
        )
        .unwrap();

        let mut matchups = HashMap::new();
        merge_matchups(&mut matchups, &data);

        // weak_counters: Ezreal is disadvantaged, so his own win rate is the
        // *inverse* of the listed (favoured, i.e. Yasuo's/Senna's) win rate.
        assert_eq!(matchups[&157].winrate, round3(1.0 - 0.58), "Yasuo should be a bad matchup for Ezreal");
        assert_eq!(matchups[&235].winrate, round3(1.0 - 0.57), "Senna should be a bad matchup for Ezreal");
        // strong_counters: Ezreal is favoured, so his own win rate is used directly.
        assert_eq!(matchups[&110].winrate, 0.51, "Varus should stay a good matchup for Ezreal");
        // positions[].counters[] gap-fill: raw win/play, unambiguous.
        assert_eq!(matchups[&99].winrate, round3(449.0 / 1032.0), "Lux should be filled in from the positions counters list");
    }

    #[test]
    fn merge_matchups_does_not_overwrite_strong_or_weak_classification() {
        // positions[].counters[] must only fill gaps, never override the
        // already-oriented strong/weak cells above it, even if it happens to
        // re-list the same opponent (as OP.GG's real data sometimes does).
        let data: Value = serde_json::from_str(
            r#"{
                "strong_counters": [],
                "weak_counters": [{"champion_id": 157, "win_rate": 0.58, "play": 1413}],
                "summary": {
                    "positions": [{
                        "name": "ADC",
                        "counters": [{"champion_id": 157, "champion_name": "Yasuo", "play": 1413, "win": 598}]
                    }]
                }
            }"#,
        )
        .unwrap();

        let mut matchups = HashMap::new();
        merge_matchups(&mut matchups, &data);

        assert_eq!(matchups[&157].winrate, round3(1.0 - 0.58), "weak_counters classification must win over the gap-fill list");
    }

    /// Live check for Issue #20: OP.GG must return `data.synergies.top` when
    /// asked, for a non-top subject. Run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "network: hits the live OP.GG MCP endpoint"]
    async fn opgg_exposes_top_lane_synergies_for_a_jungler() {
        let mcp = McpClient::new().unwrap();
        mcp.initialize().await.unwrap();
        let mut fields: Vec<String> = Vec::new();
        for sp in SYNERGY_POSITIONS {
            fields.push(format!("data.synergies.{sp}[].synergy_champion_id"));
            fields.push(format!("data.synergies.{sp}[].win_rate"));
            fields.push(format!("data.synergies.{sp}[].play"));
        }
        let res = mcp
            .call_tool("lol_get_champion_analysis", analysis_args("LeeSin", "jungle", RankTier::EmeraldPlus, &fields))
            .await
            .expect("analysis call");
        let top = res.pointer("/data/synergies/top").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        assert!(!top.is_empty(), "OP.GG returned no top-lane synergies for a jungler: {res}");
    }

    /// Live end-to-end check for Issues #19/#20 on a scoped crawl.
    /// Run with `cargo test -- --ignored` (takes ~30-60s).
    #[tokio::test]
    #[ignore = "network: runs a scoped live crawl against OP.GG + Data Dragon"]
    async fn scoped_crawl_orders_roles_and_stores_top_synergies() {
        let opts = CrawlOpts {
            positions: ["top", "jungle", "mid", "adc", "support"].iter().map(|s| s.to_string()).collect(),
            limit: 10,
            delay_ms: 150,
            tier: RankTier::EmeraldPlus,
        };
        let (_patch, champs) = crawl(&opts, |_, _| {}).await.expect("scoped crawl");
        assert!(!champs.is_empty(), "crawl produced no champions");

        // Issue #19: every champion's roles must be ordered most-played first.
        for c in &champs {
            let games: Vec<u32> = c.roles.iter().map(|r| c.stats.get(r.as_key()).map_or(0, |s| s.games)).collect();
            assert!(
                games.windows(2).all(|w| w[0] >= w[1]),
                "{}: roles {:?} not ordered by games {:?}",
                c.name,
                c.roles,
                games
            );
        }

        // Issue #20: OP.GG returns up to 3 synergy partners per ally lane. With
        // "top" missing from SYNERGY_POSITIONS, a jungle-only champion could
        // collect at most 9 synergy cells (mid/adc/support); with it included,
        // 12. So at least one jungle-only champion clearing 9 proves top-lane
        // synergies actually flow through the whole crawl pipeline.
        let cleared = champs
            .iter()
            .filter(|c| c.stats.contains_key("jungle") && !c.stats.contains_key("top"))
            .any(|c| c.stats["jungle"].synergies.len() > 9);
        assert!(cleared, "no jungle-only champion stored more than 9 synergy cells — top-lane synergies missing");
    }
}
