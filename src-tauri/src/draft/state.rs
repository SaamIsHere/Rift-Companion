//! Converts a raw LCU `ChampSelectSession` into a clean, UI-friendly `DraftState`.
//!
//! Important real-world caveat: in solo/duo queue the enemy team's
//! `assignedPosition` is almost always an empty string. We therefore *infer*
//! enemy roles from each champion's primary role in our dataset.

use serde::{Deserialize, Serialize};

use crate::data::models::Role;
use crate::data::repository::Repository;
use crate::lcu::models::ChampSelectSession;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DraftState {
    pub local_role: Option<Role>,
    #[serde(default)]
    pub local_champion_id: Option<u32>,
    #[serde(default)]
    pub hovered_champion_id: Option<u32>,
    #[serde(default)]
    pub is_locked: bool,
    #[serde(default)]
    pub bans: Vec<u32>,
    #[serde(default)]
    pub allies: Vec<DraftPick>,
    #[serde(default)]
    pub enemies: Vec<DraftPick>,
    #[serde(default)]
    pub is_ban_phase: bool,
    #[serde(default)]
    pub local_ban_completed: bool,
    #[serde(default)]
    pub recent_bans: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DraftPick {
    pub champion_id: u32,
    pub role: Option<Role>,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default)]
    pub is_hover: bool,
    #[serde(default)]
    pub spell1_id: Option<u64>,
    #[serde(default)]
    pub spell2_id: Option<u64>,
    #[serde(default)]
    pub player_name: Option<String>,
}

fn parse_player_slot_name(p: &crate::lcu::models::PlayerSlot) -> Option<String> {
    if !p.game_name.is_empty() {
        if !p.tag_line.is_empty() {
            Some(format!("{}#{}", p.game_name, p.tag_line))
        } else {
            Some(p.game_name.clone())
        }
    } else if !p.summoner_name.is_empty() {
        Some(p.summoner_name.clone())
    } else {
        None
    }
}

pub fn from_session(repo: &Repository, s: &ChampSelectSession) -> DraftState {
    let local_cell = s.local_player_cell_id;
    let local_slot = s.my_team.iter().find(|p| p.cell_id == local_cell);

    let mut local_role = local_slot.and_then(|p| Role::from_lcu(&p.assigned_position));

    let mut local_champion_id = None;
    let mut hovered_champion_id = None;
    let mut is_locked = false;

    let allies = s
        .my_team
        .iter()
        .filter_map(|p| {
            let (champ_id, is_hover) = resolve_player_champion(s, p)?;
            let is_local = p.cell_id == local_cell;
            if is_local {
                if is_hover {
                    hovered_champion_id = Some(champ_id);
                    is_locked = false;
                } else {
                    local_champion_id = Some(champ_id);
                    is_locked = true;
                }
            }

            let role = Role::from_lcu(&p.assigned_position).or_else(|| repo.primary_role(champ_id));

            Some(DraftPick {
                champion_id: champ_id,
                role,
                is_local,
                is_hover,
                spell1_id: if p.spell1_id > 0 { Some(p.spell1_id as u64) } else { None },
                spell2_id: if p.spell2_id > 0 { Some(p.spell2_id as u64) } else { None },
                player_name: parse_player_slot_name(p),
            })
        })
        .collect();

    if local_role.is_none() {
        local_role = local_champion_id
            .or(hovered_champion_id)
            .and_then(|id| repo.primary_role(id));
    }

    // Enemy positions are usually hidden → fall back to the champion's primary role.
    let enemies = s
        .their_team
        .iter()
        .filter_map(|p| {
            let completed_pick_champ = s.actions.iter().find_map(|round| {
                round.iter().find_map(|a| {
                    if a.actor_cell_id == p.cell_id && a.action_type == "pick" && a.completed && a.champion_id > 0 {
                        Some(a.champion_id as u32)
                    } else {
                        None
                    }
                })
            });
            let champ_id = if p.champion_id > 0 {
                Some(p.champion_id as u32)
            } else {
                completed_pick_champ
            }?;

            Some(DraftPick {
                champion_id: champ_id,
                role: Role::from_lcu(&p.assigned_position).or_else(|| repo.primary_role(champ_id)),
                is_local: false,
                is_hover: false,
                spell1_id: if p.spell1_id > 0 { Some(p.spell1_id as u64) } else { None },
                spell2_id: if p.spell2_id > 0 { Some(p.spell2_id as u64) } else { None },
                player_name: parse_player_slot_name(p),
            })
        })
        .collect();

    let is_ban_phase = s.actions.iter().any(|round| {
        round.iter().any(|a| a.action_type == "ban" && a.is_in_progress)
    });
    let local_ban_completed = s.actions.iter().any(|round| {
        round.iter().any(|a| a.actor_cell_id == local_cell && a.action_type == "ban" && a.completed)
    });
    let recent_bans = crate::data::store::get_recent_ban_suggestions();

    DraftState {
        local_role,
        local_champion_id,
        hovered_champion_id,
        is_locked,
        bans: collect_bans(s),
        allies,
        enemies,
        is_ban_phase,
        local_ban_completed,
        recent_bans,
    }
}

