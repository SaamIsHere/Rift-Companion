// These mirror the serde-serialized structs emitted by the Rust backend.
// Keep them in sync with src-tauri/src/*.

export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export type ConnectionStatus = "searching" | "connected";

export type RankTier =
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "emerald_plus"
  | "diamond_plus";

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

// Colors which "why" category a badge belongs to (Issue #7): green for a
// good matchup/synergy, red for a bad one, blue for a comp-gap fill, grey
// for the no-signal fallback.
export type BadgeKind = "positive" | "negative" | "comp" | "neutral";

export interface Badge {
  text: string;
  kind: BadgeKind;
}

export interface Recommendation {
  champion_id: number;
  name: string;
  image: string; // Data Dragon key, e.g. "Garen"
  score: number; // 0–100 display score
  components: ScoreComponents;
  badges: Badge[];
}

// One ally/enemy relationship's historical win rate, fetched on demand for
// the draft-board hover preview (Issue #7).
export interface PairwiseStat {
  winrate: number; // Bayesian-smoothed, 0–1
  games: number;
  delta: number; // winrate - 0.5, signed
}

// matchup/synergy/counter are no longer scalar weights — they're driven by
// the static ALLY_WEIGHTS/ENEMY_WEIGHTS role matrices in weights.rs.
export interface Weights {
  comp: number;
}

// User-adjustable app settings (Issue #15), persisted to settings.json.
export interface Settings {
  compact_density: boolean;
  always_on_top: boolean;
  comp_weight: number;
}
