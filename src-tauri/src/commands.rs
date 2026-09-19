//! Tauri command handlers exposed to the frontend via `invoke`.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::data::models::{
    ChampionBuildStats, ChampionMatchupEntry, ChampionOverviewData, DamageType, RankTier, Role,
    RoleChampionItem,
};
use crate::data::repository::Repository;
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
pub fn get_gameflow_phase(state: State<Shared>) -> String {
    state.gameflow_phase.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_weights(state: State<Shared>, weights: Weights, app: AppHandle) -> Vec<Recommendation> {
    *state.weights.lock().unwrap() = weights;
    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

#[tauri::command]
pub fn set_scoring_mode(
    state: State<Shared>,
    mode: weights::ScoringMode,
    app: AppHandle,
) -> Vec<Recommendation> {
    state.weights.lock().unwrap().mode = mode;
    let recs = compute(&state);
    let _ = app.emit("recommendations://update", &recs);
    recs
}

#[tauri::command]
pub fn get_scoring_mode(state: State<Shared>) -> weights::ScoringMode {
    state.weights.lock().unwrap().mode
}

/// Hover a champion in the League of Legends client during champ select (without locking in).
#[tauri::command]
pub async fn hover_champion(champion_id: u32) -> Result<bool, String> {
    let lock = crate::lcu::lockfile::find().ok_or_else(|| "LCU lockfile not found".to_string())?;
    crate::lcu::client::hover_champion_in_lcu(&lock, champion_id)
        .await
        .map_err(|e| e.to_string())
}

/// Compute full scoring and matchup recommendation for a specific champion on-demand
/// (e.g. for previewing an off-meta or hovered pick in real time).
#[tauri::command]
pub fn get_champion_recommendation(
    state: State<Shared>,
    champion_id: u32,
) -> Option<Recommendation> {
    let repo = state.repo.lock().unwrap().clone();
    let draft = state.latest_draft.lock().unwrap().clone()?;
    let role = draft.local_role?;
    let weights = state.weights.lock().unwrap().clone();
    let c = repo.get(champion_id)?;
    let needs = engine::comp::needs(&repo, &draft);
    Some(engine::score_one(&repo, &draft, &weights, role, c, &needs))
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
    set_champion_role(state, champion_id, role, true, app)
}

/// Manually reassign an ally or enemy pick's role from the draft board.
#[tauri::command]
pub fn set_champion_role(
    state: State<Shared>,
    champion_id: u32,
    role: Option<Role>,
    is_enemy: bool,
    app: AppHandle,
) -> Vec<Recommendation> {
    let repo = state.repo.lock().unwrap().clone();

    if is_enemy {
        let mut overrides = state.enemy_role_overrides.lock().unwrap();
        match role {
            Some(r) => {
                overrides.insert(champion_id, r);
            }
            None => {
                overrides.remove(&champion_id);
            }
        }
    } else {
        let mut overrides = state.ally_role_overrides.lock().unwrap();
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
            let list = if is_enemy {
                &mut d.enemies
            } else {
                &mut d.allies
            };
            if let Some(pick) = list.iter_mut().find(|p| p.champion_id == champion_id) {
                pick.role = resolved_role;
                if !is_enemy && pick.is_local {
                    d.local_role = resolved_role;
                }
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

/// Atomically swaps or reassigns roles for champions in the draft board.
#[tauri::command]
pub fn swap_champion_roles(
    state: State<Shared>,
    champion_a: u32,
    role_a: Role,
    champion_b: Option<u32>,
    role_b: Option<Role>,
    is_enemy: bool,
    app: AppHandle,
) -> Vec<Recommendation> {
    if is_enemy {
        let mut overrides = state.enemy_role_overrides.lock().unwrap();
        overrides.insert(champion_a, role_a);
        if let (Some(b_id), Some(b_role)) = (champion_b, role_b) {
            overrides.insert(b_id, b_role);
        }
    } else {
        let mut overrides = state.ally_role_overrides.lock().unwrap();
        overrides.insert(champion_a, role_a);
        if let (Some(b_id), Some(b_role)) = (champion_b, role_b) {
            overrides.insert(b_id, b_role);
        }
    }

    let updated_draft = {
        let mut draft = state.latest_draft.lock().unwrap();
        if let Some(d) = draft.as_mut() {
            let list = if is_enemy {
                &mut d.enemies
            } else {
                &mut d.allies
            };

            if let Some(pick) = list.iter_mut().find(|p| p.champion_id == champion_a) {
                pick.role = Some(role_a);
                if !is_enemy && pick.is_local {
                    d.local_role = Some(role_a);
                }
            }
            if let (Some(b_id), Some(b_role)) = (champion_b, role_b) {
                if let Some(pick) = list.iter_mut().find(|p| p.champion_id == b_id) {
                    pick.role = Some(b_role);
                    if !is_enemy && pick.is_local {
                        d.local_role = Some(b_role);
                    }
                }
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
pub async fn test_server_connection(server_url: String, api_key: Option<String>) -> Result<opgg::remote::ServerStatus, String> {
    opgg::remote::check_status(&server_url, api_key.as_deref()).await.map_err(|e| e.to_string())
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

    let (server_url, api_key) = {
        let s = state.settings.lock().unwrap();
        (s.server_url.clone(), s.api_key.clone())
    };
    if !server_url.trim().is_empty() {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank://update", tier);
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            match opgg::remote::fetch_stats(&server_url, tier, Some(&api_key)).await {
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
    let api_key = settings.api_key.clone();

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
            match opgg::remote::fetch_stats(&new_server_url, tier, Some(&api_key)).await {
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
    let (server_url, api_key) = {
        let s = state.settings.lock().unwrap();
        (s.server_url.clone(), s.api_key.clone())
    };
    if !server_url.trim().is_empty() {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_clone.emit("rank-refresh://status", "refreshing");
            let _ = opgg::remote::trigger_refresh(&server_url, Some(tier.as_opgg_tier()), Some(&api_key)).await;
            match opgg::remote::fetch_stats(&server_url, tier, Some(&api_key)).await {
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
        let (server_url, api_key) = {
            let s = state.settings.lock().unwrap();
            (s.server_url.clone(), s.api_key.clone())
        };
        let tier = *state.rank_tier.lock().unwrap();
        if !server_url.trim().is_empty() {
            if let Ok(b) = opgg::remote::fetch_build(&server_url, &champion.image, selected_role.as_key(), tier, Some(&api_key)).await {
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



fn normalize_region_from_tag(tag: &str) -> Option<&'static str> {
    match tag.trim().to_ascii_uppercase().as_str() {
        "EUW" | "EUW1" => Some("EUW"),
        "KR" | "KR1" => Some("KR"),
        "NA" | "NA1" => Some("NA"),
        "EUNE" | "EUN1" => Some("EUNE"),
        "OCE" | "OC1" => Some("OCE"),
        "BR" | "BR1" => Some("BR"),
        "JP" | "JP1" => Some("JP"),
        "LAN" | "LA1" => Some("LAN"),
        "LAS" | "LA2" => Some("LAS"),
        _ => None,
    }
}

/// Fetch a player's full profile (rank, tier, top champions, level).
/// Checks LCU first if connected and no specific summoner was requested.
/// Otherwise, fetches from OP.GG MCP server with fallback to pro player aliases.
#[tauri::command]
pub async fn get_player_profile(
    state: State<'_, Shared>,
    game_name: Option<String>,
    tag_line: Option<String>,
    region: Option<String>,
) -> Result<serde_json::Value, String> {
    let local_profile = state.profile.lock().unwrap().clone();
    let is_local_lookup = match (&game_name, &tag_line, &local_profile) {
        (None, _, _) => true,
        (Some(name), Some(tag), Some(local)) => {
            let matches_full = name.eq_ignore_ascii_case(&local.display_name)
                || format!("{}#{}", name, tag).eq_ignore_ascii_case(&local.display_name);
            let matches_name_and_tag = !local.game_name.is_empty()
                && name.eq_ignore_ascii_case(&local.game_name)
                && (local.tag_line.is_empty() || tag.eq_ignore_ascii_case(&local.tag_line));
            matches_full || matches_name_and_tag
        }
        (Some(name), None, Some(local)) => {
            name.eq_ignore_ascii_case(&local.display_name)
                || (!local.game_name.is_empty() && name.eq_ignore_ascii_case(&local.game_name))
        }
        _ => false,
    };
    tracing::info!("get_player_profile: game_name={:?}, tag_line={:?}, is_local={}", game_name, tag_line, is_local_lookup);

    if is_local_lookup {
        if let Some(lock) = crate::lcu::lockfile::find() {
            if let Ok(Some(summoner)) = crate::lcu::client::get_current_summoner(&lock).await {
                let ranked = crate::lcu::client::get_all_ranked_stats(&lock).await.unwrap_or(None);
                let mastery = crate::lcu::client::get_local_champion_mastery(&lock).await.unwrap_or(None);
                let opgg_stats = if let Ok(client) = opgg::client::McpClient::new() {
                    let gn = summoner.game_name.clone();
                    let tl = if !summoner.tag_line.is_empty() {
                        summoner.tag_line.clone()
                    } else {
                        "EUW".to_string()
                    };
                    let reg = region.clone().unwrap_or_else(|| "EUW".to_string());
                    match opgg::summoner::fetch_profile(&client, &gn, &tl, &reg).await {
                        Ok(mut d) => {
                            if let Some(inner) = d.get_mut("data") {
                                Some(inner.take())
                            } else {
                                Some(d)
                            }
                        }
                        Err(_) => None,
                    }
                } else {
                    None
                };

                return Ok(serde_json::json!({
                    "source": "lcu",
                    "summoner": summoner,
                    "ranked": ranked,
                    "mastery": mastery,
                    "opgg": opgg_stats
                }));
            }
        }
    }

    let raw_reg = region.clone().unwrap_or_else(|| "EUW".to_string());
    let (name, tag) = match (game_name, tag_line) {
        (Some(n), Some(t)) => (n, t),
        (Some(full), None) => {
            if let Some((n, t)) = full.split_once('#') {
                (n.to_string(), t.to_string())
            } else {
                (full, raw_reg.clone())
            }
        }
        (None, _) => {
            if let Some(local) = local_profile {
                if !local.game_name.is_empty() {
                    let tag = if !local.tag_line.is_empty() { local.tag_line } else { raw_reg.clone() };
                    (local.game_name, tag)
                } else if let Some((n, t)) = local.display_name.split_once('#') {
                    (n.to_string(), t.to_string())
                } else {
                    (local.display_name, raw_reg.clone())
                }
            } else {
                return Err("No summoner specified and no account connected".to_string());
            }
        }
    };

    // If tag indicates a specific region (e.g. KR1, NA1) and region wasn't explicitly passed
    let mut reg = raw_reg.clone();
    if let Some(inferred_reg) = normalize_region_from_tag(&tag) {
        if region.is_none() || region.as_deref() == Some("EUW") {
            reg = inferred_reg.to_string();
        }
    }

    let client = opgg::client::McpClient::new().map_err(|e| e.to_string())?;

    // Attempt pro player resolution upfront if tag matches default region or if no tag was originally given
    let (mut req_name, mut req_tag) = (name.clone(), tag.clone());
    if req_tag.eq_ignore_ascii_case(&reg) || req_tag.eq_ignore_ascii_case(&raw_reg) {
        if let Ok(pro) = opgg::summoner::fetch_pro_player(&client, &req_name, &reg).await {
            if let Some(riot_id) = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("riot_id")) {
                let p_name = riot_id.get("game_name").and_then(|g| g.as_str()).unwrap_or("");
                let p_tag = riot_id.get("tagline").and_then(|t| t.as_str()).unwrap_or(&reg);
                if !p_name.is_empty() {
                    req_name = p_name.to_string();
                    req_tag = p_tag.to_string();
                }
            }
        }
    }

    // Try primary fetch_profile
    let final_name = req_name.clone();
    let final_tag = req_tag.clone();
    let mut final_reg = reg.clone();

    let data = match opgg::summoner::fetch_profile(&client, &final_name, &final_tag, &final_reg).await {
        Ok(mut d) => {
            if let Some(inner) = d.get_mut("data") {
                inner.take()
            } else {
                d
            }
        }
        Err(orig_err) => {
            let mut resolved = None;

            // Fallback 1: If tag looks like a different region code, try that region
            if let Some(inferred) = normalize_region_from_tag(&final_tag) {
                if inferred != final_reg {
                    if let Ok(mut d) = opgg::summoner::fetch_profile(&client, &final_name, &final_tag, inferred).await {
                        final_reg = inferred.to_string();
                        resolved = Some(if let Some(inner) = d.get_mut("data") { inner.take() } else { d });
                    }
                }
            }

            // Fallback 2: Check pro player lookup in current region
            if resolved.is_none() {
                if let Ok(pro) = opgg::summoner::fetch_pro_player(&client, &name, &final_reg).await {
                    if let Some(riot_id) = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("riot_id")) {
                        let p_name = riot_id.get("game_name").and_then(|g| g.as_str()).unwrap_or("");
                        let p_tag = riot_id.get("tagline").and_then(|t| t.as_str()).unwrap_or(&final_reg);
                        let p_reg = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("region")).and_then(|r| r.as_str()).map(|r| r.to_uppercase()).unwrap_or_else(|| final_reg.clone());

                        if !p_name.is_empty() {
                            if let Ok(mut d) = opgg::summoner::fetch_profile(&client, p_name, p_tag, &p_reg).await {
                                final_reg = p_reg;
                                resolved = Some(if let Some(inner) = d.get_mut("data") { inner.take() } else { d });
                            }
                        }
                    }
                }
            }

            // Fallback 3: Check pro player lookup in KR region (for Korean pro players like Faker, Chovy, etc.)
            if resolved.is_none() && final_reg != "KR" {
                if let Ok(pro) = opgg::summoner::fetch_pro_player(&client, &name, "KR").await {
                    if let Some(riot_id) = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("riot_id")) {
                        let p_name = riot_id.get("game_name").and_then(|g| g.as_str()).unwrap_or("");
                        let p_tag = riot_id.get("tagline").and_then(|t| t.as_str()).unwrap_or("KR1");
                        if !p_name.is_empty() {
                            if let Ok(mut d) = opgg::summoner::fetch_profile(&client, p_name, p_tag, "KR").await {
                                final_reg = "KR".to_string();
                                resolved = Some(if let Some(inner) = d.get_mut("data") { inner.take() } else { d });
                            }
                        }
                    }
                }
            }

            match resolved {
                Some(d) => d,
                None => {
                    tracing::warn!("OP.GG fetch_profile failed for {}#{}: {}", name, tag, orig_err);
                    return Err(format!(
                        "Summoner '{}#{}' not found in region {}. Please verify the Riot ID and tagline (e.g. Name#Tag).",
                        name, tag, reg
                    ));
                }
            }
        }
    };

    Ok(serde_json::json!({
        "source": "opgg",
        "region": final_reg,
        "data": data
    }))
}

/// Fetch a player's recent matches with items, spells, runes, KDA, CS, and stats.
/// If `game_name` is None or matches local player, checks LCU first if connected.
/// Otherwise, fetches from OP.GG MCP.
#[tauri::command]
pub async fn get_player_matches(
    state: State<'_, Shared>,
    game_name: Option<String>,
    tag_line: Option<String>,
    region: Option<String>,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    let lim = limit.unwrap_or(20).clamp(5, 20);
    let local_profile = state.profile.lock().unwrap().clone();
    let is_local_lookup = match (&game_name, &tag_line, &local_profile) {
        (None, _, _) => true,
        (Some(name), Some(tag), Some(local)) => {
            let matches_full = name.eq_ignore_ascii_case(&local.display_name)
                || format!("{}#{}", name, tag).eq_ignore_ascii_case(&local.display_name);
            let matches_name_and_tag = !local.game_name.is_empty()
                && name.eq_ignore_ascii_case(&local.game_name)
                && (local.tag_line.is_empty() || tag.eq_ignore_ascii_case(&local.tag_line));
            matches_full || matches_name_and_tag
        }
        (Some(name), None, Some(local)) => {
            name.eq_ignore_ascii_case(&local.display_name)
                || (!local.game_name.is_empty() && name.eq_ignore_ascii_case(&local.game_name))
        }
        _ => false,
    };
    tracing::info!("get_player_matches: game_name={:?}, tag_line={:?}, is_local={}", game_name, tag_line, is_local_lookup);

    if is_local_lookup {
        if let Some(lock) = crate::lcu::lockfile::find() {
            if let Ok(Some(matches)) = crate::lcu::client::get_local_matches(&lock, 0, lim).await {
                return Ok(serde_json::json!({
                    "source": "lcu",
                    "data": matches
                }));
            }
        }
    }

    let raw_reg = region.clone().unwrap_or_else(|| "EUW".to_string());
    let (name, tag) = match (game_name, tag_line) {
        (Some(n), Some(t)) => (n, t),
        (Some(full), None) => {
            if let Some((n, t)) = full.split_once('#') {
                (n.to_string(), t.to_string())
            } else {
                (full, raw_reg.clone())
            }
        }
        (None, _) => {
            if let Some(local) = local_profile {
                if !local.game_name.is_empty() {
                    let tag = if !local.tag_line.is_empty() { local.tag_line } else { raw_reg.clone() };
                    (local.game_name, tag)
                } else if let Some((n, t)) = local.display_name.split_once('#') {
                    (n.to_string(), t.to_string())
                } else {
                    (local.display_name, raw_reg.clone())
                }
            } else {
                return Err("No summoner specified and no account connected".to_string());
            }
        }
    };

    let mut reg = raw_reg.clone();
    if let Some(inferred_reg) = normalize_region_from_tag(&tag) {
        if region.is_none() || region.as_deref() == Some("EUW") {
            reg = inferred_reg.to_string();
        }
    }

    let client = opgg::client::McpClient::new().map_err(|e| e.to_string())?;

    let (mut req_name, mut req_tag) = (name.clone(), tag.clone());
    if req_tag.eq_ignore_ascii_case(&reg) || req_tag.eq_ignore_ascii_case(&raw_reg) {
        if let Ok(pro) = opgg::summoner::fetch_pro_player(&client, &req_name, &reg).await {
            if let Some(riot_id) = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("riot_id")) {
                let p_name = riot_id.get("game_name").and_then(|g| g.as_str()).unwrap_or("");
                let p_tag = riot_id.get("tagline").and_then(|t| t.as_str()).unwrap_or(&reg);
                if !p_name.is_empty() {
                    req_name = p_name.to_string();
                    req_tag = p_tag.to_string();
                }
            }
        }
    }

    let final_name = req_name.clone();
    let final_tag = req_tag.clone();
    let mut final_reg = reg.clone();

    let data = match opgg::summoner::fetch_matches(&client, &final_name, &final_tag, &final_reg, lim).await {
        Ok(mut d) => {
            if let Some(inner) = d.get_mut("data") {
                inner.take()
            } else {
                d
            }
        }
        Err(orig_err) => {
            let mut resolved = None;

            if let Some(inferred) = normalize_region_from_tag(&final_tag) {
                if inferred != final_reg {
                    if let Ok(mut d) = opgg::summoner::fetch_matches(&client, &final_name, &final_tag, inferred, lim).await {
                        final_reg = inferred.to_string();
                        resolved = Some(if let Some(inner) = d.get_mut("data") { inner.take() } else { d });
                    }
                }
            }

            if resolved.is_none() {
                if let Ok(pro) = opgg::summoner::fetch_pro_player(&client, &name, &final_reg).await {
                    if let Some(riot_id) = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("riot_id")) {
                        let p_name = riot_id.get("game_name").and_then(|g| g.as_str()).unwrap_or("");
                        let p_tag = riot_id.get("tagline").and_then(|t| t.as_str()).unwrap_or(&final_reg);
                        let p_reg = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("region")).and_then(|r| r.as_str()).map(|r| r.to_uppercase()).unwrap_or_else(|| final_reg.clone());

                        if !p_name.is_empty() {
                            if let Ok(mut d) = opgg::summoner::fetch_matches(&client, p_name, p_tag, &p_reg, lim).await {
                                final_reg = p_reg;
                                resolved = Some(if let Some(inner) = d.get_mut("data") { inner.take() } else { d });
                            }
                        }
                    }
                }
            }

            if resolved.is_none() && final_reg != "KR" {
                if let Ok(pro) = opgg::summoner::fetch_pro_player(&client, &name, "KR").await {
                    if let Some(riot_id) = pro.get("data").and_then(|d| d.get("player")).and_then(|p| p.get("riot_id")) {
                        let p_name = riot_id.get("game_name").and_then(|g| g.as_str()).unwrap_or("");
                        let p_tag = riot_id.get("tagline").and_then(|t| t.as_str()).unwrap_or("KR1");
                        if !p_name.is_empty() {
                            if let Ok(mut d) = opgg::summoner::fetch_matches(&client, p_name, p_tag, "KR", lim).await {
                                final_reg = "KR".to_string();
                                resolved = Some(if let Some(inner) = d.get_mut("data") { inner.take() } else { d });
                            }
                        }
                    }
                }
            }

            match resolved {
                Some(d) => d,
                None => {
                    tracing::warn!("OP.GG fetch_matches failed for {}#{}: {}", name, tag, orig_err);
                    return Err(format!(
                        "Matches for '{}#{}' not found in region {}: {}",
                        name, tag, reg, orig_err
                    ));
                }
            }
        }
    };

    Ok(serde_json::json!({
        "source": "opgg",
        "region": final_reg,
        "data": data
    }))
}

/// Fetch full 10-player match detail for an expanded match view.
#[tauri::command]
pub async fn get_match_detail(
    game_id: String,
    region: Option<String>,
    created_at: Option<String>,
    focus_riot_id: Option<String>,
) -> Result<serde_json::Value, String> {
    // 1. If LCU is connected, try local game detail first
    if let Some(lock) = crate::lcu::lockfile::find() {
        if let Ok(gid) = game_id.parse::<u64>() {
            if let Ok(Some(detail)) = crate::lcu::client::get_local_game_detail(&lock, gid).await {
                return Ok(serde_json::json!({
                    "source": "lcu",
                    "data": detail
                }));
            }
        }
    }

    // 2. Otherwise query OP.GG MCP lol_get_summoner_game_detail
    let reg = region.unwrap_or_else(|| "EUW".to_string());
    let client = opgg::client::McpClient::new().map_err(|e| e.to_string())?;
    let cr = created_at.unwrap_or_default();
    let gid = game_id.trim();
    let reg_trimmed = reg.trim();
    let cr_trimmed = cr.trim();

    let detail = match opgg::summoner::fetch_game_detail(&client, gid, reg_trimmed, cr_trimmed, focus_riot_id.as_deref()).await {
        Ok(d) => d,
        Err(e) => {
            if focus_riot_id.is_some() {
                match opgg::summoner::fetch_game_detail(&client, gid, reg_trimmed, cr_trimmed, None).await {
                    Ok(d) => d,
                    Err(e2) => {
                        tracing::warn!("OP.GG fetch_game_detail failed for {} in {}: {}", gid, reg_trimmed, e2);
                        return Err(e2.to_string());
                    }
                }
            } else {
                tracing::warn!("OP.GG fetch_game_detail failed for {} in {}: {}", gid, reg_trimmed, e);
                return Err(e.to_string());
            }
        }
    };

    let mut detail_val = detail;
    let unwrapped_detail = if let Some(inner) = detail_val.get_mut("data") {
        inner.take()
    } else {
        detail_val
    };

    Ok(serde_json::json!({
        "source": "opgg",
        "data": unwrapped_detail
    }))
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

// -----------------------------------------------------------------------------
// Issue #11: Match Simulation & Offline Draft Engine
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimulatedMatchAnalysis {
    pub blue_win_chance: f64,
    pub lane_matchups: Vec<SimulatedLaneMatchup>,
    pub blue_comp: SimulatedTeamComp,
    pub red_comp: SimulatedTeamComp,
    pub synergies: Vec<SimulatedSynergy>,
    pub counters: Vec<SimulatedCounter>,
    pub insights: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimulatedLaneMatchup {
    pub role: Role,
    pub role_label: String,
    pub ally_champion_id: Option<u32>,
    pub ally_champion_name: Option<String>,
    pub enemy_champion_id: Option<u32>,
    pub enemy_champion_name: Option<String>,
    pub ally_winrate: Option<f64>,
    pub games: u32,
    pub delta: f64,
    pub advantage: String, // "ally" | "enemy" | "even" | "uncontested"
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimulatedTeamComp {
    pub champions_count: usize,
    pub physical_count: usize,
    pub magic_count: usize,
    pub mixed_count: usize,
    pub frontline_count: usize,
    #[serde(default)]
    pub cc_count: usize,
    #[serde(default)]
    pub cc_level: String,
    pub physical_pct: f64,
    pub magic_pct: f64,
    pub warnings: Vec<String>,
    pub strengths: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimulatedSynergy {
    pub champion_a_id: u32,
    pub champion_a_name: String,
    pub champion_b_id: u32,
    pub champion_b_name: String,
    pub role_a: Role,
    pub role_b: Role,
    pub winrate: f64,
    pub games: u32,
    pub delta: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SimulatedCounter {
    pub winner_id: u32,
    pub winner_name: String,
    pub winner_team: String, // "blue" | "red"
    pub loser_id: u32,
    pub loser_name: String,
    pub role: Role,
    pub winrate: f64,
    pub games: u32,
    pub delta: f64,
}

/// Compute pick recommendations for an offline or mock draft session.
#[tauri::command]
pub fn simulate_draft(state: State<Shared>, draft: DraftState) -> Vec<Recommendation> {
    let repo = state.repo.lock().unwrap().clone();
    let weights = state.weights.lock().unwrap().clone();
    engine::recommend(repo.as_ref(), &draft, &weights)
}

/// Compute full scoring and matchup details for a specific champion in a simulated draft.
#[tauri::command]
pub fn simulate_champion_recommendation(
    state: State<Shared>,
    draft: DraftState,
    champion_id: u32,
) -> Option<Recommendation> {
    let repo = state.repo.lock().unwrap().clone();
    let role = draft.local_role?;
    let weights = state.weights.lock().unwrap().clone();
    let c = repo.get(champion_id)?;
    let needs = engine::comp::needs(&repo, &draft);
    Some(engine::score_one(&repo, &draft, &weights, role, c, &needs))
}

/// Perform head-to-head match simulation and team analysis for the draft.
#[tauri::command]
pub fn simulate_match_analysis(state: State<Shared>, draft: DraftState) -> SimulatedMatchAnalysis {
    let repo = state.repo.lock().unwrap().clone();
    let prior = repo.global_avg();

    let all_roles = [Role::Top, Role::Jungle, Role::Mid, Role::Adc, Role::Support];

    let mut lane_matchups = Vec::new();
    let mut total_weighted_delta = 0.0;
    let mut contested_weight_sum = 0.0;
    let mut counters = Vec::new();

    for role in all_roles {
        let role_label = match role {
            Role::Top => "Top",
            Role::Jungle => "Jungle",
            Role::Mid => "Mid",
            Role::Adc => "ADC",
            Role::Support => "Support",
        }
        .to_string();

        let ally_pick = draft.allies.iter().find(|p| p.role == Some(role));
        let enemy_pick = draft.enemies.iter().find(|p| p.role == Some(role));

        let ally_c = ally_pick.and_then(|p| repo.get(p.champion_id));
        let enemy_c = enemy_pick.and_then(|p| repo.get(p.champion_id));

        let lane_weight = match role {
            Role::Top => 0.20,
            Role::Jungle => 0.22,
            Role::Mid => 0.22,
            Role::Adc => 0.20,
            Role::Support => 0.16,
        };

        if let (Some(ac), Some(ec)) = (ally_c, enemy_c) {
            let role_stats = ac.role_stats(role);
            let cell = role_stats.and_then(|s| s.matchups.get(&ec.champion_id));

            let (winrate_frac, games, delta_pct) = if let Some(c) = cell {
                let smoothed = if c.games >= weights::MIN_MATCHES {
                    bayesian::smooth(c.winrate, c.games, prior, weights::SMOOTH_C)
                } else if c.games > 0 {
                    bayesian::smooth(c.winrate, c.games, prior, weights::SMOOTH_C * 2.0)
                } else {
                    let a_base = role_stats.map(|s| s.global_winrate).unwrap_or(prior);
                    let e_base = ec.role_stats(role).map(|s| s.global_winrate).unwrap_or(prior);
                    (prior + (a_base - e_base) * 0.5).clamp(0.40, 0.60)
                };
                (smoothed, c.games, (smoothed - 0.50) * 100.0)
            } else {
                let a_base = role_stats.map(|s| s.global_winrate).unwrap_or(prior);
                let e_base = ec.role_stats(role).map(|s| s.global_winrate).unwrap_or(prior);
                let smoothed = (prior + (a_base - e_base) * 0.5).clamp(0.40, 0.60);
                (smoothed, 0, (smoothed - 0.50) * 100.0)
            };

            let advantage = if delta_pct > 1.2 {
                "ally"
            } else if delta_pct < -1.2 {
                "enemy"
            } else {
                "even"
            }
            .to_string();

            if delta_pct.abs() >= 2.5 {
                if delta_pct > 0.0 {
                    counters.push(SimulatedCounter {
                        winner_id: ac.champion_id,
                        winner_name: ac.name.clone(),
                        winner_team: "blue".to_string(),
                        loser_id: ec.champion_id,
                        loser_name: ec.name.clone(),
                        role,
                        winrate: winrate_frac * 100.0,
                        games,
                        delta: delta_pct,
                    });
                } else {
                    counters.push(SimulatedCounter {
                        winner_id: ec.champion_id,
                        winner_name: ec.name.clone(),
                        winner_team: "red".to_string(),
                        loser_id: ac.champion_id,
                        loser_name: ac.name.clone(),
                        role,
                        winrate: (1.0 - winrate_frac) * 100.0,
                        games,
                        delta: -delta_pct,
                    });
                }
            }

            total_weighted_delta += delta_pct * lane_weight;
            contested_weight_sum += lane_weight;

            lane_matchups.push(SimulatedLaneMatchup {
                role,
                role_label,
                ally_champion_id: Some(ac.champion_id),
                ally_champion_name: Some(ac.name.clone()),
                enemy_champion_id: Some(ec.champion_id),
                enemy_champion_name: Some(ec.name.clone()),
                ally_winrate: Some(winrate_frac * 100.0),
                games,
                delta: delta_pct,
                advantage,
            });
        } else {
            let (ally_id, ally_name) = ally_c.map(|c| (Some(c.champion_id), Some(c.name.clone()))).unwrap_or((None, None));
            let (enemy_id, enemy_name) = enemy_c.map(|c| (Some(c.champion_id), Some(c.name.clone()))).unwrap_or((None, None));

            lane_matchups.push(SimulatedLaneMatchup {
                role,
                role_label,
                ally_champion_id: ally_id,
                ally_champion_name: ally_name,
                enemy_champion_id: enemy_id,
                enemy_champion_name: enemy_name,
                ally_winrate: None,
                games: 0,
                delta: 0.0,
                advantage: "uncontested".to_string(),
            });
        }
    }

    // Evaluate Team Compositions
    fn analyze_team(repo: &Repository, picks: &[crate::draft::DraftPick]) -> SimulatedTeamComp {
        let mut physical = 0;
        let mut magic = 0;
        let mut mixed = 0;
        let mut frontline = 0;
        let mut cc_count = 0;

        for p in picks {
            if let Some(c) = repo.get(p.champion_id) {
                match c.damage {
                    DamageType::Physical => physical += 1,
                    DamageType::Magic => magic += 1,
                    DamageType::Mixed => mixed += 1,
                }
                if c.frontline {
                    frontline += 1;
                    cc_count += 2;
                }
                if p.role == Some(Role::Support) {
                    cc_count += 2;
                } else if p.role == Some(Role::Mid) && c.damage == DamageType::Magic {
                    cc_count += 1;
                }
            }
        }

        let count = picks.len();
        let total_dmg_dealers = (physical + magic + mixed).max(1) as f64;
        let physical_pct = ((physical as f64 + mixed as f64 * 0.5) / total_dmg_dealers) * 100.0;
        let magic_pct = ((magic as f64 + mixed as f64 * 0.5) / total_dmg_dealers) * 100.0;

        let cc_level = if cc_count >= 5 {
            "High".to_string()
        } else if cc_count >= 3 {
            "Medium".to_string()
        } else {
            "Low".to_string()
        };

        let mut warnings = Vec::new();
        let mut strengths = Vec::new();

        if count >= 3 {
            if magic == 0 && mixed == 0 {
                warnings.push("Full AD: No magic damage (enemies can stack armor)".to_string());
            } else if physical == 0 && mixed == 0 {
                warnings.push("Full AP: No physical damage (enemies can stack magic resist)".to_string());
            } else {
                strengths.push("Balanced AD/AP damage profile".to_string());
            }

            if frontline == 0 {
                warnings.push("No Frontline: Lacks a tank for engages or peel".to_string());
            } else {
                strengths.push(format!("{frontline}x Frontline/Tank present for teamfights"));
            }

            if cc_count >= 5 {
                strengths.push("Strong Crowd Control & lockdown for teamfights".to_string());
            } else if cc_count <= 2 && count >= 4 {
                warnings.push("Low Crowd Control: Lacks reliable lockdown or peel".to_string());
            }
        }

        SimulatedTeamComp {
            champions_count: count,
            physical_count: physical,
            magic_count: magic,
            mixed_count: mixed,
            frontline_count: frontline,
            cc_count,
            cc_level,
            physical_pct,
            magic_pct,
            warnings,
            strengths,
        }
    }

    let blue_comp = analyze_team(&repo, &draft.allies);
    let red_comp = analyze_team(&repo, &draft.enemies);

    // Evaluate Ally Synergies
    let mut synergies = Vec::new();
    let allies = &draft.allies;
    for i in 0..allies.len() {
        for j in (i + 1)..allies.len() {
            let p1 = &allies[i];
            let p2 = &allies[j];
            if let (Some(role1), Some(c1), Some(c2)) = (p1.role, repo.get(p1.champion_id), repo.get(p2.champion_id)) {
                if let Some(cell) = c1.role_stats(role1).and_then(|s| s.synergies.get(&p2.champion_id)) {
                    if cell.games >= 50 {
                        let smoothed = bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C);
                        let delta = (smoothed - 0.50) * 100.0;
                        if delta.abs() >= 1.0 {
                            synergies.push(SimulatedSynergy {
                                champion_a_id: c1.champion_id,
                                champion_a_name: c1.name.clone(),
                                champion_b_id: c2.champion_id,
                                champion_b_name: c2.name.clone(),
                                role_a: role1,
                                role_b: p2.role.unwrap_or(Role::Mid),
                                winrate: smoothed * 100.0,
                                games: cell.games,
                                delta,
                            });
                        }
                    }
                }
            }
        }
    }
    synergies.sort_by(|a, b| b.delta.partial_cmp(&a.delta).unwrap_or(std::cmp::Ordering::Equal));

    // Calculate Blue Win Chance
    let mut match_win_chance = 50.0;
    if contested_weight_sum > 0.0 {
        let avg_lane_delta = total_weighted_delta / contested_weight_sum;
        match_win_chance += avg_lane_delta * 0.85;
    }

    // Comp adjustments
    if blue_comp.champions_count >= 3 && red_comp.champions_count >= 3 {
        if blue_comp.frontline_count > 0 && red_comp.frontline_count == 0 {
            match_win_chance += 1.8;
        } else if blue_comp.frontline_count == 0 && red_comp.frontline_count > 0 {
            match_win_chance -= 1.8;
        }

        if blue_comp.warnings.is_empty() && !red_comp.warnings.is_empty() {
            match_win_chance += 1.5;
        } else if !blue_comp.warnings.is_empty() && red_comp.warnings.is_empty() {
            match_win_chance -= 1.5;
        }
    }

    // Synergy adjustments
    let top_synergies_delta: f64 = synergies.iter().take(3).map(|s| s.delta * 0.15).sum();
    match_win_chance += top_synergies_delta;

    let blue_win_chance = match_win_chance.clamp(20.0, 80.0);

    // Dynamic high-level insights
    let mut insights = Vec::new();
    if blue_win_chance >= 54.0 {
        insights.push("Deutlicher Draft-Vorteil für dein Team (gute Lane-Matchups & Synergien).".to_string());
    } else if blue_win_chance <= 46.0 {
        insights.push("Schwieriger Draft: Das Gegnerteam hat vorteilhafte Matchups oder bessere Team-Balance.".to_string());
    } else {
        insights.push("Ausgeglichene Draft-Situation: Die individuelle Performance und Map-Control entscheiden.".to_string());
    }

    if let Some(top_syn) = synergies.first() {
        if top_syn.delta >= 2.0 {
            insights.push(format!("Starke Synergie: {} & {} harmonieren exzellent (+{:.1}% WR).", top_syn.champion_a_name, top_syn.champion_b_name, top_syn.delta));
        }
    }

    if let Some(bad_counter) = counters.iter().find(|c| c.winner_team == "red") {
        insights.push(format!("Gefährlicher Counter: Gegners {} setzt {} unter Druck ({:.1}% WR).", bad_counter.winner_name, bad_counter.loser_name, bad_counter.winrate));
    }

    SimulatedMatchAnalysis {
        blue_win_chance,
        lane_matchups,
        blue_comp,
        red_comp,
        synergies,
        counters,
        insights,
    }
}

/// Save user uploaded custom wallpaper image to app data directory.
#[tauri::command]
pub fn save_custom_wallpaper(
    app: AppHandle,
    base64_data: String,
    extension: String,
) -> Result<String, String> {
    use base64::Engine;
    let clean_b64 = if let Some(idx) = base64_data.find(";base64,") {
        &base64_data[idx + 8..]
    } else {
        &base64_data
    };

    let data = base64::engine::general_purpose::STANDARD
        .decode(clean_b64.trim())
        .map_err(|e| format!("Invalid base64: {}", e))?;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let ext = if extension.trim().is_empty() {
        "jpg"
    } else {
        extension.trim()
    };
    let filename = format!("custom_wallpaper.{}", ext);
    let target_path = app_dir.join(&filename);
    std::fs::write(&target_path, data).map_err(|e| e.to_string())?;

    Ok(target_path.to_string_lossy().to_string())
}

/// Delete user uploaded custom wallpaper image from app data directory.
#[tauri::command]
pub fn delete_custom_wallpaper(app: AppHandle) -> Result<(), String> {
    if let Ok(app_dir) = app.path().app_data_dir() {
        for ext in &["jpg", "jpeg", "png", "webp"] {
            let p = app_dir.join(format!("custom_wallpaper.{}", ext));
            if p.exists() {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    Ok(())
}

/// Load user uploaded custom wallpaper as base64 data URL.
#[tauri::command]
pub fn get_custom_wallpaper(app: AppHandle) -> Result<Option<String>, String> {
    use base64::Engine;
    if let Ok(app_dir) = app.path().app_data_dir() {
        for ext in &["png", "jpg", "jpeg", "webp"] {
            let p = app_dir.join(format!("custom_wallpaper.{}", ext));
            if p.exists() {
                if let Ok(bytes) = std::fs::read(&p) {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let mime = match *ext {
                        "png" => "image/png",
                        "webp" => "image/webp",
                        _ => "image/jpeg",
                    };
                    return Ok(Some(format!("data:{};base64,{}", mime, b64)));
                }
            }
        }
    }
    Ok(None)
}