/// Normalizes `/lol-gameflow/v1/session` into `DraftState` for live in-game match tracking.
pub fn from_gameflow(
    repo: &Repository,
    session: &crate::lcu::models::GameflowSession,
    local_puuid: Option<&str>,
    local_name: Option<&str>,
    existing: Option<&DraftState>,
) -> Option<DraftState> {
    let gd = session.game_data.as_ref()?;
    if gd.team_one.is_empty() && gd.team_two.is_empty() && gd.player_champion_selections.is_empty() {
        return None;
    }

    let p_in_t1 = gd.team_one.iter().any(|p| {
        (!p.puuid.is_empty() && Some(p.puuid.as_str()) == local_puuid)
            || (!p.game_name.is_empty() && Some(p.game_name.as_str()) == local_name)
            || (!p.summoner_name.is_empty() && Some(p.summoner_name.as_str()) == local_name)
            || existing.map_or(false, |d| d.local_champion_id == Some(p.champion_id as u32))
    });

    let (ally_team, enemy_team) = if p_in_t1 {
        (&gd.team_one, &gd.team_two)
    } else {
        (&gd.team_two, &gd.team_one)
    };

    let parse_player_name = |p: &crate::lcu::models::GameflowPlayer| -> Option<String> {
        if !p.game_name.is_empty() {
            if !p.tag_line.is_empty() {
                Some(format!("{}#{}", p.game_name, p.tag_line))
            } else {
                Some(p.game_name.clone())
            }
        } else if !p.summoner_name.is_empty() {
            Some(p.summoner_name.clone())
        } else {
            None
        }
    };

    let mut local_role = None;
    let mut local_champion_id = None;

    let mut allies: Vec<DraftPick> = ally_team
        .iter()
        .filter(|p| p.champion_id > 0)
        .map(|p| {
            let champ_id = p.champion_id as u32;
            let is_local = (!p.puuid.is_empty() && Some(p.puuid.as_str()) == local_puuid)
                || (!p.game_name.is_empty() && Some(p.game_name.as_str()) == local_name)
                || (!p.summoner_name.is_empty() && Some(p.summoner_name.as_str()) == local_name)
                || existing.map_or(false, |d| d.local_champion_id == Some(champ_id));

            let existing_pick = existing.and_then(|d| d.allies.iter().find(|a| a.champion_id == champ_id));
            let role = existing_pick.and_then(|a| a.role)
                .or_else(|| Role::from_lcu(&p.selected_position))
                .or_else(|| repo.primary_role(champ_id));

            if is_local {
                local_champion_id = Some(champ_id);
                local_role = role;
            }

            DraftPick {
                champion_id: champ_id,
                role,
                is_local,
                is_hover: false,
                spell1_id: if p.spell1_id > 0 { Some(p.spell1_id as u64) } else { None },
                spell2_id: if p.spell2_id > 0 { Some(p.spell2_id as u64) } else { None },
                player_name: parse_player_name(p),
            }
        })
        .collect();

    let mut enemies: Vec<DraftPick> = enemy_team
        .iter()
        .filter(|p| p.champion_id > 0)
        .map(|p| {
            let champ_id = p.champion_id as u32;
            let existing_pick = existing.and_then(|d| d.enemies.iter().find(|e| e.champion_id == champ_id));
            let role = existing_pick.and_then(|e| e.role)
                .or_else(|| Role::from_lcu(&p.selected_position))
                .or_else(|| repo.primary_role(champ_id));

            DraftPick {
                champion_id: champ_id,
                role,
                is_local: false,
                is_hover: false,
                spell1_id: if p.spell1_id > 0 { Some(p.spell1_id as u64) } else { None },
                spell2_id: if p.spell2_id > 0 { Some(p.spell2_id as u64) } else { None },
                player_name: parse_player_name(p),
            }
        })
        .collect();

    // Fill any missing players from player_champion_selections (e.g. solo enemy players not in premades)
    let total_selections = gd.player_champion_selections.len();
    let half_point = (total_selections + 1) / 2;

    for (idx, sel) in gd.player_champion_selections.iter().enumerate() {
        if sel.champion_id == 0 {
            continue;
        }
        let champ_id = sel.champion_id;
        let in_allies = allies.iter().any(|a| a.champion_id == champ_id);
        let in_enemies = enemies.iter().any(|e| e.champion_id == champ_id);

        if !in_allies && !in_enemies {
            let existing_pick = existing.and_then(|d| {
                d.allies.iter().find(|a| a.champion_id == champ_id)
                    .or_else(|| d.enemies.iter().find(|e| e.champion_id == champ_id))
            });
            let role = existing_pick.and_then(|p| p.role).or_else(|| repo.primary_role(champ_id));
            let player_name = existing_pick.and_then(|p| p.player_name.clone());

            let pick = DraftPick {
                champion_id: champ_id,
                role,
                is_local: false,
                is_hover: false,
                spell1_id: if sel.spell1_id > 0 { Some(sel.spell1_id) } else { None },
                spell2_id: if sel.spell2_id > 0 { Some(sel.spell2_id) } else { None },
                player_name,
            };

            // Determine if player belongs to team_one or team_two
            let in_team_one = gd.team_one.iter().any(|p| p.champion_id == champ_id as i64 || (!p.puuid.is_empty() && p.puuid == sel.puuid));
            let in_team_two = gd.team_two.iter().any(|p| p.champion_id == champ_id as i64 || (!p.puuid.is_empty() && p.puuid == sel.puuid));

            let is_team_one = if in_team_one {
                true
            } else if in_team_two {
                false
            } else if let Some(ex) = existing {
                if ex.allies.iter().any(|a| a.champion_id == champ_id) {
                    p_in_t1
                } else if ex.enemies.iter().any(|e| e.champion_id == champ_id) {
                    !p_in_t1
                } else {
                    idx < half_point
                }
            } else {
                idx < half_point
            };

            let is_ally = if p_in_t1 { is_team_one } else { !is_team_one };

            if is_ally && allies.len() < 5 {
                allies.push(pick);
            } else if !is_ally && enemies.len() < 5 {
                enemies.push(pick);
            } else if allies.len() < 5 {
                allies.push(pick);
            } else if enemies.len() < 5 {
                enemies.push(pick);
            }
        }
    }

    // Also fallback to existing draft enemies if still incomplete
    if enemies.len() < 5 {
        if let Some(ex) = existing {
            for ep in &ex.enemies {
                if !allies.iter().any(|a| a.champion_id == ep.champion_id)
                    && !enemies.iter().any(|e| e.champion_id == ep.champion_id)
                {
                    enemies.push(ep.clone());
                    if enemies.len() == 5 {
                        break;
                    }
                }
            }
        }
    }

    if local_role.is_none() {
        if let Some(existing_d) = existing {
            local_role = existing_d.local_role;
            if local_champion_id.is_none() {
                local_champion_id = existing_d.local_champion_id;
            }
        }
    }

    assign_unique_roles(repo, &mut allies);
    assign_unique_roles(repo, &mut enemies);

    Some(DraftState {
        local_role,
        local_champion_id,
        hovered_champion_id: None,
        is_locked: true,
        bans: existing.map(|d| d.bans.clone()).unwrap_or_default(),
        allies,
        enemies,
        is_ban_phase: false,
        local_ban_completed: true,
        recent_bans: crate::data::store::get_recent_ban_suggestions(),
    })
}

