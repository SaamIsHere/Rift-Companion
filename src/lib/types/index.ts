// These mirror the serde-serialized structs emitted by the Rust backend.
// Keep them in sync with src-tauri/src/*.

export type Role = "top" | "jungle" | "mid" | "adc" | "support";

export type ConnectionStatus = "searching" | "connected";

// Active account's profile (Issue #9), fetched from the LCU on client connect.
export interface Summoner {
  display_name: string; // "Name#TAG" Riot ID, or legacy displayName as fallback
  level: number;
  profile_icon_id: number;
  puuid?: string;
  game_name?: string;
  tag_line?: string;
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
  spell1_id?: number | null;
  spell2_id?: number | null;
}

export interface DraftState {
  local_role: Role | null;
  local_champion_id: number | null;
  hovered_champion_id?: number | null;
  is_locked?: boolean;
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
  good_matchups?: string[];
  bad_matchups?: string[];
  synergies?: string[];
}

// One ally/enemy relationship's historical win rate, fetched on demand for
// the draft-board hover preview (Issue #7).
export interface PairwiseStat {
  winrate: number; // Bayesian-smoothed, 0–1
  games: number;
  delta: number; // winrate - 0.5, signed
}

export type ScoringMode = "default" | "teamplayer" | "counterpick";

// matchup/synergy/counter are driven by ALLY_WEIGHTS/ENEMY_WEIGHTS and ScoringMode
export interface Weights {
  comp: number;
  mode?: ScoringMode;
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

export interface RankedQueueInfo {
  queue_type: string;
  queue_label: string;
  tier: string;
  division: string;
  league_points: number;
  wins: number;
  losses: number;
  win_rate: number;
  tier_image_url?: string;
}

export interface ChampionPerformance {
  id: number;
  name: string;
  games: number;
  wins: number;
  losses: number;
  win_rate: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs?: number;
  cs_per_min?: number;
  mastery_level?: number;
  mastery_points?: number;
}

export interface DetailedParticipant {
  summoner_name: string;
  game_name?: string;
  tag_line?: string;
  champion_id: number;
  champion_name: string;
  team_id: number;
  is_local: boolean;
  position?: string;
  kills: number;
  deaths: number;
  assists: number;
  champion_level: number;
  total_damage: number;
  gold_earned: number;
  cs: number;
  vision_score?: number;
  spells: number[];
  items: number[];
  primary_rune_id?: number;
  secondary_style_id?: number;
  op_score?: number;
  win: boolean;
}

export interface PlayerMatch {
  id: string;
  game_creation: number;
  raw_created_at?: string;
  game_duration: number;
  game_type: string;
  queue_label: string;
  win: boolean;
  is_remake?: boolean;
  champion_id: number;
  champion_name: string;
  champion_level: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  kill_participation?: number;
  total_damage: number;
  gold_earned: number;
  cs: number;
  cs_per_min: number;
  vision_score?: number;
  spells: number[];
  items: number[];
  primary_rune_id?: number;
  secondary_style_id?: number;
  op_score?: number;
  op_score_rank?: number;
  participants?: DetailedParticipant[];
}

export interface FullPlayerProfile {
  game_name: string;
  tag_line: string;
  display_name: string;
  level: number;
  profile_icon_id?: number;
  profile_icon_url?: string;
  region: string;
  solo_rank?: RankedQueueInfo | null;
  flex_rank?: RankedQueueInfo | null;
  top_champions: ChampionPerformance[];
  source: "lcu" | "opgg" | "cache";
  updated_at: number;
}

// Issue #11: Match Simulation Models
export interface SimulatedLaneMatchup {
  role: Role;
  role_label: string;
  ally_champion_id?: number | null;
  ally_champion_name?: string | null;
  enemy_champion_id?: number | null;
  enemy_champion_name?: string | null;
  ally_winrate?: number | null;
  games: number;
  delta: number;
  advantage: "ally" | "enemy" | "even" | "uncontested";
}

export interface SimulatedTeamComp {
  champions_count: number;
  physical_count: number;
  magic_count: number;
  mixed_count: number;
  frontline_count: number;
  physical_pct: number;
  magic_pct: number;
  warnings: string[];
  strengths: string[];
}

export interface SimulatedSynergy {
  champion_a_id: number;
  champion_a_name: string;
  champion_b_id: number;
  champion_b_name: string;
  role_a: Role;
  role_b: Role;
  winrate: number;
  games: number;
  delta: number;
}

export interface SimulatedCounter {
  winner_id: number;
  winner_name: string;
  winner_team: "blue" | "red";
  loser_id: number;
  loser_name: string;
  role: Role;
  winrate: number;
  games: number;
  delta: number;
}

export interface SimulatedMatchAnalysis {
  blue_win_chance: number;
  lane_matchups: SimulatedLaneMatchup[];
  blue_comp: SimulatedTeamComp;
  red_comp: SimulatedTeamComp;
  synergies: SimulatedSynergy[];
  counters: SimulatedCounter[];
  insights: string[];
}



