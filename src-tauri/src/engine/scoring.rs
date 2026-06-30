//! Composes the weighted Pick Recommendation Score.
//!
//! For each eligible champion `c` in the user's role:
//!
//! ```text
//! net = w_matchup * matchupAdv(c)      // vs the direct laner
//!     + w_synergy * synergyAdv(c)      // proximity-weighted ally synergy
//!     + w_counter * counterAdv(c)      // vs the rest of the enemy team
//!     + w_comp    * compBonus(c)       // fills AP/AD/frontline gap
//!     + baseline  * globalAdv(c)       // overall role strength (tie-breaker)
//!
//! score = clamp(50 + net * DISPLAY_SCALE, 0, 100)
//! ```
//!
//! Every win-rate input is Bayesian-smoothed and centred on 0.50 (so an
//! "advantage" is the signed distance from a coin-flip).

use serde::Serialize;

use crate::data::models::{Champion, Role};
use crate::data::repository::Repository;
use crate::draft::DraftState;
use crate::engine::{bayesian, comp, synergy, weights};

#[derive(Debug, Clone, Serialize)]
pub struct Recommendation {
    pub champion_id: u32,
    pub name: String,
    pub image: String,
    pub score: f64, // 0–100 display score
    pub components: Components,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Components {
    pub matchup: f64,
    pub synergy: f64,
    pub counter: f64,
    pub comp: f64,
}

/// Rank the top 5 picks for the local player's role.
pub fn recommend(repo: &Repository, draft: &DraftState, w: &weights::Weights) -> Vec<Recommendation> {
    let role = match draft.local_role {
        Some(r) => r,
        None => return Vec::new(),
    };

    let needs = comp::needs(repo, draft);

    // Direct lane opponent: the enemy whose (inferred) role matches ours.
    let lane_opponent = draft
        .enemies
        .iter()
        .find(|e| e.role == Some(role))
        .map(|e| e.champion_id);

    let mut out: Vec<Recommendation> = repo
        .playable_in(role)
        // Exclude banned and already-taken champions.
        .filter(|c| !draft.bans.contains(&c.champion_id))
        .filter(|c| !draft.allies.iter().any(|a| a.champion_id == c.champion_id))
        .filter(|c| !draft.enemies.iter().any(|e| e.champion_id == c.champion_id))
        .map(|c| score_one(repo, draft, w, role, c, lane_opponent, &needs))
        .collect();

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(5);
    out
}

#[allow(clippy::too_many_arguments)]
fn score_one(
    repo: &Repository,
    draft: &DraftState,
    w: &weights::Weights,
    role: Role,
    c: &Champion,
    lane_opponent: Option<u32>,
    needs: &comp::CompNeeds,
) -> Recommendation {
    let prior = repo.global_avg();
    let role_stats = c.role_stats(role);
    let mut reasons: Vec<String> = Vec::new();

    // Overall role strength (centred on 0.50).
    let global_adv = role_stats
        .map(|s| bayesian::smooth(s.global_winrate, s.games, prior, weights::SMOOTH_C) - 0.5)
        .unwrap_or(0.0);

    // --- 1. Lane matchup vs the direct opponent (highest priority) ---
    // The hard sample-size threshold gates the *value*, not just the badge: a
    // sub-threshold cell is treated as invalid and we fall back to overall
    // strength, so a 2-game outlier can never skew the score.
    let matchup_adv = match (role_stats, lane_opponent) {
        (Some(s), Some(opp)) => match s.matchups.get(&opp) {
            Some(cell) if cell.games >= weights::MIN_MATCHES => {
                let adj = bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C);
                if adj > 0.52 {
                    if let Some(o) = repo.get(opp) {
                        reasons.push(format!("Strong lane counter to {}", o.name));
                    }
                }
                adj - 0.5
            }
            // Missing or below threshold → lean on overall role strength.
            _ => global_adv,
        },
        // Unknown laner → lean on overall strength.
        _ => global_adv,
    };

    // --- 2. Ally synergy, weighted by role proximity ---
    let (synergy_adv, best_synergy) = synergy_advantage(repo, draft, role, role_stats);
    if let Some(name) = best_synergy {
        reasons.push(format!("High synergy with {name}"));
    }

    // --- 3. Counter vs the rest of the revealed enemy team ---
    let counter_adv = counter_advantage(draft, role_stats, lane_opponent, prior);

    // --- 4. Team-comp balance ---
    let (comp_bonus, comp_reasons) = comp::bonus(c, needs);
    reasons.extend(comp_reasons.into_iter().map(String::from));

    // Weighted composition.
    let net = w.matchup * matchup_adv
        + w.synergy * synergy_adv
        + w.counter * counter_adv
        + w.comp * comp_bonus
        + weights::BASELINE_WEIGHT * global_adv;

    let score = (50.0 + net * weights::DISPLAY_SCALE).clamp(0.0, 100.0);