/// Assigns unique roles to all picks in a team to prevent duplicate or missing lane assignments.
pub fn assign_unique_roles(repo: &Repository, picks: &mut [DraftPick]) {
    if picks.len() <= 1 {
        return;
    }
    let all_roles = [Role::Top, Role::Jungle, Role::Mid, Role::Adc, Role::Support];
    let mut role_counts: std::collections::HashMap<Role, usize> = std::collections::HashMap::new();
    for p in picks.iter() {
        if let Some(r) = p.role {
            *role_counts.entry(r).or_insert(0) += 1;
        }
    }

    let mut assigned = std::collections::HashSet::new();

    // First pass: claim roles that appear exactly once
    for p in picks.iter() {
        if let Some(r) = p.role {
            if role_counts.get(&r).copied().unwrap_or(0) == 1 {
                assigned.insert(r);
            }
        }
    }

    // Second pass: for conflicting or unassigned picks, allocate remaining roles
    for pick in picks.iter_mut() {
        let is_conflict = pick.role.map_or(true, |r| {
            !assigned.contains(&r) || role_counts.get(&r).copied().unwrap_or(0) > 1
        });
        if is_conflict {
            let prim = repo.primary_role(pick.champion_id);
            let chosen = prim
                .filter(|r| !assigned.contains(r))
                .or_else(|| all_roles.iter().find(|r| !assigned.contains(r)).copied());

            if let Some(r) = chosen {
                pick.role = Some(r);
                assigned.insert(r);
            }
        }
    }
}

