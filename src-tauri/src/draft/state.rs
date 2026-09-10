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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftPick {
    pub champion_id: u32,
    pub role: Option<Role>,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default)]
    pub spell1_id: Option<u64>,
    #[serde(default)]
    pub spell2_id: Option<u64>,
}

pub fn from_session(repo: &Repository, s: &ChampSelectSession) -> DraftState {
    let local_cell = s.local_player_cell_id;
    let local_slot = s.my_team.iter().find(|p| p.cell_id == local_cell);

    let local_role = local_slot.and_then(|p| Role::from_lcu(&p.assigned_position));

    // Check if the local player has locked in a champion (completed pick action)
    let is_locked = s.actions.iter().any(|round| {
        round.iter().any(|a| a.actor_cell_id == local_cell && a.action_type == "pick" && a.completed && a.champion_id > 0)
    });

    let action_champ = s.actions.iter().find_map(|round| {
        round.iter().find_map(|a| {
            if a.actor_cell_id == local_cell && a.action_type == "pick" && a.champion_id > 0 {
                Some(a.champion_id as u32)
            } else {
                None
            }
        })
    });

    let slot_champ = local_slot
        .map(|p| p.champion_id)
        .filter(|id| *id > 0)
        .map(|id| id as u32);

    let (local_champion_id, hovered_champion_id) = if is_locked {
        (slot_champ.or(action_champ), None)
    } else {
        (None, action_champ.or(slot_champ))
    };

    let allies = s
        .my_team
        .iter()
        .filter(|p| p.champion_id > 0)
        .map(|p| DraftPick {
            champion_id: p.champion_id as u32,
            role: Role::from_lcu(&p.assigned_position),
            is_local: p.cell_id == local_cell,
            spell1_id: if p.spell1_id > 0 { Some(p.spell1_id as u64) } else { None },
            spell2_id: if p.spell2_id > 0 { Some(p.spell2_id as u64) } else { None },
        })
        .collect();

    // Enemy positions are usually hidden → fall back to the champion's primary role.
    let enemies = s
        .their_team
        .iter()
        .filter(|p| p.champion_id > 0)
        .map(|p| {
            let id = p.champion_id as u32;
            DraftPick {
                champion_id: id,
                role: Role::from_lcu(&p.assigned_position).or_else(|| repo.primary_role(id)),
                is_local: false,
                spell1_id: if p.spell1_id > 0 { Some(p.spell1_id as u64) } else { None },
                spell2_id: if p.spell2_id > 0 { Some(p.spell2_id as u64) } else { None },
            }
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
