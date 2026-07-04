//! Team-composition balance: reward picks that fill a damage-type or frontline gap.

use crate::data::models::{Champion, DamageType};
use crate::data::repository::Repository;
use crate::draft::DraftState;

#[derive(Debug, Default, Clone)]
pub struct CompNeeds {
    pub needs_ap: bool,
    pub needs_ad: bool,
    pub needs_frontline: bool,
}

/// Inspect already-locked allies (excluding the local player) to find gaps.
pub fn needs(repo: &Repository, draft: &DraftState) -> CompNeeds {
    let (mut ap, mut ad, mut frontline, mut locked) = (0u32, 0u32, 0u32, 0u32);

    for ally in &draft.allies {
        if ally.is_local {
            continue;
        }
        if let Some(c) = repo.get(ally.champion_id) {
            locked += 1;
            match c.damage {
                DamageType::Magic => ap += 1,
                DamageType::Physical => ad += 1,
                DamageType::Mixed => {
                    ap += 1;
                    ad += 1;
                }
            }
            if c.frontline {
                frontline += 1;
            }
        }
    }

    // With zero allies locked in yet (e.g. a true first pick), there's no
    // team data to indicate a real gap — "every category is missing" is
    // trivially true and would hand every candidate a bonus for no reason.
    if locked == 0 {
        return CompNeeds::default();
    }

    CompNeeds {
        needs_ap: ap == 0,
        needs_ad: ad == 0,
        needs_frontline: frontline == 0,
    }
}

/// Bonus in roughly [0, 0.12] for a candidate that fills the team's gaps,
/// plus any human-readable reasons it earned.
pub fn bonus(candidate: &Champion, needs: &CompNeeds) -> (f64, Vec<&'static str>) {
    let mut bonus = 0.0;
    let mut reasons: Vec<&'static str> = Vec::new();

    match candidate.damage {
        DamageType::Magic if needs.needs_ap => {
            bonus += 0.06;
            reasons.push("Adds missing magic damage");
        }
        DamageType::Physical if needs.needs_ad => {
            bonus += 0.06;
            reasons.push("Adds missing physical damage");
        }
        DamageType::Mixed => {
            if needs.needs_ap {
                bonus += 0.03;
            }
            if needs.needs_ad {
                bonus += 0.03;
            }
            if bonus > 0.0 {
                reasons.push("Adds flexible mixed damage");
            }
        }
        _ => {}
    }

    if needs.needs_frontline && candidate.frontline {
        bonus += 0.06;
        reasons.push("Provides a frontline/tank");
    }

    (bonus, reasons)
}