/// Helper to check if a target display name (e.g. from existing draft or active player)
/// matches a LiveClientPlayer's Riot ID or summoner name.
pub fn matches_player_name(expected: &str, p: &crate::lcu::models::LiveClientPlayer) -> bool {
    let exp = expected.trim();
    if exp.is_empty() {
        return false;
    }
    // Check against p.riot_id (e.g. "Player#EUW")
    if !p.riot_id.is_empty() && p.riot_id != "#" {
        if exp.eq_ignore_ascii_case(&p.riot_id) {
            return true;
        }
    }
    // Check against game_name#tag_line or game_name
    if !p.riot_id_game_name.is_empty() {
        if !p.riot_id_tag_line.is_empty() {
            let combined = format!("{}#{}", p.riot_id_game_name, p.riot_id_tag_line);
            if exp.eq_ignore_ascii_case(&combined) {
                return true;
            }
        }
        if exp.eq_ignore_ascii_case(&p.riot_id_game_name) {
            return true;
        }
        if let Some(prefix) = exp.split('#').next() {
            if prefix.eq_ignore_ascii_case(&p.riot_id_game_name) {
                return true;
            }
        }
    }
    // Check against summoner_name
    if !p.summoner_name.is_empty() {
        if exp.eq_ignore_ascii_case(&p.summoner_name) {
            return true;
        }
        if let Some(prefix) = exp.split('#').next() {
            if prefix.eq_ignore_ascii_case(&p.summoner_name) {
                return true;
            }
        }
    }
    false
}

/// Helper to check if a live client player represents a disguised or non-champion entity
/// (such as Neeko transformed into a minion, jungle monster, ward, or plant).
pub fn is_non_champion_entity(name: &str) -> bool {
    let lower = name.trim().to_lowercase();
    lower.is_empty()
        || lower.starts_with("sru_")
        || lower.contains("minion")
        || lower.contains("ward")
        || lower.contains("trinket")
        || lower.contains("plant")
        || lower.contains("crab")
        || lower.contains("turret")
}

/// Helper to detect true champion ID of active player from innate ability IDs.
/// In League's Live Client Data API, ability IDs (like `NeekoPassive`, `NeekoQ`, `ViegoPassive`, `ViegoR`)
/// preserve the champion's true identity even during disguises, shapeshifts, or possessions.
pub fn detect_active_champion_from_abilities(
    repo: &Repository,
    active: Option<&crate::lcu::models::LiveClientActivePlayer>,
) -> Option<u32> {
    let act = active?;
    let abilities = act.abilities.as_ref()?;

    let ability_ids = [
        abilities.passive.as_ref().map(|a| a.id.as_str()),
        abilities.q.as_ref().map(|a| a.id.as_str()),
        abilities.w.as_ref().map(|a| a.id.as_str()),
        abilities.e.as_ref().map(|a| a.id.as_str()),
        abilities.r.as_ref().map(|a| a.id.as_str()),
    ];

    // Priority checks for notorious shapeshifters/possessors
    for id_opt in &ability_ids {
        if let Some(id) = id_opt {
            let lower = id.to_lowercase();
            if lower.contains("neeko") {
                if let Some(champ) = repo.get_by_name("Neeko") {
                    return Some(champ.champion_id);
                }
            }
            if lower.contains("viego") {
                if let Some(champ) = repo.get_by_name("Viego") {
                    return Some(champ.champion_id);
                }
            }
        }
    }

    // Generic check: match prefix of passive or R ability against known champion names in repo
    for id_opt in &ability_ids {
        if let Some(id) = id_opt {
            for suffix in &["Passive", "Q", "W", "E", "R", "Spell"] {
                if let Some(prefix) = id.strip_suffix(suffix) {
                    if let Some(champ) = repo.get_by_name(prefix) {
                        return Some(champ.champion_id);
                    }
                }
            }
        }
    }

    None
}

