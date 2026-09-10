//! Tunable constants for the scoring engine.

use serde::{Deserialize, Serialize};

/// Scoring focus mode selected in UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScoringMode {
    #[default]
    Default,
    #[serde(rename = "teamplayer")]
    Teamplayer,
    #[serde(rename = "counterpick")]
    Counterpick,
}

/// Tunable weights and scoring focus mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weights {
    pub comp: f64,
    #[serde(default)]
    pub mode: ScoringMode,
}

impl Default for Weights {
    fn default() -> Self {
        Weights {
            comp: 0.15,
            mode: ScoringMode::Default,
        }
    }
}

/// Hard minimum sample size for a matchup/synergy cell to be trusted at all.
/// Below this, the cell is excluded from the weighted average entirely
/// (rather than merely down-weighted) so a 2-game 100%/0% record can't
/// swing a pick — it's treated as "no data" and other relationships fill in.
pub const MIN_MATCHES: u32 = 100;

/// Bayesian smoothing strength (pseudo-count of prior games). Larger = more
/// shrinkage toward the 50% prior for small samples. Applied on top of the
/// hard `MIN_MATCHES` gate as a second, softer line of defense for cells
/// that just barely clear the threshold.
pub const SMOOTH_C: f64 = 100.0;

/// Maps net win-rate advantage (~±0.10) onto the 0–100 display score spread.
pub const DISPLAY_SCALE: f64 = 300.0;

/// Role order shared by both matrices below and `Role::index()`.
/// Top, Jungle, Mid, Adc, Support.
///
/// ## Ally weights ($w_{\text{ally}}$)
/// Row = local player's role, column = ally's role. Diagonal is unused (0.0)
/// since an ally never shares the local player's own role slot.
///
/// Row totals intentionally vary by role — see `ENEMY_WEIGHTS` below for why
/// that's safe: both matrices feed a single combined weighted *average*
/// (see `scoring::refined_advantage`), so only the *ratio* between a role's
/// ally-row-total and enemy-row-total matters, not the absolute magnitude.
/// Top/Mid lean heavily on the enemy matchup; Jungle leans a bit that way;
/// ADC/Support are close to balanced since bot lane's own synergy matters
/// almost as much as the matchup itself.
pub const ALLY_WEIGHTS: [[f64; 5]; 5] = [
    // Top:     Top   Jg    Mid   Adc   Sup
    [0.0, 0.4, 0.3, 0.1, 0.1],
    // Jungle:  Top   Jg    Mid   Adc   Sup
    [0.5, 0.0, 0.5, 0.3, 0.3],
    // Mid:     Top   Jg    Mid   Adc   Sup
    [0.2, 0.5, 0.0, 0.1, 0.2],
    // Adc:     Top   Jg    Mid   Adc   Sup
    [0.1, 0.2, 0.1, 0.0, 1.8],
    // Support: Top   Jg    Mid   Adc   Sup
    [0.2, 0.3, 0.2, 1.3, 0.0],
];

/// ## Enemy weights ($w_{\text{enemy}}$)
/// Row = local player's role, column = enemy's (inferred) role. The diagonal
/// is the direct lane opponent and dominates its row, as lane matchups are
/// the most reliable signal we have.
pub const ENEMY_WEIGHTS: [[f64; 5]; 5] = [
    // Top:     Top   Jg    Mid   Adc   Sup
    [1.5, 0.3, 0.2, 0.1, 0.1],
    // Jungle:  Top   Jg    Mid   Adc   Sup
    [0.4, 1.0, 0.4, 0.2, 0.2],
    // Mid:     Top   Jg    Mid   Adc   Sup
    [0.2, 0.4, 1.4, 0.1, 0.1],
    // Adc:     Top   Jg    Mid   Adc   Sup
    [0.1, 0.3, 0.1, 1.0, 1.0],
    // Support: Top   Jg    Mid   Adc   Sup
    [0.1, 0.3, 0.1, 0.9, 0.9],
];
