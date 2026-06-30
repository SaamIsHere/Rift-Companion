//! Loads and indexes champion statistics.
//!
//! For the prototype the dataset is embedded at compile time. Swapping to a
//! SQLite-backed repository later only requires changing the constructor — the
//! query surface (`get`, `playable_in`, `primary_role`) stays the same.

use std::collections::HashMap;

use anyhow::Result;

use crate::data::models::{Champion, Role};

pub struct Repository {
    champions: HashMap<u32, Champion>,
    global_avg_winrate: f64,
}

impl Repository {
    /// Load the dataset embedded in the binary (patch-specific JSON).
    pub fn load_embedded() -> Result<Repository> {
        const RAW: &str = include_str!("../../data/stats.patch-14.12.json");
        Self::from_json(RAW)
    }

    pub fn from_json(raw: &str) -> Result<Repository> {
        let champions: Vec<Champion> = serde_json::from_str(raw)?;
        let champions = champions
            .into_iter()
            .map(|c| (c.champion_id, c))
            .collect::<HashMap<_, _>>();
        Ok(Repository {
            champions,
            // The Bayesian prior baseline. ~50% by construction of win rate.
            global_avg_winrate: 0.50,
        })
    }

    pub fn get(&self, id: u32) -> Option<&Champion> {
        self.champions.get(&id)
    }

    pub fn global_avg(&self) -> f64 {
        self.global_avg_winrate
    }

    /// Primary (most-played) role for a champion — used to infer hidden enemy roles.
    pub fn primary_role(&self, id: u32) -> Option<Role> {
        self.champions.get(&id).and_then(|c| c.roles.first().copied())
    }

    /// All champions eligible to be played in `role`.
    pub fn playable_in(&self, role: Role) -> impl Iterator<Item = &Champion> {
        self.champions
            .values()
            .filter(move |c| c.roles.contains(&role))
    }
}
