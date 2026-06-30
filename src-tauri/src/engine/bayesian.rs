//! Bayesian (additive) smoothing of win rates toward a global prior.
//!
//! ```text
//! adjusted = (wins + prior * C) / (games + C)
//!          = (winrate * games + prior * C) / (games + C)
//! ```
//!
//! As `games → 0` the result collapses to `prior` (50%); as `games → ∞` it
//! converges to the observed `winrate`. This neutralises small-sample outliers
//! (e.g. a 100% win rate over 2 games is pulled hard toward 50%).
//!
//! NOTE: the denominator is `games + C`, **not** `games * C`. The latter is
//! dimensionally inconsistent (and divides by zero at `games = 0`).

pub fn smooth(winrate: f64, games: u32, prior: f64, c: f64) -> f64 {
    let g = games as f64;
    (winrate * g + prior * c) / (g + c)
}

#[cfg(test)]
mod tests {
    use super::smooth;

    #[test]
    fn tiny_sample_is_pulled_to_prior() {
        // 100% WR over 2 games should sit very close to 0.50.
        let adj = smooth(1.0, 2, 0.50, 100.0);
        assert!(adj < 0.52, "got {adj}");
    }

    #[test]
    fn large_sample_trusts_observation() {
        let adj = smooth(0.55, 10_000, 0.50, 100.0);
        assert!((adj - 0.55).abs() < 0.001, "got {adj}");
    }
}
