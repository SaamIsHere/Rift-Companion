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
//! wr_refined = clamp(wr_base(c) + weighted_avg(ally deltas, enemy deltas), 0.02, 0.98)
//! refinement = (wr_refined - wr_base) + w_comp * compBonus(c)
//! score      = clamp(wr_base * 100 + refinement * DISPLAY_SCALE, 0, 100)
//! ```
//!
//! Note `wr_base` maps straight through to the score as a percentage — only
//! the *refinement* on top of it gets the `DISPLAY_SCALE` amplification, so
//! a first pick with nothing else revealed displays as exactly its real win
//! rate rather than an amplified distance from 50%.
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
    pub badges: Vec<Badge>,
}

/// A single "why" tag shown on a recommendation card, colored by category so
/// the user can tell at a glance whether it's helping or hurting the pick
/// (Issue #7 — Refined Champion Badges).
#[derive(Debug, Clone, Serialize)]
pub struct Badge {
    pub text: String,
    pub kind: BadgeKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BadgeKind {
    /// Good matchup / high synergy — green in the UI.
    Positive,
    /// Bad matchup / poor synergy — red in the UI.
    Negative,
    /// Fills a team-composition gap — blue in the UI.
    Comp,
    /// No strong signal either way (fallback copy) — neutral grey.
    Neutral,
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

    // Base win rate for the role, Bayesian-smoothed over every game the
    // champion has played there (not just its strongest single matchup).
    let wr_base = role_stats
        .map(|s| bayesian::smooth(s.global_winrate, s.games, prior, weights::SMOOTH_C))
        .unwrap_or(prior);

    let refined = refined_advantage(repo, draft, role, role_stats, prior);

    let wr_refined = (wr_base + refined.avg_delta).clamp(0.02, 0.98);

    // --- Team-comp balance (structural bonus, not a win-rate delta) ---
    let (comp_bonus, comp_reasons) = comp::bonus(c, needs);

    // The base win rate maps to the score 1:1 — with nothing else revealed
    // (a true first pick), the score should read as exactly the champion's
    // real win rate, not an amplified version of it. Only the *refinement*
    // on top of that base (ally/enemy deltas + the comp bonus) gets the
    // DISPLAY_SCALE treatment, since those deltas are naturally small
    // (a few percentage points) and need amplifying to read clearly.
    let refinement = (wr_refined - wr_base) + w.comp * comp_bonus;
    let score = (wr_base * 100.0 + refinement * weights::DISPLAY_SCALE).clamp(0.0, 100.0);

    // Balanced view (Issue #7): show the matchup badge and the synergy badge
    // independently, whichever direction (positive or negative) each one
    // actually leans — so a champion with great synergy but a rough lane
    // matchup surfaces *both* a green and a red badge, instead of only the
    // flattering half of the picture. Comp-gap badges (blue) are always
    // positive by construction (there's no "made the gap worse" case).
    let mut badges: Vec<Badge> = Vec::new();
    badges.extend(refined.matchup_badge);
    badges.extend(refined.synergy_badge);
    badges.extend(
        comp_reasons
            .into_iter()
            .map(|text| Badge { text: text.to_string(), kind: BadgeKind::Comp }),
    );

    if badges.is_empty() {
        badges.push(Badge {
            text: "Solid blind pick for your role".to_string(),
            kind: BadgeKind::Neutral,
        });
    }
    badges.truncate(3); // keep the UI badges concise

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
        badges,
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
    /// "Strong lane counter to X" (green) / "Rough matchup vs X" (red), if
    /// the direct lane opponent's matchup cleared the threshold either way.
    matchup_badge: Option<Badge>,
    /// "High synergy with X" (green) / "Weak synergy with X" (red), whichever
    /// ally relationship had the strongest signal, in either direction.
    synergy_badge: Option<Badge>,
}

/// Bayesian-smoothed win rate a champion's `stats` show against/with `id`,
/// gated by `MIN_MATCHES` so a tiny sample can't masquerade as a signal.
fn trusted_cell(cell: Option<&crate::data::models::WinRateCell>, prior: f64) -> Option<f64> {
    let cell = cell?;
    if cell.games < weights::MIN_MATCHES {
        return None;
    }
    Some(bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C))
}

