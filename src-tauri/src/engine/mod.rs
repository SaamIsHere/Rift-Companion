//! Weighted pick-recommendation engine.

pub mod bayesian;
pub mod comp;
pub mod scoring;
pub mod synergy;
pub mod weights;

// `Components` stays reachable via `engine::scoring::Components` (public module).
pub use scoring::{recommend, Recommendation};
