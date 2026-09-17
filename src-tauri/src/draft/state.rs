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

    DraftState {
        local_role,
        local_champion_id,
        hovered_champion_id,
        is_locked,
        bans: collect_bans(s),
        allies,
        enemies,
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
    if gd.team_one.is_empty() && gd.team_two.is_empty() {
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

    let allies: Vec<DraftPick> = ally_team
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

    let enemies: Vec<DraftPick> = enemy_team
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

    if local_role.is_none() {
        if let Some(existing_d) = existing {
            local_role = existing_d.local_role;
            if local_champion_id.is_none() {
                local_champion_id = existing_d.local_champion_id;
            }
        }
    }

    Some(DraftState {
        local_role,
        local_champion_id,
        hovered_champion_id: None,
        is_locked: true,
        bans: existing.map(|d| d.bans.clone()).unwrap_or_default(),
        allies,
        enemies,
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