/// Blends every locked ally and revealed enemy into a single weighted
/// average win-rate delta, using the local player's role to pick the right
/// row of `ALLY_WEIGHTS` / `ENEMY_WEIGHTS`. Also surfaces "why" badges for
/// the strongest qualifying synergy/matchup found along the way, in
/// whichever direction (positive or negative) it actually leans.
fn refined_advantage(
    repo: &Repository,
    draft: &DraftState,
    role: Role,
    role_stats: Option<&crate::data::models::RoleStats>,
    prior: f64,
) -> RefinedAdvantage {
    let stats = match role_stats {
        Some(s) => s,
        None => {
            return RefinedAdvantage {
                avg_delta: 0.0,
                matchup: 0.0,
                synergy: 0.0,
                counter: 0.0,
                matchup_badge: None,
                synergy_badge: None,
            };
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
    // Strongest ally signal in each direction, tracked by |contribution| so
    // the badge shown is whichever relationship actually moved the score
    // the most — not just the first one that cleared the threshold.
    let mut best_synergy: Option<(f64, String)> = None; // adj > 0.52, biggest positive contribution
    let mut worst_synergy: Option<(f64, String)> = None; // adj < 0.48, biggest negative contribution
    let mut matchup_badge: Option<Badge> = None;

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
        let Some(adj) = trusted_cell(stats.synergies.get(&ally.champion_id), prior) else { continue };
        let delta = adj - 0.5;
        let contribution = weight * delta;

        weighted_synergy += contribution;

        if adj > 0.52 && best_synergy.as_ref().map_or(true, |(b, _)| contribution > *b) {
            if let Some(a) = repo.get(ally.champion_id) {
                best_synergy = Some((contribution, a.name.clone()));
            }
        } else if adj < 0.48 && worst_synergy.as_ref().map_or(true, |(w, _)| contribution < *w) {
            if let Some(a) = repo.get(ally.champion_id) {
                worst_synergy = Some((contribution, a.name.clone()));
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
        let Some(adj) = trusted_cell(stats.matchups.get(&enemy.champion_id), prior) else { continue };
        let delta = adj - 0.5;
        let contribution = weight * delta;

        let is_direct = enemy_role == role;
        if is_direct {
            weighted_matchup += contribution;
            if let Some(o) = repo.get(enemy.champion_id) {
                if adj > 0.52 {
                    matchup_badge = Some(Badge {
                        text: format!("Strong lane counter to {}", o.name),
                        kind: BadgeKind::Positive,
                    });
                } else if adj < 0.48 {
                    matchup_badge = Some(Badge {
                        text: format!("Rough matchup vs {}", o.name),
                        kind: BadgeKind::Negative,
                    });
                }
            }
        } else {
            weighted_counter += contribution;
        }
    }

    // Balanced view (Issue #7): pick whichever ally signal is strongest in
    // *either* direction, so a genuinely bad synergy pick isn't silently
    // dropped just because a positive candidate happened to be checked last.
    let synergy_badge = match (best_synergy, worst_synergy) {
        (Some((bc, bn)), Some((wc, wn))) => {
            if bc.abs() >= wc.abs() {
                Some(Badge { text: format!("High synergy with {bn}"), kind: BadgeKind::Positive })
            } else {
                Some(Badge { text: format!("Weak synergy with {wn}"), kind: BadgeKind::Negative })
            }
        }
        (Some((_, bn)), None) => {
            Some(Badge { text: format!("High synergy with {bn}"), kind: BadgeKind::Positive })
        }
        (None, Some((_, wn))) => {
            Some(Badge { text: format!("Weak synergy with {wn}"), kind: BadgeKind::Negative })
        }
        (None, None) => None,
    };

    // row_total is always > 0 by construction (every matrix row has a positive sum).
    RefinedAdvantage {
        avg_delta: (weighted_matchup + weighted_synergy + weighted_counter) / row_total,
        matchup: weighted_matchup / row_total,
        synergy: weighted_synergy / row_total,
        counter: weighted_counter / row_total,
        matchup_badge,
        synergy_badge,
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

        let expected = repo
            .playable_in(Role::Top)
            .filter(|c| !draft.bans.contains(&c.champion_id))
            .filter(|c| !draft.allies.iter().any(|a| a.champion_id == c.champion_id))
            .filter(|c| !draft.enemies.iter().any(|e| e.champion_id == c.champion_id))
            .count();
        assert_eq!(
            recs.len(),
            expected,
            "should return every playable champion for the role minus drafted/banned picks, not just a Top 5"
        );
        // Malphite (54): counters Darius + fills the AP & frontline gaps → #1.
        assert_eq!(recs[0].champion_id, 54, "Malphite should rank first");
        assert!(!recs[0].badges.is_empty(), "top pick should have a why-badge");
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
