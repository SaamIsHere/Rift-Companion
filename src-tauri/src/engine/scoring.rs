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
    #[serde(default)]
    pub good_matchups: Vec<String>,
    #[serde(default)]
    pub bad_matchups: Vec<String>,
    #[serde(default)]
    pub synergies: Vec<String>,
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
        // Exclude banned and already-taken champions (exclude teammate picks/hovers and local locked picks, but keep local hovers).
        .filter(|c| !draft.bans.contains(&c.champion_id))
        .filter(|c| !draft.allies.iter().any(|a| (!a.is_local || !a.is_hover) && a.champion_id == c.champion_id))
        .filter(|c| !draft.enemies.iter().any(|e| e.champion_id == c.champion_id))
        .map(|c| score_one(repo, draft, w, role, c, &needs))
        .collect();

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out
}

pub fn score_one(
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

    let refined = refined_advantage(repo, draft, role, role_stats, prior, w.mode);

    let wr_refined = (wr_base + refined.avg_delta).clamp(0.02, 0.98);

    // --- Team-comp balance (structural bonus, not a win-rate delta) ---
    let (comp_bonus, comp_reasons) = comp::bonus(c, needs);

    // The base win rate maps to the score 1:1 — with nothing else revealed
    // (a true first pick), the score should read as exactly the champion's
    // real win rate, not an amplified version of it. Only the *refinement*
    // on top of that base (ally/enemy deltas + the comp bonus) gets the
    // DISPLAY_SCALE treatment, since those deltas are naturally small
    // In Counterpick mode, when a direct lane opponent is present, the displayed score
    // is strictly the exact pairwise winrate against that direct lane opponent.
    let score = if w.mode == weights::ScoringMode::Counterpick {
        let direct_opponent = draft.enemies.iter().find(|e| e.role == Some(role));
        if let Some(opp) = direct_opponent {
            if let Some(cell) = role_stats.and_then(|s| s.matchups.get(&opp.champion_id)) {
                if cell.games >= weights::MIN_MATCHES {
                    (cell.winrate * 100.0).clamp(0.0, 100.0)
                } else if cell.games > 0 {
                    (bayesian::smooth(cell.winrate, cell.games, prior, weights::SMOOTH_C) * 100.0)
                        .clamp(0.0, 100.0)
                } else {
                    (wr_base * 100.0).clamp(0.0, 100.0)
                }
            } else {
                (wr_base * 100.0).clamp(0.0, 100.0)
            }
        } else {
            // No direct lane opponent revealed yet: unscaled enemy delta or base winrate
            let enemy_deltas: Vec<f64> = draft
                .enemies
                .iter()
                .filter_map(|e| {
                    let cell = role_stats?.matchups.get(&e.champion_id)?;
                    let adj = trusted_cell(Some(cell), prior)?;
                    Some(adj - 0.5)
                })
                .collect();
            if !enemy_deltas.is_empty() {
                let avg_d = enemy_deltas.iter().sum::<f64>() / enemy_deltas.len() as f64;
                ((wr_base + avg_d) * 100.0).clamp(0.0, 100.0)
            } else {
                (wr_base * 100.0).clamp(0.0, 100.0)
            }
        }
    } else {
        let refinement = (wr_refined - wr_base) + w.comp * comp_bonus;
        (wr_base * 100.0 + refinement * weights::DISPLAY_SCALE).clamp(0.0, 100.0)
    };

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
        good_matchups: refined.good_matchups,
        bad_matchups: refined.bad_matchups,
        synergies: refined.synergies,
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
    good_matchups: Vec<String>,
    bad_matchups: Vec<String>,
    synergies: Vec<String>,
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
    mode: weights::ScoringMode,
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
                good_matchups: Vec::new(),
                bad_matchups: Vec::new(),
                synergies: Vec::new(),
            };
        }
    };

    let (synergy_mult, matchup_mult, counter_mult) = match mode {
        weights::ScoringMode::Default => (1.0, 1.0, 1.0),
        weights::ScoringMode::Teamplayer => (3.0, 0.4, 0.4),
        weights::ScoringMode::Counterpick => (0.0, 1.0, 0.0),
    };

    let direct_enemy_weight = weights::ENEMY_WEIGHTS[role.index()][role.index()];
    let other_enemy_weight = weights::ENEMY_WEIGHTS[role.index()].iter().sum::<f64>() - direct_enemy_weight;
    let ally_weight = weights::ALLY_WEIGHTS[role.index()].iter().sum::<f64>();

    let row_total: f64 = (ally_weight * synergy_mult
        + direct_enemy_weight * matchup_mult
        + other_enemy_weight * counter_mult)
        .max(0.001);

    let mut weighted_matchup = 0.0; // direct lane opponent only
    let mut weighted_synergy = 0.0; // allies
    let mut weighted_counter = 0.0; // enemies other than the direct opponent

    let mut best_synergy: Option<(f64, String)> = None;
    let mut worst_synergy: Option<(f64, String)> = None;
    let mut matchup_badge: Option<Badge> = None;

    let mut enemy_good: Vec<(f64, String)> = Vec::new();
    let mut enemy_bad: Vec<(f64, String)> = Vec::new();
    let mut ally_synergies: Vec<(f64, String)> = Vec::new();

    for ally in &draft.allies {
        if ally.is_local {
            continue;
        }
        let ally_role = match ally.role {
            Some(r) => r,
            None => continue, // empty role slot → delta is 0.0 (skip entirely)
        };
        let base_weight = weights::ALLY_WEIGHTS[role.index()][ally_role.index()];
        let weight = base_weight * synergy_mult;
        if weight <= 0.0 {
            continue;
        }
        let Some(adj) = trusted_cell(stats.synergies.get(&ally.champion_id), prior) else { continue };
        let delta = adj - 0.5;
        let contribution = weight * delta;

        weighted_synergy += contribution;

        if let Some(a) = repo.get(ally.champion_id) {
            if adj > 0.505 {
                ally_synergies.push((adj, a.name.clone()));
            }
            if adj > 0.52 && best_synergy.as_ref().map_or(true, |(b, _)| contribution > *b) {
                best_synergy = Some((contribution, a.name.clone()));
            } else if adj < 0.48 && worst_synergy.as_ref().map_or(true, |(w, _)| contribution < *w) {
                worst_synergy = Some((contribution, a.name.clone()));
            }
        }
    }

    for enemy in &draft.enemies {
        let enemy_role = match enemy.role {
            Some(r) => r,
            None => continue,
        };
        let is_direct = enemy_role == role;
        let base_weight = weights::ENEMY_WEIGHTS[role.index()][enemy_role.index()];
        let weight = if is_direct {
            base_weight * matchup_mult
        } else {
            base_weight * counter_mult
        };
        if weight <= 0.0 {
            continue;
        }
        let Some(adj) = trusted_cell(stats.matchups.get(&enemy.champion_id), prior) else { continue };
        let delta = adj - 0.5;
        let contribution = weight * delta;

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

        if let Some(o) = repo.get(enemy.champion_id) {
            if adj > 0.505 {
                enemy_good.push((adj, o.name.clone()));
            } else if adj < 0.495 {
                enemy_bad.push((adj, o.name.clone()));
            }
        }
    }

    enemy_good.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let good_matchups: Vec<String> = enemy_good.into_iter().map(|(_, name)| name).take(3).collect();

    enemy_bad.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let bad_matchups: Vec<String> = enemy_bad.into_iter().map(|(_, name)| name).take(3).collect();

    ally_synergies.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let synergies: Vec<String> = ally_synergies.into_iter().map(|(_, name)| name).take(3).collect();

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

    RefinedAdvantage {
        avg_delta: (weighted_matchup + weighted_synergy + weighted_counter) / row_total,
        matchup: weighted_matchup / row_total,
        synergy: weighted_synergy / row_total,
        counter: weighted_counter / row_total,
        matchup_badge,
        synergy_badge,
        good_matchups,
        bad_matchups,
        synergies,
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
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            // Ally jungler with no AP and no frontline → team needs both.
            allies: vec![DraftPick {
                champion_id: 64,
                role: Some(Role::Jungle),
                is_local: false,
                is_hover: false,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
            }],
            // Enemy top laner = Darius.
            enemies: vec![DraftPick {
                champion_id: 122,
                role: Some(Role::Top),
                is_local: false,
                is_hover: false,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
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
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![],
            enemies: vec![DraftPick {
                champion_id: 122,
                role: Some(Role::Top),
                is_local: false,
                is_hover: false,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
            }],
        };
        let recs = recommend(&repo, &draft, &Weights::default());
        let teemo = recs.iter().position(|r| r.champion_id == 17);
        let malphite = recs.iter().position(|r| r.champion_id == 54);
        if let (Some(t), Some(m)) = (teemo, malphite) {
            assert!(m < t, "Malphite must outrank the low-sample Teemo pick");
        }
    }

    #[test]
    fn zero_pick_baseline_recommendations() {
        // Test Requirement 1 & 2: When entering champ select before any pick or hover,
        // recommendations are immediately computed based on raw Bayesian-smoothed win rates.
        let repo = Repository::load_embedded().unwrap();
        let draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![],
            enemies: vec![],
        };

        let recs = recommend(&repo, &draft, &Weights::default());
        let expected_count = repo.playable_in(Role::Top).count();
        assert_eq!(recs.len(), expected_count, "all playable champions should be present");
        assert!(!recs.is_empty(), "recommendations must not be empty at zero picks");

        // Every pick should have the neutral blind-pick fallback badge
        assert_eq!(recs[0].badges.len(), 1);
        assert_eq!(recs[0].badges[0].kind, BadgeKind::Neutral);
        assert_eq!(recs[0].badges[0].text, "Solid blind pick for your role");

        // Scores must be sorted descending
        for w in recs.windows(2) {
            assert!(w[0].score >= w[1].score, "baseline scores must be descending");
        }
    }

    #[test]
    fn teammate_hover_tracking_and_synergy() {
        // Test Requirement 3: Teammate hover influences comp balance and synergy
        let repo = Repository::load_embedded().unwrap();

        // Zero pick state
        let zero_draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![],
            enemies: vec![],
        };
        let zero_recs = recommend(&repo, &zero_draft, &Weights::default());

        // Teammate jungler hovers an AD non-frontline champion (Lee Sin = 64)
        let hover_draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![DraftPick {
                champion_id: 64,
                role: Some(Role::Jungle),
                is_local: false,
                is_hover: true,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
            }],
            enemies: vec![],
        };
        let hover_recs = recommend(&repo, &hover_draft, &Weights::default());

        // Teammate hover must be excluded from local player's recommendations
        assert!(
            hover_recs.iter().all(|r| r.champion_id != 64),
            "teammate hovered champion should not be recommended to local player"
        );

        // Comp needs must now detect missing AP & frontline because ally hovered AD non-tank
        let malphite_zero = zero_recs.iter().find(|r| r.champion_id == 54).unwrap();
        let malphite_hover = hover_recs.iter().find(|r| r.champion_id == 54).unwrap();
        // Malphite provides missing magic damage and frontline -> score should increase
        assert!(
            malphite_hover.score > malphite_zero.score,
            "Malphite score should rise to fill comp gap created by ally hover"
        );
    }

    #[test]
    fn local_player_hover_not_filtered_out() {
        let repo = Repository::load_embedded().unwrap();
        // Local player is hovering Malphite (54)
        let draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            hovered_champion_id: Some(54),
            is_locked: false,
            bans: vec![],
            allies: vec![DraftPick {
                champion_id: 54,
                role: Some(Role::Top),
                is_local: true,
                is_hover: true,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
            }],
            enemies: vec![],
        };
        let recs = recommend(&repo, &draft, &Weights::default());
        assert!(
            recs.iter().any(|r| r.champion_id == 54),
            "local player's own hovered champion must remain in recommendations"
        );
    }
}
