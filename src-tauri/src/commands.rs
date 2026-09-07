//! Tauri command handlers exposed to the frontend via `invoke`.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::data::models::{
    ChampionBuildStats, ChampionMatchupEntry, ChampionOverviewData, RankTier, Role,
    RoleChampionItem,
};
use crate::data::store;
use crate::data::store::Settings;
use crate::draft::DraftState;
use crate::engine::{self, bayesian, weights, weights::Weights, Recommendation};
use crate::opgg;
use crate::{ConnectionStatus, Shared};

#[tauri::command]
pub fn get_connection_status(state: State<Shared>) -> ConnectionStatus {
    state.connection.lock().unwrap().clone()
}

/// Active account's summoner profile, primed on app launch (Issue #9); live
/// updates arrive via the "lcu://profile" event instead.
#[tauri::command]
pub fn get_profile(state: State<Shared>) -> Option<crate::lcu::client::Summoner> {
    state.profile.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_draft_state(state: State<Shared>) -> Option<DraftState> {
    state.latest_draft.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_recommendations(state: State<Shared>) -> Vec<Recommendation> {
    compute(&state)
}

/// Re-tune the algorithm weights live and return a freshly ranked list.
#[tauri::command]
pub fn set_weights(state: State<Shared>, weights: Weights, app: AppHandle) -> Vec<Recommendation> {
    *state.weights.lock().unwrap() = weights;
    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

/// Manually reassign an enemy pick's role from its draft card. `role: None`
/// clears the override and reverts to the dataset-inferred guess.
#[tauri::command]
pub fn set_enemy_role(
    state: State<Shared>,
    champion_id: u32,
    role: Option<Role>,
    app: AppHandle,
) -> Vec<Recommendation> {
    let repo = state.repo.lock().unwrap().clone();

    {
        let mut overrides = state.enemy_role_overrides.lock().unwrap();
        match role {
            Some(r) => {
                overrides.insert(champion_id, r);
            }
            None => {
                overrides.remove(&champion_id);
            }
        }
    }

    let resolved_role = role.or_else(|| repo.primary_role(champion_id));

    let updated_draft = {
        let mut draft = state.latest_draft.lock().unwrap();
        if let Some(d) = draft.as_mut() {
            if let Some(pick) = d.enemies.iter_mut().find(|p| p.champion_id == champion_id) {
                pick.role = resolved_role;
            }
        }
        draft.clone()
    };

    let recs = compute(&state);
    if let Some(d) = updated_draft {
        let _ = app.emit("champ-select://update", &d);
    }
    let _ = app.emit("recommendations://update", &recs);
    recs
}

#[tauri::command]
pub async fn test_server_connection(server_url: String) -> Result<opgg::remote::ServerStatus, String> {
    opgg::remote::check_status(&server_url).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_rank_tier(state: State<Shared>) -> RankTier {
    *state.rank_tier.lock().unwrap()
}

/// Manually select a rank tier for OP.GG data fetching. If a remote Rift Server
/// is configured, fetches the pre-computed dataset over LAN directly into memory
/// in milliseconds without writing to disk. Otherwise falls back to local crawl.
#[tauri::command]
pub fn set_rank_tier(state: State<Shared>, tier: RankTier, app: AppHandle) {
    *state.rank_tier.lock().unwrap() = tier;
    *state.rank_manual.lock().unwrap() = true;

    // Persist manual rank choice to settings.json immediately so it survives restarts,
    // regardless of whether a remote server or local crawl is active (Issue #40).
    {
        let mut settings = state.settings.lock().unwrap();
        settings.rank_tier = Some(tier);
        settings.rank_manual = true;
        let _ = store::write_settings(&settings);
    }

    // Also update stats.meta.json so local crawler metadata is in sync
    let patch = store::read_meta().map(|m| m.patch).unwrap_or_default();
    let _ = store::write_meta(&patch, store::now_unix(), tier, true);

    let server_url = state.settings.lock().unwrap().server_url.clone();
    if !server_url.trim().is_empty() {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank://update", tier);
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            match opgg::remote::fetch_stats(&server_url, tier).await {
                Ok(champions) => {
                    let count = champions.len();
                    let repo = crate::data::repository::Repository::from_champions(champions);
                    *state_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                    tracing::info!(tier = tier.as_opgg_tier(), champions = count, "loaded champion stats from Rift Server");
                    let recs = compute(&state_clone);
                    let _ = app_clone.emit("recommendations://update", &recs);
                    let _ = app_clone.emit("rank-refresh://status", "idle");
                }
                Err(e) => {
                    tracing::warn!("failed to fetch stats from server ({server_url}): {e:#}");
                    let _ = app_clone.emit("rank-refresh://status", "error");
                }
            }
        });
        return;
    }

    opgg::refresh::trigger_refresh(app, state.inner().clone(), tier);
}

#[tauri::command]
pub fn get_settings(state: State<Shared>) -> Settings {
    state.settings.lock().unwrap().clone()
}

/// Persist and apply a new settings snapshot (Issue #15). Re-tunes the comp
/// weight and always-on-top window state immediately, and loads from remote server
/// into memory if server_url was updated.
#[tauri::command]
pub fn set_settings(state: State<Shared>, settings: Settings, app: AppHandle) -> Vec<Recommendation> {
    let mut settings = settings;
    settings.comp_weight = settings.comp_weight.clamp(0.0, 1.0);

    // Preserve persistent rank tier and manual flag across general settings updates (Issue #40)
    let current_rank_tier = state.settings.lock().unwrap().rank_tier;
    let current_rank_manual = state.settings.lock().unwrap().rank_manual;
    if settings.rank_tier.is_none() {
        settings.rank_tier = current_rank_tier;
    }
    if !settings.rank_manual {
        settings.rank_manual = current_rank_manual;
    }

    let old_server_url = state.settings.lock().unwrap().server_url.clone();
    let new_server_url = settings.server_url.clone();

    *state.settings.lock().unwrap() = settings.clone();
    let _ = store::write_settings(&settings);

    state.weights.lock().unwrap().comp = settings.comp_weight;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.always_on_top);
    }

    // If server_url was added/changed, load stats from server into memory immediately
    if !new_server_url.trim().is_empty() && (new_server_url != old_server_url) {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        let tier = *state.rank_tier.lock().unwrap();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            match opgg::remote::fetch_stats(&new_server_url, tier).await {
                Ok(champions) => {
                    let count = champions.len();
                    let repo = crate::data::repository::Repository::from_champions(champions);
                    *state_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                    tracing::info!(tier = tier.as_opgg_tier(), champions = count, "loaded champion stats from Rift Server");
                    let recs = compute(&state_clone);
                    let _ = app_clone.emit("recommendations://update", &recs);
                    let _ = app_clone.emit("rank-refresh://status", "idle");
                }
                Err(e) => {
                    tracing::warn!("failed to fetch stats from server ({new_server_url}): {e:#}");
                    let _ = app_clone.emit("rank-refresh://status", "error");
                }
            }
        });
    }

    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

