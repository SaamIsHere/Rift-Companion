// These mirror the serde-serialized structs emitted by the Rust backend.
// Keep them in sync with src-tauri/src/*.

export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export type ConnectionStatus = "searching" | "connected";

export interface DraftPick {
  champion_id: number;
  role: Role | null;
  is_local: boolean;
}

export interface DraftState {
  local_role: Role | null;
  local_champion_id: number | null;
  bans: number[];
  allies: DraftPick[];
  enemies: DraftPick[];
}

export interface ScoreComponents {
  matchup: number;
  synergy: number;
  counter: number;
  comp: number;
}

export interface Recommendation {
  champion_id: number;
  name: string;
  image: string; // Data Dragon key, e.g. "Garen"
  score: number; // 0–100 display score
  components: ScoreComponents;
  reasons: string[];
}

// matchup/synergy/counter are no longer scalar weights — they're driven by
// the static ALLY_WEIGHTS/ENEMY_WEIGHTS role matrices in weights.rs.
export interface Weights {
  comp: number;
}
