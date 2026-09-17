//! Weighted pick-recommendation engine.

pub mod bayesian;
pub mod comp;
pub mod scoring;
pub mod weights;

// `Components` stays reachable via `engine::scoring::Components` (public module).
pub use scoring::{recommend, score_one, BadgeKind, Recommendation};
