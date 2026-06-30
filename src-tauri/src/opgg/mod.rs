//! OP.GG data adapter (native Rust).
//!
//! Fetches real champion statistics from the OP.GG Gaming Data API (the public
//! `opgg-mcp` endpoint) and maps them into the normalized [`crate::data::models::Champion`]
//! shape. A background task ([`refresh::run_refresher`]) keeps the on-disk dataset
//! current (refreshing on patch change or daily), then hot-reloads the in-memory
//! index. This is the only OP.GG-specific code in the backend.

pub mod client;
pub mod dsl;
pub mod fetch;
pub mod refresh;
