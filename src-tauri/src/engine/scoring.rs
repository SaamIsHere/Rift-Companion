//! Composes the weighted Pick Recommendation Score.
//!
//! For each eligible champion `c` in the user's role, the base win rate for
//! that role is refined by every locked ally and revealed enemy, each
//! contributing a `matrix_weight * (their_winrate_delta)` term. The matrix
//! cell depends on the *local player's role* and the *other pick's role*
//! (`weights::ALLY_WEIGHTS` / `weights::ENEMY_WEIGHTS`), so e.g. an ADC
//! leans much harder on its Support's synergy than a Top laner leans on
//! its Jungler's.
//!
//! ```text
//! wr_refined = wr_base(c) + weighted_avg(ally deltas, enemy deltas)
//! net        = (wr_refined - 0.50) + w_comp * compBonus(c)
//! score      = clamp(50 + net * DISPLAY_SCALE, 0, 100)
//! ```
//!
//! Critically this is a weighted *average*, not a weighted *sum* — every
//! delta is divided by the **fixed full matrix row total** for the role
//! (all 4 ally weights + all 4 enemy weights), not just the weight of picks
//! revealed so far. That fixed denominator matters: dividing by only the
//! *present* weight would let a single revealed relationship pass through
//! at near-full raw magnitude (the weight cancels out when it's the only
//! term), producing wildly overconfident scores early in a draft. Dividing
//! by the full row instead means an unrevealed pick contributes weight but
//! a delta of 0.0, so the score's confidence — and swing — grows as the
//! draft actually fills in, mirroring how the old fixed coefficients
//! (`w_matchup = 0.40`, etc.) used to cap any single relationship's pull.
//!
//! Every win-rate input is Bayesian-smoothed and centred on 0.50 (so an
//! "advantage" is the signed distance from a coin-flip). A matchup/synergy
//! cell below `MIN_MATCHES` games is excluded entirely rather than merely
//! down-weighted, so a 2-game 100%/0% outlier can't skew a pick.

use serde::Serialize;

use crate::data::models::{Champion, Role};
use crate::data::repository::Repository;
use crate::draft::DraftState;
use crate::engine::{bayesian, comp, weights};

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

/// Rank every playable champion for the local player's role, sorted by
/// score descending. Returns the full pool (not just a top-N slice) so the
/// frontend can show every candidate and let the user search/filter it.
pub fn recommend(repo: &Repository, draft: &DraftState, w: &weights::Weights) -> Vec<Recommendation> {
    let role = match draft.local_role {
        Some(r) => r,
        None => return Vec::new(),
    };

    let needs = comp::needs(repo, draft);

    let mut out: Vec<Recommendation> = repo
        .playable_in(role)
        // Exclude banned and already-taken champions.
        .filter(|c| !draft.bans.contains(&c.champion_id))
        .filter(|c| !draft.allies.iter().any(|a| a.champion_id == c.champion_id))
        .filter(|c| !draft.enemies.iter().any(|e| e.champion_id == c.champion_id))
        .map(|c| score_one(repo, draft, w, role, c, &needs))
        .collect();

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out
}

fn score_one(
    repo: &Repository,
    draft: &DraftState,
    w: &weights::Weights,
    role: Role,
    c: &Champion,
    needs: &comp::CompNeeds,
) -> Recommendation {
    let prior = repo.global_avg();
    let role_stats = c.role_stats(role);
    let mut reasons: Vec<String> = Vec::new();

    // Base win rate for the role, Bayesian-smoothed over every game the
    // champion has played there (not just its strongest single matchup).
    let wr_base = role_stats
        .map(|s| bayesian::smooth(s.global_winrate, s.games, prior, weights::SMOOTH_C))
        .unwrap_or(prior);

    let refined = refined_advantage(repo, draft, role, role_stats, prior, &mut reasons);

    let wr_refined = (wr_base + refined.avg_delta).clamp(0.02, 0.98);

    // --- Team-comp balance (structural bonus, not a win-rate delta) ---
    let (comp_bonus, comp_reasons) = comp::bonus(c, needs);
    reasons.extend(comp_reasons.into_iter().map(String::from));

    // The base win rate maps to the score 1:1 — with nothing else revealed
    // (a true first pick), the score should read as exactly the champion's
    // real win rate, not an amplified version of it. Only the *refinement*
    // on top of that base (ally/enemy deltas + the comp bonus) gets the
    // DISPLAY_SCALE treatment, since those deltas are naturally small
    // (a few percentage points) and need amplifying to read clearly.
    let refinement = (wr_refined - wr_base) + w.comp * comp_bonus;
    let score = (wr_base * 100.0 + refinement * weights::DISPLAY_SCALE).clamp(0.0, 100.0);

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
            matchup: refined.matchup,
            synergy: refined.synergy,
            counter: refined.counter,
            comp: comp_bonus,
        },
        reasons,
    }
}