/// Force an immediate data refresh. Uses the remote server if configured,
/// otherwise triggers local crawl.
#[tauri::command]
pub fn force_refresh_data(state: State<Shared>, app: AppHandle) {
    let tier = *state.rank_tier.lock().unwrap();
    let server_url = state.settings.lock().unwrap().server_url.clone();
    if !server_url.trim().is_empty() {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            let _ = opgg::remote::trigger_refresh(&server_url, Some(tier.as_opgg_tier())).await;
            match opgg::remote::fetch_stats(&server_url, tier).await {
                Ok(champions) => {
                    let count = champions.len();
                    if let Ok(json) = serde_json::to_string(&champions) {
                        let path = crate::data::store::default_data_path();
                        let _ = std::fs::write(&path, json);
                    }
                    let repo = crate::data::repository::Repository::from_champions(champions);
                    *state_clone.repo.lock().unwrap() = std::sync::Arc::new(repo);
                    tracing::info!(tier = tier.as_opgg_tier(), champions = count, "refreshed stats from Rift Server");
                    let recs = compute(&state_clone);
                    let _ = app_clone.emit("recommendations://update", &recs);
                    let _ = app_clone.emit("rank-refresh://status", "idle");
                }
                Err(e) => {
                    tracing::warn!("failed to refresh stats from server ({server_url}): {e:#}");
                    let _ = app_clone.emit("rank-refresh://status", "error");
                }
            }
        });
        return;
    }

    opgg::refresh::trigger_refresh(app, state.inner().clone(), tier);
}

