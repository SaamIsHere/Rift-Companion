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
    #[serde(alias = "iron")]
    IronPlus,
    #[serde(alias = "bronze")]
    BronzePlus,
    #[serde(alias = "silver")]
    SilverPlus,
    #[serde(alias = "gold")]
    GoldPlus,
    #[serde(alias = "platinum")]
    PlatinumPlus,
    #[default]
    EmeraldPlus,
    DiamondPlus,
}

impl RankTier {
    /// OP.GG MCP `tier` argument value for `lol_get_champion_analysis`.
    pub fn as_mcp_tier(self) -> &'static str {
        match self {
            RankTier::IronPlus => "all",
            RankTier::BronzePlus => "bronze",
            RankTier::SilverPlus => "silver",
            RankTier::GoldPlus => "gold_plus",
            RankTier::PlatinumPlus => "platinum_plus",
            RankTier::EmeraldPlus => "emerald_plus",
            RankTier::DiamondPlus => "diamond_plus",
        }
    }

    /// Server API and OP.GG tier identifier.
    pub fn as_opgg_tier(self) -> &'static str {
        match self {
            RankTier::IronPlus => "iron_plus",
            RankTier::BronzePlus => "bronze_plus",
            RankTier::SilverPlus => "silver_plus",
            RankTier::GoldPlus => "gold_plus",
            RankTier::PlatinumPlus => "platinum_plus",
            RankTier::EmeraldPlus => "emerald_plus",
            RankTier::DiamondPlus => "diamond_plus",
        }
    }

    /// Maps the LCU's ranked-stats tier string (`IRON`..`CHALLENGER`) onto one
    /// of the 7 selectable buckets. Anything at Diamond or above collapses to
    /// `DiamondPlus`; unranked/unrecognized falls back to the default.
    pub fn from_lcu_tier(s: &str) -> RankTier {
        match s.to_uppercase().as_str() {
            "IRON" => RankTier::IronPlus,
            "BRONZE" => RankTier::BronzePlus,
            "SILVER" => RankTier::SilverPlus,
            "GOLD" => RankTier::GoldPlus,
            "PLATINUM" => RankTier::PlatinumPlus,
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

/// Detailed build recommendations for a champion in a specific position (op.gg format).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChampionBuildStats {
    #[serde(default)]
    pub runes: Vec<RunePageStats>,
    #[serde(default)]
    pub summoner_spells: Vec<SummonerSpellStats>,
    #[serde(default)]
    pub skill_order: Option<SkillOrderStats>,
    #[serde(default)]
    pub starter_items: Vec<StarterItemStats>,
    #[serde(default)]
    pub boots: Vec<BootsStats>,
    #[serde(default)]
    pub core_items: Vec<CoreItemStats>,
    #[serde(default)]
    pub fourth_items: Vec<DepthItemStats>,
    #[serde(default)]
    pub fifth_items: Vec<DepthItemStats>,
    #[serde(default)]
    pub sixth_items: Vec<DepthItemStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PerkStyleRef {
    pub id: Option<u32>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuneItemRef {
    pub id: Option<u32>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunePageStats {
    pub id: Option<u32>,
    pub play: Option<u32>,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub primary_style: Option<PerkStyleRef>,
    pub secondary_style: Option<PerkStyleRef>,
    #[serde(default)]
    pub primary_runes: Vec<RuneItemRef>,
    #[serde(default)]
    pub secondary_runes: Vec<RuneItemRef>,
    #[serde(default)]
    pub shards: Vec<RuneItemRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummonerSpellStats {
    pub ids: Vec<u32>,
    pub names: Vec<String>,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub play: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillOrderStats {
    #[serde(default)]
    pub priority: Vec<String>,
    #[serde(default)]
    pub order: Option<Vec<String>>,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub play: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StarterItemStats {
    pub ids: Vec<u32>,
    pub names: Vec<String>,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub play: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootsStats {
    pub id: u32,
    pub name: String,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub play: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreItemStats {
    pub ids: Vec<u32>,
    pub names: Vec<String>,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub play: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthItemStats {
    pub id: u32,
    pub name: String,
    pub pick_rate: Option<f64>,
    pub win_rate: Option<f64>,
    pub play: Option<u32>,
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
    #[serde(default)]
    pub build: Option<ChampionBuildStats>,
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

/// A single matchup or synergy opponent/ally entry with calculated win rate and games.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChampionMatchupEntry {
    pub champion_id: u32,
    pub name: String,
    pub image: String,
    pub winrate: f64,
    pub games: u32,
}

/// Complete overview package for a champion in a specific role (powers Champion Overview screen).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChampionOverviewData {
    pub champion_id: u32,
    pub name: String,
    pub image: String,
    pub damage: DamageType,
    pub frontline: bool,
    pub roles: Vec<Role>,
    pub selected_role: Role,
    pub winrate: f64,
    pub games: u32,
    pub build: Option<ChampionBuildStats>,
    pub best_matchups: Vec<ChampionMatchupEntry>,
    pub worst_matchups: Vec<ChampionMatchupEntry>,
    pub all_matchups: Vec<ChampionMatchupEntry>,
    pub best_synergies: Vec<ChampionMatchupEntry>,
    pub all_synergies: Vec<ChampionMatchupEntry>,
}

/// Champion card summary item when browsing champions by role.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleChampionItem {
    pub champion_id: u32,
    pub name: String,
    pub image: String,
    pub damage: DamageType,
    pub frontline: bool,
    pub roles: Vec<Role>,
    pub role: Role,
    pub tier: String,
    pub winrate: f64,
    pub pick_rate: f64,
    pub ban_rate: f64,
    pub games: u32,
    pub weak_against: Vec<ChampionMatchupEntry>,
    pub has_build: bool,
}