/// Parse live in-game state directly from Riot's Live Client Data API (`https://127.0.0.1:2999`).
pub fn from_live_client(
    repo: &Repository,
    players: &[crate::lcu::models::LiveClientPlayer],
    active: Option<&crate::lcu::models::LiveClientActivePlayer>,
    existing: Option<&DraftState>,
) -> Option<DraftState> {
    if players.is_empty() {
        return None;
    }

    let active_name = active.and_then(|a| {
        if !a.riot_id.is_empty() && a.riot_id != "#" {
            Some(a.riot_id.clone())
        } else if !a.riot_id_game_name.is_empty() {
            if !a.riot_id_tag_line.is_empty() {
                Some(format!("{}#{}", a.riot_id_game_name, a.riot_id_tag_line))
            } else {
                Some(a.riot_id_game_name.clone())
            }
        } else if !a.summoner_name.is_empty() {
            Some(a.summoner_name.clone())
        } else {
            None
        }
    });

    let existing_local_name = existing
        .and_then(|d| d.allies.iter().find(|a| a.is_local))
        .and_then(|a| a.player_name.as_deref());

    let is_player_local = |p: &crate::lcu::models::LiveClientPlayer| -> bool {
        if let Some(act_name) = active_name.as_deref() {
            if matches_player_name(act_name, p) {
                return true;
            }
        }
        if let Some(loc_name) = existing_local_name {
            if matches_player_name(loc_name, p) {
                return true;
            }
        }
        // Fallback: only if active_name and existing_local_name are absent, match by local champion
        if active_name.is_none() && existing_local_name.is_none() {
            if let Some(cid) = existing.and_then(|d| d.local_champion_id) {
                if repo.get(cid).map_or(false, |c| {
                    c.name.eq_ignore_ascii_case(&p.champion_name)
                        || c.image.eq_ignore_ascii_case(&p.champion_name)
                }) {
                    return true;
                }
            }
        }
        false
    };

    let active_team = players
        .iter()
        .find(|p| is_player_local(p))
        .map(|p| p.team.as_str())
        .unwrap_or_else(|| {
            // Secondary search if active_name was matched partially or existing local champion
            players
                .iter()
                .find(|p| {
                    existing.and_then(|d| d.local_champion_id).map_or(false, |cid| {
                        repo.get(cid).map_or(false, |c| {
                            c.name.eq_ignore_ascii_case(&p.champion_name)
                                || c.image.eq_ignore_ascii_case(&p.champion_name)
                        })
                    })
                })
                .map(|p| p.team.as_str())
                .unwrap_or("ORDER")
        });

    let parse_spell_id = |s: Option<&crate::lcu::models::LiveClientSpell>| -> Option<u64> {
        let sp = s?;
        let text = format!("{} {} {}", sp.display_name, sp.raw_description, sp.raw_display_name).to_lowercase();
        if text.contains("flash") {
            Some(4)
        } else if text.contains("dot") || text.contains("ignite") {
            Some(14)
        } else if text.contains("teleport") {
            Some(12)
        } else if text.contains("smite") {
            Some(11)
        } else if text.contains("heal") {
            Some(7)
        } else if text.contains("barrier") {
            Some(21)
        } else if text.contains("exhaust") {
            Some(3)
        } else if text.contains("haste") || text.contains("ghost") {
            Some(6)
        } else if text.contains("boost") || text.contains("cleanse") {
            Some(1)
        } else if text.contains("mana") || text.contains("clarity") {
            Some(13)
        } else {
            None
        }
    };

    // The true champion of the local player:
    // 1. Existing local_champion_id if already known (> 0)
    // 2. Active player abilities check (handles opening app mid-game while Neeko/Viego is transformed)
    let true_local_champion_id = existing
        .and_then(|d| d.local_champion_id)
        .filter(|&id| id > 0)
        .or_else(|| detect_active_champion_from_abilities(repo, active));

    let mut local_role = existing.and_then(|e| e.local_role);
    let mut local_champion_id = true_local_champion_id;

    let mut allies = Vec::new();
    let mut enemies = Vec::new();

    for p in players {
        let is_ally = p.team == active_team;
        let is_local = is_ally && is_player_local(p);

        // Find corresponding existing pick if known
        let existing_pick = existing.and_then(|ex| {
            if is_local {
                ex.allies.iter().find(|a| a.is_local)
            } else if is_ally {
                ex.allies.iter().find(|a| {
                    !a.is_local && a.player_name.as_deref().map_or(false, |name| matches_player_name(name, p))
                })
            } else {
                ex.enemies.iter().find(|e| {
                    e.player_name.as_deref().map_or(false, |name| matches_player_name(name, p))
                })
            }
        });

        // Resolve Player Name
        let player_name = if !p.riot_id.is_empty() && p.riot_id != "#" {
            Some(p.riot_id.clone())
        } else if !p.riot_id_game_name.is_empty() {
            if !p.riot_id_tag_line.is_empty() {
                Some(format!("{}#{}", p.riot_id_game_name, p.riot_id_tag_line))
            } else {
                Some(p.riot_id_game_name.clone())
            }
        } else if !p.summoner_name.is_empty() {
            Some(p.summoner_name.clone())
        } else {
            existing_pick.and_then(|ep| ep.player_name.clone())
        };

        // Determine True Champion ID
        let champ_id = if is_local && true_local_champion_id.is_some() {
            true_local_champion_id.unwrap()
        } else if let Some(ep) = existing_pick.filter(|ep| ep.champion_id > 0) {
            // Player was already registered in existing draft (e.g. champ select / earlier tick).
            // NEVER overwrite their true champion ID when p.champion_name reflects a temporary
            // transformation (Neeko disguise, Viego possession, minion/monster disguise).
            ep.champion_id
        } else if is_non_champion_entity(&p.champion_name) {
            // Non-champion entity in playerlist (minion, ward, jungle monster, plant)
            // In League of Legends, ONLY Neeko can disguise as non-champion units.
            repo.get_by_name("Neeko").map(|c| c.champion_id).unwrap_or(518)
        } else {
            // Standard lookup
            let champ_opt = repo.get_by_name(&p.champion_name);
            champ_opt.map(|c| c.champion_id).unwrap_or(0)
        };

        // If champ_id is still 0 (e.g. unrecognized disguise), fallback to Neeko
        let champ_id = if champ_id == 0 {
            repo.get_by_name("Neeko").map(|c| c.champion_id).unwrap_or(518)
        } else {
            champ_id
        };

        // Resolve Role
        let role = existing_pick.and_then(|ep| ep.role)
            .or_else(|| Role::from_lcu(&p.position))
            .or_else(|| repo.primary_role(champ_id));

        if is_local {
            if local_role.is_none() {
                local_role = role;
            }
            if local_champion_id.is_none() {
                local_champion_id = Some(champ_id);
            }
        }

        // Resolve Spells
        let spell1_id = p.summoner_spells.as_ref()
            .and_then(|s| parse_spell_id(s.summoner_spell_one.as_ref()))
            .or_else(|| existing_pick.and_then(|ep| ep.spell1_id));

        let spell2_id = p.summoner_spells.as_ref()
            .and_then(|s| parse_spell_id(s.summoner_spell_two.as_ref()))
            .or_else(|| existing_pick.and_then(|ep| ep.spell2_id));

        let pick = DraftPick {
            champion_id: champ_id,
            role,
            is_local,
            is_hover: false,
            spell1_id,
            spell2_id,
            player_name,
        };

        if is_ally {
            allies.push(pick);
        } else {
            enemies.push(pick);
        }
    }

    // Guard against duplicate champions on the same team in standard modes
    // (e.g. Neeko disguised as an ally when app opened mid-match without existing state)
    let fix_team_disguise_duplicates = |team: &mut Vec<DraftPick>| {
        let mut seen = std::collections::HashSet::new();
        for pick in team.iter_mut() {
            if pick.champion_id > 0 {
                if seen.contains(&pick.champion_id) {
                    // Duplicate found on the same team! In League, this is Neeko disguised as her teammate.
                    if let Some(neeko) = repo.get_by_name("Neeko") {
                        pick.champion_id = neeko.champion_id;
                        pick.role = repo.primary_role(neeko.champion_id);
                    }
                } else {
                    seen.insert(pick.champion_id);
                }
            }
        }
    };
    fix_team_disguise_duplicates(&mut allies);
    fix_team_disguise_duplicates(&mut enemies);

    if local_role.is_none() {
        local_role = existing.and_then(|e| e.local_role);
    }
    if local_champion_id.is_none() {
        local_champion_id = existing.and_then(|e| e.local_champion_id);
    }

    assign_unique_roles(repo, &mut allies);
    assign_unique_roles(repo, &mut enemies);

    Some(DraftState {
        local_role,
        local_champion_id,
        hovered_champion_id: None,
        is_locked: true,
        bans: existing.map(|d| d.bans.clone()).unwrap_or_default(),
        allies,
        enemies,
        is_ban_phase: false,
        local_ban_completed: true,
        recent_bans: crate::data::store::get_recent_ban_suggestions(),
    })
}