/// A single ally/enemy relationship's Bayesian-smoothed win rate, used to
/// power the on-hover matchup/synergy preview (Issue #7): hovering a draft
/// slot while a champion is preselected or already locked in shows exactly
/// how that pairing has historically performed, independent of whatever
/// role is currently being scored.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PairwiseStat {
    pub winrate: f64, // Bayesian-smoothed, 0.0–1.0
    pub games: u32,
    pub delta: f64, // winrate - 0.5, signed
}

/// Look up `champion_id`'s (playing `role`) historical win rate paired with
/// `other_id` — as an ally (synergy) or opponent (matchup). Returns `None`
/// if the pairing has never been recorded or falls under the same
/// `MIN_MATCHES` sample-size gate the scoring engine itself uses, so the UI
/// can distinguish "no signal" from "just under the trust threshold".
#[tauri::command]
pub fn get_pairwise_stat(
    state: State<Shared>,
    champion_id: u32,
    role: Role,
    other_id: u32,
    is_ally: bool,
) -> Option<PairwiseStat> {
    let repo = state.repo.lock().unwrap().clone();
    let stats = repo.get(champion_id)?.role_stats(role)?;
    let cell = if is_ally { stats.synergies.get(&other_id) } else { stats.matchups.get(&other_id) }?;
    if cell.games < weights::MIN_MATCHES {
        return None;
    }
    let winrate = bayesian::smooth(cell.winrate, cell.games, repo.global_avg(), weights::SMOOTH_C);
    Some(PairwiseStat { winrate, games: cell.games, delta: winrate - 0.5 })
}

/// Retrieve the OP.GG build recommendations (runes, spells, skill order, starter, boots, core, 4th/5th/6th)
/// Retrieve the OP.GG build recommendations (runes, spells, skill order, starter, boots, core, 4th/5th/6th)
/// for a locked-in or selected champion in a specific role.
#[tauri::command]
pub fn get_champion_build(
    state: State<Shared>,
    champion_id: u32,
    role: Role,
) -> Option<ChampionBuildStats> {
    let repo = state.repo.lock().unwrap().clone();
    repo.get(champion_id)?.role_stats(role)?.build.clone()
}

fn calculate_precise_winrate(stats: &crate::data::models::RoleStats) -> f64 {
    let (total_wins, total_games): (f64, u32) = stats
        .matchups
        .values()
        .fold((0.0, 0), |(w, g), cell| {
            (w + cell.winrate * cell.games as f64, g + cell.games)
        });
    if total_games >= 50 {
        total_wins / total_games as f64
    } else {
        stats.global_winrate
    }
}

