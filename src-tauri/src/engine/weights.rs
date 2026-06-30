//! Tunable constants for the scoring engine.

use serde::{Deserialize, Serialize};

/// Relative importance of each scoring component. Sums to 1.0 by convention.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weights {
    pub matchup: f64,
    pub synergy: f64,
    pub counter: f64,
    pub comp: f64,
}

impl Default for Weights {
    fn default() -> Self {
        // Lane matchup is the highest priority, per the product spec.
        Weights {
            matchup: 0.40,
            synergy: 0.25,
            counter: 0.20,
            comp: 0.15,
        }
    }
}

/// Hard minimum sample size for a matchup/synergy cell to drive a "why" badge.
pub const MIN_MATCHES: u32 = 100;

/// Bayesian smoothing strength (pseudo-count of prior games). Larger = more
/// shrinkage toward the 50% prior for small samples.
pub const SMOOTH_C: f64 = 100.0;

/// Maps net win-rate advantage (~±0.10) onto the 0–100 display score spread.
pub const DISPLAY_SCALE: f64 = 300.0;

/// Small weight given to a champion's overall role strength as a tie-breaker.
pub const BASELINE_WEIGHT: f64 = 0.15;
