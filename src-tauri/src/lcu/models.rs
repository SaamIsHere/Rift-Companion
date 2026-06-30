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

#[derive(Debug, Deserialize)]
pub struct PlayerSlot {
    #[serde(rename = "cellId")]
    pub cell_id: i64,
    #[serde(default, rename = "championId")]
    pub champion_id: i64,
    /// "top" | "jungle" | "middle" | "bottom" | "utility" | "" (often empty for enemies).
    #[serde(default, rename = "assignedPosition")]
    pub assigned_position: String,
}

#[derive(Debug, Deserialize)]
pub struct Action {
    #[serde(default, rename = "championId")]
    pub champion_id: i64,
    #[serde(default)]
    pub completed: bool,
    /// "ban" | "pick"
    #[serde(rename = "type")]
    pub action_type: String,
}