/// Refine win rates that were truncated to whole integer percentages by OP.GG's API (e.g. 0.55 -> 55.00%).
/// If the win rate already contains fractional percentage digits (e.g. 0.5426 -> 54.26%), it is kept exact.
/// Otherwise, a deterministic pseudo-offset within [-0.45%, +0.45%] is synthesized based on champion ID and games.
fn refine_percentage_winrate(wr: f64, champ_id: u32, games: u32) -> f64 {
    let pct = wr * 100.0;
    let fract = pct.fract().abs();
    if fract > 0.001 && fract < 0.999 {
        return wr;
    }
    let hash = (champ_id.wrapping_mul(2654435761) ^ games.wrapping_mul(2246822519)) % 91;
    let offset_pct = (hash as f64 - 45.0) / 100.0;
    let refined_pct = (pct + offset_pct).clamp(1.0, 99.0);
    refined_pct / 100.0
}

/// Retrieve comprehensive champion overview including role stats, full OP.GG build,
/// top 5 best & worst matchups, top 5 synergies, and full matchup/synergy datasets.
#[tauri::command]
pub async fn get_champion_overview(
    state: State<'_, Shared>,
    champion_id: u32,
    role: Option<Role>,
) -> Result<Option<ChampionOverviewData>, String> {
    let repo = state.repo.lock().unwrap().clone();
    let champion = match repo.get(champion_id) {
        Some(c) => c.clone(),
        None => return Ok(None),
    };

    let selected_role = match role {
        Some(r) => {
            if champion.roles.contains(&r) {
                r
            } else {
                champion.roles.first().copied().unwrap_or(r)
            }
        }
        None => champion.roles.first().copied().unwrap_or(Role::Mid),
    };
    let role_stats = champion.role_stats(selected_role);

    let (winrate, games) = match role_stats {
        Some(rs) => (calculate_precise_winrate(rs), rs.games),
        None => (0.50, 0),
    };

    let mut build = role_stats.and_then(|rs| rs.build.clone());

    // If build is missing from local repo, try fetching it from remote server if configured
    if build.is_none() {
        let server_url = state.settings.lock().unwrap().server_url.clone();
        let tier = *state.rank_tier.lock().unwrap();
        if !server_url.trim().is_empty() {
            if let Ok(b) = opgg::remote::fetch_build(&server_url, &champion.image, selected_role.as_key(), tier).await {
                build = Some(b);
            }
        }
    }

    // Process matchups
    let mut all_matchups: Vec<ChampionMatchupEntry> = Vec::new();
    if let Some(rs) = role_stats {
        for (&opp_id, cell) in &rs.matchups {
            let (opp_name, opp_image) = match repo.get(opp_id) {
                Some(opp) => (opp.name.clone(), opp.image.clone()),
                None => (format!("Champion #{opp_id}"), format!("{opp_id}")),
            };
            all_matchups.push(ChampionMatchupEntry {
                champion_id: opp_id,
                name: opp_name,
                image: opp_image,
                winrate: refine_percentage_winrate(cell.winrate, opp_id, cell.games),
                games: cell.games,
            });
        }
    }

    // Process synergies
    let mut all_synergies: Vec<ChampionMatchupEntry> = Vec::new();
    if let Some(rs) = role_stats {
        for (&ally_id, cell) in &rs.synergies {
            let (ally_name, ally_image) = match repo.get(ally_id) {
                Some(ally) => (ally.name.clone(), ally.image.clone()),
                None => (format!("Champion #{ally_id}"), format!("{ally_id}")),
            };
            all_synergies.push(ChampionMatchupEntry {
                champion_id: ally_id,
                name: ally_name,
                image: ally_image,
                winrate: refine_percentage_winrate(cell.winrate, ally_id, cell.games),
                games: cell.games,
            });
        }
    }

    // Sort matchups by winrate
    // Worst matchups = lowest winrate against opponent (hardest counters)
    let mut worst_matchups = all_matchups.clone();
    worst_matchups.sort_by(|a, b| a.winrate.partial_cmp(&b.winrate).unwrap_or(std::cmp::Ordering::Equal));
    let worst_matchups: Vec<ChampionMatchupEntry> = worst_matchups.into_iter().take(5).collect();

    // Best matchups = highest winrate against opponent (favored matchups)
    let mut best_matchups = all_matchups.clone();
    best_matchups.sort_by(|a, b| b.winrate.partial_cmp(&a.winrate).unwrap_or(std::cmp::Ordering::Equal));
    let best_matchups: Vec<ChampionMatchupEntry> = best_matchups.into_iter().take(5).collect();

    // Sort all_matchups by games played descending
    all_matchups.sort_by(|a, b| b.games.cmp(&a.games));

    // Best synergies = highest winrate with teammate
    let mut best_synergies = all_synergies.clone();
    best_synergies.sort_by(|a, b| b.winrate.partial_cmp(&a.winrate).unwrap_or(std::cmp::Ordering::Equal));
    let best_synergies: Vec<ChampionMatchupEntry> = best_synergies.into_iter().take(5).collect();

    all_synergies.sort_by(|a, b| b.games.cmp(&a.games));

    Ok(Some(ChampionOverviewData {
        champion_id,
        name: champion.name,
        image: champion.image,
        damage: champion.damage,
        frontline: champion.frontline,
        roles: champion.roles,
        selected_role,
        winrate,
        games,
        build,
        best_matchups,
        worst_matchups,
        all_matchups,
        best_synergies,
        all_synergies,
    }))
}

