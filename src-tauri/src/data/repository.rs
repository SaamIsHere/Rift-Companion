//! Loads and indexes champion statistics.
//!
//! The dataset is a normalized `Champion[]` JSON file loaded at runtime
//! (`data::store` / `data::ingest`), seeded on first run from the embedded demo
//! data. As the README predicted, swapping the source only touches the
//! constructor — the query surface (`get`, `playable_in`, `primary_role`,
//! `global_avg`) is unchanged, so the engine never changes.

use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};

use crate::data::models::{Champion, Role};

/// The embedded demo dataset — seeds a fresh install and is the offline fallback.
pub const EMBEDDED_JSON: &str = include_str!("../../data/stats.patch-14.12.json");

pub struct Repository {
    champions: HashMap<u32, Champion>,
    global_avg_winrate: f64,
}

impl Repository {
    /// Parse the embedded demo dataset directly (fallback / tests).
    pub fn load_embedded() -> Result<Repository> {
        Self::from_json(EMBEDDED_JSON)
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

    /// Build directly from an in-memory champion list (used by the background refresher).
    pub fn from_champions(champions: Vec<Champion>) -> Repository {
        Repository {
            champions: champions.into_iter().map(|c| (c.champion_id, c)).collect(),
            global_avg_winrate: 0.50,
        }
    }

    /// Load the active dataset at `path`, seeding it from the embedded demo data
    /// if the file does not exist yet (so the app works out of the box).
    pub fn open_or_seed(path: &str) -> Result<Repository> {
        if !Path::new(path).exists() {
            if let Some(parent) = Path::new(path).parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::write(path, EMBEDDED_JSON)
                .with_context(|| format!("seeding dataset at {path}"))?;
        }
        let raw =
            std::fs::read_to_string(path).with_context(|| format!("reading dataset at {path}"))?;
        Self::from_json(&raw)
    }

    pub fn get(&self, id: u32) -> Option<&Champion> {
        self.champions.get(&id)
    }

    /// Number of champions currently indexed (used for startup logging).
    pub fn len(&self) -> usize {
        self.champions.len()
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

    /// All champions indexed in the repository.
    pub fn all_champions(&self) -> impl Iterator<Item = &Champion> {
        self.champions.values()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(tag: &str) -> String {
        let dir = std::env::temp_dir().join(format!("rift-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("stats.json").to_string_lossy().into_owned()
    }

    #[test]
    fn seed_then_load_roundtrips() {
        let path = temp_path("seed");
        let repo = Repository::open_or_seed(&path).unwrap();
        assert!(Path::new(&path).exists(), "dataset file is created on first run");
        let malphite = repo.get(54).expect("Malphite present");
        assert!(
            malphite.role_stats(Role::Top).unwrap().matchups.contains_key(&122),
            "Malphite-vs-Darius matchup survives the seed→file→load round-trip"
        );
        // A second open reads the existing file rather than re-seeding.
        let repo2 = Repository::open_or_seed(&path).unwrap();
        assert_eq!(
            repo2.playable_in(Role::Top).count(),
            repo.playable_in(Role::Top).count()
        );
    }

    #[test]
    fn engine_ranks_via_seeded_file() {
        use crate::draft::{DraftPick, DraftState};
        use crate::engine::{recommend, weights::Weights};

        let path = temp_path("engine");
        let repo = Repository::open_or_seed(&path).unwrap();
        let draft = DraftState {
            local_role: Some(Role::Top),
            local_champion_id: None,
            bans: vec![],
            allies: vec![DraftPick { champion_id: 64, role: Some(Role::Jungle), is_local: false, spell1_id: None, spell2_id: None }],
            enemies: vec![DraftPick { champion_id: 122, role: Some(Role::Top), is_local: false, spell1_id: None, spell2_id: None }],
        };
        let recs = recommend(&repo, &draft, &Weights::default());
        let expected = repo
            .playable_in(Role::Top)
            .filter(|c| !draft.bans.contains(&c.champion_id))
            .filter(|c| !draft.allies.iter().any(|a| a.champion_id == c.champion_id))
            .filter(|c| !draft.enemies.iter().any(|e| e.champion_id == c.champion_id))
            .count();
        assert_eq!(recs.len(), expected, "should return every playable champion minus drafted/banned picks");
        // Same result as the embedded-path test → the file-backed store is transparent.
        assert_eq!(recs[0].champion_id, 54, "Malphite still ranks #1");
    }

    #[test]
    fn ingest_validation_rejects_malformed_json() {
        assert!(crate::data::ingest::validate("not json at all").is_err());
        assert!(crate::data::ingest::validate("[]").is_ok(), "empty roster is structurally valid");
    }
}