    if reasons.is_empty() {
        reasons.push("Solid blind pick for your role".to_string());
    }
    reasons.truncate(2); // keep the UI badges concise

    Recommendation {
        champion_id: c.champion_id,
        name: c.name.clone(),
        image: c.image.clone(),
        score,
        components: Components {
            matchup: matchup_adv,
            synergy: synergy_adv,
            counter: counter_adv,
            comp: comp_bonus,
        },
        reasons,
    }
}

/// Proximity-weighted mean synergy advantage, plus the strongest ally (for the badge).
fn synergy_advantage(
    repo: &Repository,
    draft: &DraftState,
    role: Role,
    role_stats: Option<&crate::data::models::RoleStats>,
) -> (f64, Option<String>) {
    let stats = match role_stats {
        Some(s) => s,
        None => return (0.0, None),
    };

    let prior = repo.global_avg();
    let (mut num, mut den) = (0.0, 0.0);
    let mut best: Option<(f64, String)> = None;

    for ally in &draft.allies {
        if ally.is_local {
            continue;
        }
        let ally_role = match ally.role {
            Some(r) => r,
            None => continue,
        };
        let prox = synergy::proximity(role, ally_role);
        if prox <= 0.0 {
            continue;
        }
        if let Some(cell) = stats.synergies.get(&ally.champion_id) {
            // Honour the hard sample-size threshold here too.
            if cell.games < weights::MIN_MATCHES {
                continue;
            }
            let adj = bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C);
            let weighted = prox * (adj - 0.5);
            num += weighted;
            den += prox;

            if adj > 0.52 {
                if best.as_ref().map_or(true, |(b, _)| weighted > *b) {
                    if let Some(a) = repo.get(ally.champion_id) {
                        best = Some((weighted, a.name.clone()));
                    }
                }
            }
        }
    }

    let adv = if den > 0.0 { num / den } else { 0.0 };
    (adv, best.map(|(_, name)| name))
}

/// Mean matchup advantage vs every revealed enemy except the direct laner.
fn counter_advantage(
    draft: &DraftState,
    role_stats: Option<&crate::data::models::RoleStats>,
    lane_opponent: Option<u32>,
    prior: f64,
) -> f64 {
    let stats = match role_stats {
        Some(s) => s,
        None => return 0.0,
    };

    let (mut sum, mut n) = (0.0, 0.0);
    for enemy in &draft.enemies {
        if Some(enemy.champion_id) == lane_opponent {
            continue;
        }
        if let Some(cell) = stats.matchups.get(&enemy.champion_id) {
            if cell.games < weights::MIN_MATCHES {
                continue;
            }
            let adj = bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C);
            sum += adj - 0.5;
            n += 1.0;
        }
    }

    if n > 0.0 {
        sum / n
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::models::Role;
    use crate::data::repository::Repository;
    use crate::draft::{DraftPick, DraftState};
    use crate::engine::weights::Weights;

    // Validates the whole pipeline headlessly: the embedded JSON must
    // deserialize into the structs, and the engine must rank sensibly.
    #[test]
    fn embedded_dataset_loads_and_ranks() {
        let repo = Repository::load_embedded().expect("embedded dataset deserializes");

        let draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            bans: vec![],
            // Ally jungler with no AP and no frontline → team needs both.
            allies: vec![DraftPick {
                champion_id: 64,
                role: Some(Role::Jungle),
                is_local: false,
            }],
            // Enemy top laner = Darius.
            enemies: vec![DraftPick {
                champion_id: 122,
                role: Some(Role::Top),
                is_local: false,
            }],
        };

        let recs = recommend(&repo, &draft, &Weights::default());

        assert_eq!(recs.len(), 5, "should return a Top 5");
        // Malphite (54): counters Darius + fills the AP & frontline gaps → #1.
        assert_eq!(recs[0].champion_id, 54, "Malphite should rank first");
        assert!(!recs[0].reasons.is_empty(), "top pick should have a why-badge");
        // Scores must be in descending order.
        for w in recs.windows(2) {
            assert!(w[0].score >= w[1].score, "scores must be sorted descending");
        }
    }

    #[test]
    fn low_sample_outlier_is_not_trusted() {
        // Teemo (17) has an 85%-over-18-games matchup vs Darius in the dataset.
        // It must NOT outrank Malphite — proof the hard threshold gates the score.
        let repo = Repository::load_embedded().unwrap();
        let draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            bans: vec![],
            allies: vec![],
            enemies: vec![DraftPick {
                champion_id: 122,
                role: Some(Role::Top),
                is_local: false,
            }],
        };
        let recs = recommend(&repo, &draft, &Weights::default());
        let teemo = recs.iter().position(|r| r.champion_id == 17);
        let malphite = recs.iter().position(|r| r.champion_id == 54);
        if let (Some(t), Some(m)) = (teemo, malphite) {
            assert!(m < t, "Malphite must outrank the low-sample Teemo pick");
        }
    }
}
