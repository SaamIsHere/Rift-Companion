//! Deserialization structs for the `/lol-champ-select/v1/session` payload.
//! Only the fields we actually consume are modelled; the rest are ignored.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ChampSelectSession {
    #[serde(rename = "localPlayerCellId")]
    pub local_player_cell_id: i64,
    #[serde(default, rename = "myTeam")]
    pub my_team: Vec<PlayerSlot>,
    #[serde(default, rename = "theirTeam")]
    pub their_team: Vec<PlayerSlot>,
    #[serde(default)]
    pub actions: Vec<Vec<Action>>,
    #[serde(default)]
    pub bans: Bans,
}

#[derive(Debug, Default, Deserialize)]
pub struct Bans {
    #[serde(default, rename = "myTeamBans")]
    pub my_team_bans: Vec<i64>,
    #[serde(default, rename = "theirTeamBans")]
    pub their_team_bans: Vec<i64>,
}

#[derive(Debug, Deserialize, Default)]
pub struct PlayerSlot {
    #[serde(rename = "cellId")]
    pub cell_id: i64,
    #[serde(default, rename = "championId")]
    pub champion_id: i64,
    /// "top" | "jungle" | "middle" | "bottom" | "utility" | "" (often empty for enemies).
    #[serde(default, rename = "assignedPosition")]
    pub assigned_position: String,
    #[serde(default, rename = "championPickIntent")]
    pub champion_pick_intent: i64,
    #[serde(default, rename = "spell1Id")]
    pub spell1_id: i64,
    #[serde(default, rename = "spell2Id")]
    pub spell2_id: i64,
    #[serde(default, rename = "summonerId")]
    pub summoner_id: i64,
    #[serde(default, rename = "summonerName")]
    pub summoner_name: String,
    #[serde(default, rename = "gameName")]
    pub game_name: String,
    #[serde(default, rename = "tagLine")]
    pub tag_line: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct Action {
    #[serde(default)]
    pub id: i64,
    #[serde(default, rename = "actorCellId")]
    pub actor_cell_id: i64,
    #[serde(default, rename = "championId")]
    pub champion_id: i64,
    #[serde(default)]
    pub completed: bool,
    #[serde(default, rename = "isInProgress")]
    pub is_in_progress: bool,
    /// "ban" | "pick"
    #[serde(rename = "type")]
    pub action_type: String,
}

/// Deserialization structs for `/lol-gameflow/v1/session`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowSession {
    #[serde(default)]
    pub phase: String,
    #[serde(default, rename = "gameData")]
    pub game_data: Option<GameflowGameData>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowGameData {
    #[serde(default, rename = "gameId")]
    pub game_id: u64,
    #[serde(default, rename = "teamOne")]
    pub team_one: Vec<GameflowPlayer>,
    #[serde(default, rename = "teamTwo")]
    pub team_two: Vec<GameflowPlayer>,
    #[serde(default, rename = "playerChampionSelections")]
    pub player_champion_selections: Vec<GameflowChampionSelection>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowChampionSelection {
    #[serde(default, rename = "championId")]
    pub champion_id: u32,
    #[serde(default)]
    pub puuid: String,
    #[serde(default, rename = "spell1Id")]
    pub spell1_id: u64,
    #[serde(default, rename = "spell2Id")]
    pub spell2_id: u64,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowPlayer {
    #[serde(default, rename = "cellId")]
    pub cell_id: i64,
    #[serde(default, rename = "championId")]
    pub champion_id: i64,
    #[serde(default, rename = "selectedPosition")]
    pub selected_position: String,
    #[serde(default, rename = "summonerName")]
    pub summoner_name: String,
    #[serde(default, rename = "gameName")]
    pub game_name: String,
    #[serde(default, rename = "tagLine")]
    pub tag_line: String,
    #[serde(default)]
    pub puuid: String,
    #[serde(default, rename = "spell1Id")]
    pub spell1_id: i64,
    #[serde(default, rename = "spell2Id")]
    pub spell2_id: i64,
}

/// Deserialization structs for Live Client Data (`https://127.0.0.1:2999`).
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveClientSpell {
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub raw_description: String,
    #[serde(default)]
    pub raw_display_name: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveClientSpells {
    #[serde(default)]
    pub summoner_spell_one: Option<LiveClientSpell>,
    #[serde(default)]
    pub summoner_spell_two: Option<LiveClientSpell>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveClientPlayer {
    #[serde(default)]
    pub champion_name: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub team: String,
    #[serde(default)]
    pub summoner_name: String,
    #[serde(default)]
    pub riot_id: String,
    #[serde(default)]
    pub riot_id_game_name: String,
    #[serde(default)]
    pub riot_id_tag_line: String,
    #[serde(default)]
    pub summoner_spells: Option<LiveClientSpells>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LiveClientActivePlayer {
    #[serde(default)]
    pub summoner_name: String,
    #[serde(default)]
    pub riot_id: String,
    #[serde(default)]
    pub riot_id_game_name: String,
    #[serde(default)]
    pub riot_id_tag_line: String,
}