struct RefinedAdvantage {
    /// Combined weighted-average delta across every present ally + enemy
    /// relationship. `matchup + synergy + counter == avg_delta`.
    avg_delta: f64,
    /// This role's weighted share of the direct lane opponent's delta.
    matchup: f64,
    /// This role's weighted share of ally synergy deltas.
    synergy: f64,
    /// This role's weighted share of non-lane-opponent enemy deltas.
    counter: f64,
}

/// Blends every locked ally and revealed enemy into a single weighted
/// average win-rate delta, using the local player's role to pick the right
/// row of `ALLY_WEIGHTS` / `ENEMY_WEIGHTS`. Also pushes "why" badges for the
/// strongest qualifying synergy/matchup found along the way.
fn refined_advantage(
    repo: &Repository,
    draft: &DraftState,
    role: Role,
    role_stats: Option<&crate::data::models::RoleStats>,
    prior: f64,
    reasons: &mut Vec<String>,
) -> RefinedAdvantage {
    let stats = match role_stats {
        Some(s) => s,
        None => {
            return RefinedAdvantage { avg_delta: 0.0, matchup: 0.0, synergy: 0.0, counter: 0.0 };
        }
    };

    // Fixed denominator: the *entire* matrix row for this role, not just the
    // weight of picks revealed so far. A pick that hasn't been locked yet
    // still occupies its slice of the row (contributing weight but a delta
    // of 0.0), so a single strong matchup can't pass through at near-full
    // magnitude just because it happens to be the only thing revealed early
    // in the draft — confidence grows as the draft actually fills in.
    let row_total: f64 = weights::ALLY_WEIGHTS[role.index()].iter().sum::<f64>()
        + weights::ENEMY_WEIGHTS[role.index()].iter().sum::<f64>();

    let mut weighted_matchup = 0.0; // direct lane opponent only
    let mut weighted_synergy = 0.0; // allies
    let mut weighted_counter = 0.0; // enemies other than the direct opponent
    let mut best_synergy: Option<(f64, String)> = None;

    for ally in &draft.allies {
        if ally.is_local {
            continue;
        }
        let ally_role = match ally.role {
            Some(r) => r,
            None => continue, // empty role slot → delta is 0.0 (skip entirely)
        };
        let weight = weights::ALLY_WEIGHTS[role.index()][ally_role.index()];
        if weight <= 0.0 {
            continue;
        }
        let Some(cell) = stats.synergies.get(&ally.champion_id) else { continue };
        if cell.games < weights::MIN_MATCHES {
            continue; // too few games to trust — excluded, not just down-weighted
        }
        let adj = bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C);
        let delta = adj - 0.5;
        let contribution = weight * delta;

        weighted_synergy += contribution;

        if adj > 0.52 && best_synergy.as_ref().map_or(true, |(b, _)| contribution > *b) {
            if let Some(a) = repo.get(ally.champion_id) {
                best_synergy = Some((contribution, a.name.clone()));
            }
        }
    }

    for enemy in &draft.enemies {
        let enemy_role = match enemy.role {
            Some(r) => r,
            None => continue,
        };
        let weight = weights::ENEMY_WEIGHTS[role.index()][enemy_role.index()];
        if weight <= 0.0 {
            continue;
        }
        let Some(cell) = stats.matchups.get(&enemy.champion_id) else { continue };
        if cell.games < weights::MIN_MATCHES {
            continue;
        }
        let adj = bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C);
        let delta = adj - 0.5;
        let contribution = weight * delta;

        let is_direct = enemy_role == role;
        if is_direct {
            weighted_matchup += contribution;
            if adj > 0.52 {
                if let Some(o) = repo.get(enemy.champion_id) {
                    reasons.push(format!("Strong lane counter to {}", o.name));
                }
            }
        } else {
            weighted_counter += contribution;
        }
    }

    if let Some(name) = best_synergy.map(|(_, name)| name) {
        reasons.push(format!("High synergy with {name}"));
    }

    // row_total is always > 0 by construction (every matrix row has a positive sum).
    RefinedAdvantage {
        avg_delta: (weighted_matchup + weighted_synergy + weighted_counter) / row_total,
        matchup: weighted_matchup / row_total,
        synergy: weighted_synergy / row_total,
        counter: weighted_counter / row_total,
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

        assert_eq!(
            recs.len(),
            repo.playable_in(Role::Top).count(),
            "should return every playable champion for the role, not just a Top 5"
        );
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
