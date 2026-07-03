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

    /// Row/column index into the 5x5 ally/enemy weight matrices (`weights::ALLY_WEIGHTS`,
    /// `weights::ENEMY_WEIGHTS`). Order: Top, Jungle, Mid, Adc, Support.
    pub fn index(self) -> usize {
        match self {
            Role::Top => 0,
            Role::Jungle => 1,
            Role::Mid => 2,
            Role::Adc => 3,
            Role::Support => 4,
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

/// Rank tier selectable for OP.GG data fetching (Issue #13). Limited to
/// Iron..Diamond+ — Master, Grandmaster, and Challenger are excluded from the
/// UI dropdown, but LCU auto-detection still needs to bucket those players
/// somewhere, hence `from_lcu_tier` folding them into `DiamondPlus`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RankTier {
    Iron,
    Bronze,
    Silver,
    Gold,
    Platinum,
    #[default]
    EmeraldPlus,
    DiamondPlus,
}

impl RankTier {
    /// OP.GG MCP `tier` argument value for `lol_get_champion_analysis`.
    pub fn as_opgg_tier(self) -> &'static str {
        match self {
            RankTier::Iron => "iron",
            RankTier::Bronze => "bronze",
            RankTier::Silver => "silver",
            RankTier::Gold => "gold",
            RankTier::Platinum => "platinum",
            RankTier::EmeraldPlus => "emerald_plus",
            RankTier::DiamondPlus => "diamond_plus",
        }
    }

    /// Maps the LCU's ranked-stats tier string (`IRON`..`CHALLENGER`) onto one
    /// of the 7 selectable buckets. Anything at Diamond or above collapses to
    /// `DiamondPlus`; unranked/unrecognized falls back to the default.
    pub fn from_lcu_tier(s: &str) -> RankTier {
        match s.to_uppercase().as_str() {
            "IRON" => RankTier::Iron,
            "BRONZE" => RankTier::Bronze,
            "SILVER" => RankTier::Silver,
            "GOLD" => RankTier::Gold,
            "PLATINUM" => RankTier::Platinum,
            "EMERALD" => RankTier::EmeraldPlus,
            "DIAMOND" | "MASTER" | "GRANDMASTER" | "CHALLENGER" => RankTier::DiamondPlus,
            _ => RankTier::default(),
        }
    }
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