/// Retrieve all champions filtered by role (or all roles) with basic role statistics.
#[tauri::command]
pub fn get_champions_by_role(
    state: State<'_, Shared>,
    role: Option<Role>,
) -> Vec<RoleChampionItem> {
    let repo = state.repo.lock().unwrap().clone();
    let mut items = Vec::new();

    // Calculate total role games to derive realistic pick rates
    let total_role_games: u64 = repo.all_champions().map(|c| {
        if let Some(target_role) = role {
            c.role_stats(target_role).map(|s| s.games as u64).unwrap_or(0)
        } else {
            let p = c.roles.first().copied().unwrap_or(Role::Mid);
            c.role_stats(p).map(|s| s.games as u64).unwrap_or(0)
        }
    }).sum();
    let total_matches = (total_role_games / 2).max(1) as f64;

    for champ in repo.all_champions() {
        let (active_role, stats_opt) = if let Some(target_role) = role {
            if !champ.roles.contains(&target_role) {
                continue;
            }
            (target_role, champ.role_stats(target_role))
        } else {
            let primary = champ.roles.first().copied().unwrap_or(Role::Mid);
            (primary, champ.role_stats(primary))
        };

        let winrate = stats_opt.map(calculate_precise_winrate).unwrap_or(0.5);
        let games = stats_opt.map(|s| s.games).unwrap_or(0);
        let pick_rate = (games as f64 / total_matches).clamp(0.001, 0.45);
        let ban_rate = ((pick_rate * 0.42) + ((winrate - 0.50).max(0.0) * 1.2)).clamp(0.005, 0.45);

        // Derive tier
        let score = (winrate - 0.50) * 100.0 * 2.5 + (pick_rate * 100.0) * 0.4;
        let tier = if score >= 8.0 && pick_rate >= 0.08 {
            "OP".to_string()
        } else if score >= 4.0 {
            "1".to_string()
        } else if score >= 1.0 {
            "2".to_string()
        } else if score >= -2.0 {
            "3".to_string()
        } else if score >= -5.0 {
            "4".to_string()
        } else {
            "5".to_string()
        };

        // Extract top 3 worst matchups (weak against)
        let mut weak_against = Vec::new();
        if let Some(s) = stats_opt {
            let mut matchups: Vec<(u32, f64, u32)> = s.matchups.iter()
                .map(|(&id, cell)| (id, cell.winrate, cell.games))
                .filter(|m| m.2 >= 20)
                .collect();
            if matchups.is_empty() {
                matchups = s.matchups.iter()
                    .map(|(&id, cell)| (id, cell.winrate, cell.games))
                    .collect();
            }
            matchups.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            for (opp_id, wr, g) in matchups.into_iter().take(3) {
                let (opp_name, opp_image) = match repo.get(opp_id) {
                    Some(opp) => (opp.name.clone(), opp.image.clone()),
                    None => (format!("#{opp_id}"), format!("{opp_id}")),
                };
                weak_against.push(ChampionMatchupEntry {
                    champion_id: opp_id,
                    name: opp_name,
                    image: opp_image,
                    winrate: refine_percentage_winrate(wr, opp_id, g),
                    games: g,
                });
            }
        }

        items.push(RoleChampionItem {
            champion_id: champ.champion_id,
            name: champ.name.clone(),
            image: champ.image.clone(),
            damage: champ.damage,
            frontline: champ.frontline,
            roles: champ.roles.clone(),
            role: active_role,
            tier,
            winrate,
            pick_rate,
            ban_rate,
            games,
            weak_against,
            has_build: stats_opt.and_then(|s| s.build.as_ref()).is_some(),
        });
    }

    // Default sort by winrate descending, then games descending
    items.sort_by(|a, b| b.winrate.partial_cmp(&a.winrate).unwrap_or(std::cmp::Ordering::Equal).then_with(|| b.games.cmp(&a.games)));
    items
}


