//! TFT (Teamfight Tactics) data models and structures.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftBoardCell {
    pub x: u8,
    pub y: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftItemRef {
    pub id: String,
    pub name: String,
    pub image_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftUnit {
    pub id: String,
    pub name: String,
    pub cost: u8,
    pub star: u8,
    #[serde(default)]
    pub items: Vec<TftItemRef>,
    pub cell: TftBoardCell,
    #[serde(default)]
    pub is_carry: bool,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftTrait {
    pub name: String,
    pub count: u8,
    pub tier: String, // e.g. "bronze", "silver", "gold", "prismatic"
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftLevelStage {
    pub stage: String,
    pub level: u8,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftMetaDeck {
    pub id: String,
    pub name: String,
    pub tier: String, // "OP", "S", "A", "B"
    pub avg_placement: f64,
    pub top4_rate: f64,
    pub pick_rate: Option<f64>,
    pub play_style: Option<String>, // "Fast 8", "Slow Roll Lvl 6", "Standard"
    pub difficulty: Option<String>,
    #[serde(default)]
    pub traits: Vec<TftTrait>,
    #[serde(default)]
    pub units: Vec<TftUnit>,
    #[serde(default)]
    pub leveling_guide: Vec<TftLevelStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftItem {
    pub id: String,
    pub name: String,
    pub is_component: bool,
    #[serde(default)]
    pub is_spatula: bool,
    pub recipe: Option<Vec<String>>,
    pub description: String,
    pub stats: Option<String>,
    pub image_url: String,
    #[serde(default)]
    pub recommended_champions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TftAugment {
    pub id: String,
    pub name: String,
    pub tier: String, // "Silver", "Gold", "Prismatic"
    pub tier_num: u8, // 1, 2, 3
    pub description: String,
    pub image_url: String,
}