/// Resolves a player slot's champion and hover state:
/// - If locked in (p.champion_id > 0 or completed pick action): Some((champ_id, false))
/// - If hovering (active/uncompleted pick action or champion_pick_intent): Some((champ_id, true))
/// - If no champion selected: None
fn resolve_player_champion(s: &ChampSelectSession, p: &crate::lcu::models::PlayerSlot) -> Option<(u32, bool)> {
    // 1. Check if locked in (completed pick action or slot champion_id > 0)
    let completed_pick = s.actions.iter().find_map(|round| {
        round.iter().find_map(|a| {
            if a.actor_cell_id == p.cell_id && a.action_type == "pick" && a.completed && a.champion_id > 0 {
                Some(a.champion_id as u32)
            } else {
                None
            }
        })
    });

    if p.champion_id > 0 {
        return Some((p.champion_id as u32, false));
    }
    if let Some(id) = completed_pick {
        return Some((id, false));
    }

    // 2. Check hovered champion:
    // First, active/in-progress pick action with champion_id > 0
    let in_progress_action = s.actions.iter().find_map(|round| {
        round.iter().find_map(|a| {
            if a.actor_cell_id == p.cell_id
                && a.action_type == "pick"
                && !a.completed
                && a.is_in_progress
                && a.champion_id > 0
            {
                Some(a.champion_id as u32)
            } else {
                None
            }
        })
    });
    if let Some(id) = in_progress_action {
        return Some((id, true));
    }

    // Second, any uncompleted pick action with champion_id > 0
    let uncompleted_action = s.actions.iter().rev().find_map(|round| {
        round.iter().rev().find_map(|a| {
            if a.actor_cell_id == p.cell_id
                && a.action_type == "pick"
                && !a.completed
                && a.champion_id > 0
            {
                Some(a.champion_id as u32)
            } else {
                None
            }
        })
    });
    if let Some(id) = uncompleted_action {
        return Some((id, true));
    }

    // Third, champion pick intent from declaration phase
    if p.champion_pick_intent > 0 {
        return Some((p.champion_pick_intent as u32, true));
    }

    None
}

/// Union of declared bans and completed ban actions, de-duplicated.
fn collect_bans(s: &ChampSelectSession) -> Vec<u32> {
    let mut bans: Vec<u32> = s
        .bans
        .my_team_bans
        .iter()
        .chain(s.bans.their_team_bans.iter())
        .filter(|id| **id > 0)
        .map(|id| *id as u32)
        .collect();

    for round in &s.actions {
        for a in round {
            if a.action_type == "ban" && a.completed && a.champion_id > 0 {
                bans.push(a.champion_id as u32);
            }
        }
    }

    bans.sort_unstable();
    bans.dedup();
    bans
}
