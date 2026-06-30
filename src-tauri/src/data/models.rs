//! Domain model for champion statistics.
//!
//! Separation of concerns:
//!   * static facts (name, image key, damage type, frontline) live on `Champion`,
//!   * dynamic patch stats (win rates, matchups, synergies) live in `RoleStats`,
//!     keyed per role so a flex pick can be evaluated in each position.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Top,
    Jungle,
    Mid,
    Adc,
    Support,
}

impl Role {
    /// Maps the LCU `assignedPosition` string to a `Role`.
    pub fn from_lcu(s: &str) -> Option<Role> {
        match s.to_lowercase().as_str() {
            "top" => Some(Role::Top),
            "jungle" => Some(Role::Jungle),
            "middle" | "mid" => Some(Role::Mid),
            "bottom" | "adc" => Some(Role::Adc),
            "utility" | "support" => Some(Role::Support),
            _ => None,
        }
    }

    /// Stable string key used to index the per-role stats map.
    pub fn as_key(self) -> &'static str {
        match self {
            Role::Top => "top",
            Role::Jungle => "jungle",
            Role::Mid => "mid",
            Role::Adc => "adc",
            Role::Support => "support",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DamageType {
    Physical,
    Magic,
    Mixed,
}

/// A single win-rate observation with its supporting sample size.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct WinRateCell {
    pub winrate: f64,
    pub games: u32,
}

/// Per-role dynamic stats. `matchups`/`synergies` are keyed by champion id.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleStats {
    pub global_winrate: f64,
    pub games: u32,
    #[serde(default)]
    pub matchups: HashMap<u32, WinRateCell>, // vs opponent in same role
    #[serde(default)]
    pub synergies: HashMap<u32, WinRateCell>, // with an ally
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Champion {
    pub champion_id: u32,
    pub name: String,
    /// Data Dragon image key, e.g. "Garen", "MonkeyKing".
    pub image: String,
    pub damage: DamageType,
    pub frontline: bool,
    /// Roles this champion is commonly played in (first = primary).
    pub roles: Vec<Role>,
    /// Per-role dynamic stats, keyed by `Role::as_key()` ("top", "jungle", …).
    /// String keys (not enum keys) keep `serde_json` deserialization unambiguous.
    #[serde(default)]
    pub stats: HashMap<String, RoleStats>,
}

impl Champion {
    /// Typed accessor for the per-role stats map.
    pub fn role_stats(&self, role: Role) -> Option<&RoleStats> {
        self.stats.get(role.as_key())
    }
}