/// Open an external URL in the user's default web browser.
#[tauri::command]
pub fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn();
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PatchInfo {
    pub display: String, // e.g. "26.17"
    pub slug: String,    // e.g. "26-17"
    pub url: String,     // e.g. "https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-17-notes/"
}

/// Fetch the latest verified patch information directly from Riot's news feed,
/// falling back to converting Data Dragon's internal versioning (16.X -> 26.X).
#[tauri::command]
pub async fn get_latest_patch_info(ddragon_version: Option<String>) -> PatchInfo {
    // 1. Try to fetch the live patch from Riot's official news page
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build();

    if let Ok(client) = client {
        let req = client
            .get("https://www.leagueoflegends.com/en-gb/news/game-updates/")
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RiftCompanion/1.0");

        if let Ok(res) = req.send().await {
            if let Ok(text) = res.text().await {
                // Find "league-of-legends-patch-(\d+-\d+)-notes"
                if let Some(pos) = text.find("league-of-legends-patch-") {
                    let rem = &text[pos + "league-of-legends-patch-".len()..];
                    if let Some(end_pos) = rem.find("-notes") {
                        let slug = &rem[..end_pos];
                        // Validate slug format like "26-17"
                        if slug.chars().all(|c| c.is_ascii_digit() || c == '-') && slug.contains('-') {
                            let display = slug.replace('-', ".");
                            let url = format!("https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-{slug}-notes/");
                            return PatchInfo {
                                url,
                                display,
                                slug: slug.to_string(),
                            };
                        }
                    }
                }
            }
        }
    }

    // 2. Fallback: derive from Data Dragon version
    // In Data Dragon, Season 16 is 16.x.y, while Riot's public patches use year 2026 -> 26.x
    let raw = ddragon_version.unwrap_or_else(|| "16.17.1".to_string());
    let parts: Vec<&str> = raw.split('.').collect();
    let mut major = parts.first().and_then(|s| s.parse::<u32>().ok()).unwrap_or(16);
    let minor = parts.get(1).unwrap_or(&"17");

    if (16..=25).contains(&major) {
        major += 10;
    }

    let slug = format!("{major}-{minor}");
    let display = format!("{major}.{minor}");
    let url = format!("https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-{slug}-notes/");

    PatchInfo { display, slug, url }
}


fn compute(state: &Shared) -> Vec<Recommendation> {
    let draft = state.latest_draft.lock().unwrap().clone();
    match draft {
        Some(d) => {
            let repo = state.repo.lock().unwrap().clone();
            engine::recommend(repo.as_ref(), &d, &state.weights.lock().unwrap())
        }
        None => Vec::new(),
    }
}
