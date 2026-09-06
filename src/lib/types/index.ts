// These mirror the serde-serialized structs emitted by the Rust backend.
// Keep them in sync with src-tauri/src/*.

export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export type ConnectionStatus = "searching" | "connected";

// Active account's profile (Issue #9), fetched from the LCU on client connect.
export interface Summoner {
  display_name: string; // "Name#TAG" Riot ID, or legacy displayName as fallback
  level: number;
  profile_icon_id: number;
}

export type RankTier =
  | "iron_plus"
  | "bronze_plus"
  | "silver_plus"
  | "gold_plus"
  | "platinum_plus"
  | "emerald_plus"
  | "diamond_plus"
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum";

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
  server_url: string;
}

export interface ServerStatus {
  patch: string | null;
  last_updated: number | null;
  crawling: boolean;
  crawl_progress: {
    tier: string;
    done: number;
    total: number;
    champion: string;
  } | null;
  tiers: Record<string, { champions: number; updated_at: number }>;
  supported_tiers: string[];
}

export interface PerkStyleRef {
  id?: number;
  name?: string;
}

export interface RuneItemRef {
  id?: number;
  name?: string;
}

export interface RunePageStats {
  id?: number;
  play?: number;
  pick_rate?: number;
  win_rate?: number;
  primary_style?: PerkStyleRef;
  secondary_style?: PerkStyleRef;
  primary_runes: RuneItemRef[];
  secondary_runes: RuneItemRef[];
  shards: RuneItemRef[];
}

export interface SummonerSpellStats {
  ids: number[];
  names: string[];
  pick_rate?: number;
  win_rate?: number;
  play?: number;
}

export interface SkillOrderStats {
  priority: string[];
  order?: string[] | null;
  pick_rate?: number;
  win_rate?: number;
  play?: number;
}

export interface StarterItemStats {
  ids: number[];
  names: string[];
  pick_rate?: number;
  win_rate?: number;
  play?: number;
}

export interface BootsStats {
  id: number;
  name: string;
  pick_rate?: number;
  win_rate?: number;
  play?: number;
}

export interface CoreItemStats {
  ids: number[];
  names: string[];
  pick_rate?: number;
  win_rate?: number;
  play?: number;
}

export interface DepthItemStats {
  id: number;
  name: string;
  pick_rate?: number;
  win_rate?: number;
  play?: number;
}

export interface ChampionBuildStats {
  runes: RunePageStats[];
  summoner_spells: SummonerSpellStats[];
  skill_order?: SkillOrderStats | null;
  starter_items: StarterItemStats[];
  boots: BootsStats[];
  core_items: CoreItemStats[];
  fourth_items: DepthItemStats[];
  fifth_items: DepthItemStats[];
  sixth_items: DepthItemStats[];
}

export interface ChampionMatchupEntry {
  champion_id: number;
  name: string;
  image: string;
  winrate: number;
  games: number;
}

export interface ChampionOverviewData {
  champion_id: number;
  name: string;
  image: string;
  damage: "physical" | "magic" | "mixed";
  frontline: boolean;
  roles: Role[];
  selected_role: Role;
  winrate: number;
  games: number;
  build?: ChampionBuildStats | null;
  best_matchups: ChampionMatchupEntry[];
  worst_matchups: ChampionMatchupEntry[];
  all_matchups: ChampionMatchupEntry[];
  best_synergies: ChampionMatchupEntry[];
  all_synergies: ChampionMatchupEntry[];
}

export interface RoleChampionItem {
  champion_id: number;
  name: string;
  image: string;
  damage: "physical" | "magic" | "mixed";
  frontline: boolean;
  roles: Role[];
  role: Role;
  tier: string;
  winrate: number;
  pick_rate: number;
  ban_rate: number;
  games: number;
  weak_against: ChampionMatchupEntry[];
  has_build: boolean;
}


