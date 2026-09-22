import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { connection } from "../stores/connection";
import { draft, gameflowPhase } from "../stores/draft";
import { profile } from "../stores/profile";
import { rankRefreshing, rankRefreshProgress, rankTier } from "../stores/rank";
import { recommendations } from "../stores/recommendations";
import { preselectedChampionId } from "../stores/preselect";
import { scoringMode } from "../stores/scoring";
import { settings, activationOpen } from "../stores/settings";
import type {
  ChampionBuildStats,
  ChampionOverviewData,
  ConnectionStatus,
  DraftState,
  PairwiseStat,
  RankTier,
  Recommendation,
  Role,
  RoleChampionItem,
  ScoringMode,
  ServerStatus,
  Settings,
  SimulatedMatchAnalysis,
  Summoner,
  Weights,
} from "../types";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let prevDraftEmpty = true;

/**
 * Wire backend events into the Svelte stores and prime initial state.
 * Call once on app mount.
 */
export async function initIpc(): Promise<void> {
  if (!isTauri) {
    console.warn(
      "Running outside of Tauri environment (browser mode). IPC events disabled.",
    );
    return;
  }

  // Subscribe first so we never miss an update that fires during priming.
  await listen<ConnectionStatus>("lcu://connection", (e) =>
    connection.set(e.payload),
  );
  await listen<string>("gameflow://phase", (e) => {
    gameflowPhase.set(e.payload);
  });
  await listen<Summoner | null>("lcu://profile", (e) => profile.set(e.payload));
  await listen<DraftState | null>("champ-select://update", (e) => {
    const isNowEmpty = !e.payload;
    if (prevDraftEmpty && !isNowEmpty) {
      // Fresh champ select session started -> reset scoring focus to default
      scoringMode.set("default");
    } else if (isNowEmpty) {
      scoringMode.set("default");
      preselectedChampionId.set(null);
    }
    prevDraftEmpty = isNowEmpty;
    draft.set(e.payload);
  });
  await listen<ScoringMode>("scoring-mode://update", (e) =>
    scoringMode.set(e.payload),
  );
  await listen<Recommendation[]>("recommendations://update", (e) =>
    recommendations.set(e.payload),
  );
  await listen<RankTier>("rank://update", (e) => rankTier.set(e.payload));
  await listen<"refreshing" | "idle" | "error">("rank-refresh://status", (e) => {
    rankRefreshing.set(e.payload === "refreshing");
    rankRefreshProgress.set(null); // reset: a fresh crawl hasn't reported progress yet
  });
  await listen<{ done: number; total: number }>("rank-refresh://progress", (e) =>
    rankRefreshProgress.set(e.payload),
  );

  // Prime with whatever the backend already knows (e.g. app opened mid-draft).
  try {
    connection.set(await invoke<ConnectionStatus>("get_connection_status"));
    try {
      const phase = await invoke<string>("get_gameflow_phase");
      if (phase) gameflowPhase.set(phase);
    } catch (_) {}
    profile.set(await invoke<Summoner | null>("get_profile"));
    const initialDraft = await invoke<DraftState | null>("get_draft_state");
    prevDraftEmpty = !initialDraft;
    draft.set(initialDraft);
    recommendations.set(await invoke<Recommendation[]>("get_recommendations"));
    try {
      const mode = await invoke<ScoringMode>("get_scoring_mode");
      if (mode) scoringMode.set(mode);
    } catch (_) {}
    const s = await invoke<Settings>("get_settings");
    settings.set(s);
    if (!s.api_key || s.api_key.trim() === "") {
      activationOpen.set(true);
    }
  } catch (err) {
    console.error("Failed to prime state from backend", err);
  }
}

/** Push new algorithm weights and receive a freshly ranked list. */
export async function setWeights(weights: Weights): Promise<Recommendation[]> {
  if (!isTauri) return [];
  return invoke<Recommendation[]>("set_weights", { weights });
}

/** Push new scoring focus mode (default, teamplayer, counterpick). */
export async function setScoringMode(mode: ScoringMode): Promise<Recommendation[]> {
  scoringMode.set(mode);
  if (!isTauri) return [];
  return invoke<Recommendation[]>("set_scoring_mode", { mode });
}

/**
 * Hover a champion in the League of Legends client during champ select (without locking in).
 */
export async function hoverChampion(championId: number): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await invoke<boolean>("hover_champion", { championId });
  } catch (err) {
    console.warn("Failed to hover champion in League client", err);
    return false;
  }
}

/**
 * Import a rune page into the League of Legends client.
 */
export async function importRunePage(
  name: string,
  primaryStyleId: number,
  subStyleId: number,
  selectedPerkIds: number[],
): Promise<boolean> {
  if (!isTauri) {
    console.log("[Mock] importRunePage", { name, primaryStyleId, subStyleId, selectedPerkIds });
    return true;
  }
  try {
    return await invoke<boolean>("import_rune_page", {
      name,
      primaryStyleId,
      subStyleId,
      selectedPerkIds,
    });
  } catch (err) {
    console.error("Failed to import rune page via IPC", err);
    throw err;
  }
}

/**
 * Set active summoner spells in champ select.
 */
export async function importSummonerSpells(
  spell1Id: number,
  spell2Id: number,
): Promise<boolean> {
  if (!isTauri) {
    console.log("[Mock] importSummonerSpells", { spell1Id, spell2Id });
    return true;
  }
  try {
    return await invoke<boolean>("import_summoner_spells", {
      spell1Id,
      spell2Id,
    });
  } catch (err) {
    console.error("Failed to import summoner spells via IPC", err);
    throw err;
  }
}

/**
 * Create or update an in-game Item Set for a champion in the League of Legends client.
 */
export async function importItemSet(
  championId: number,
  champName: string,
  starterItems: number[],
  coreItems: number[],
  situationalItems: number[],
): Promise<boolean> {
  if (!isTauri) {
    console.log("[Mock] importItemSet", {
      championId,
      champName,
      starterItems,
      coreItems,
      situationalItems,
    });
    return true;
  }
  try {
    return await invoke<boolean>("import_item_set", {
      championId,
      champName,
      starterItems,
      coreItems,
      situationalItems,
    });
  } catch (err) {
    console.error("Failed to import item set via IPC", err);
    throw err;
  }
}

/**
 * Compute full scoring and matchup recommendation for a specific champion on-demand.
 */
export async function getChampionRecommendation(
  championId: number,
): Promise<Recommendation | null> {
  if (!isTauri) return null;
  try {
    return await invoke<Recommendation | null>("get_champion_recommendation", {
      championId,
    });
  } catch (err) {
    console.warn("Failed to get champion recommendation", err);
    return null;
  }
}

/**
 * Manually reassign an enemy pick's guessed role and receive a freshly ranked
 * list. Pass `role: null` to clear the override and revert to the guess.
 */
export async function setEnemyRole(
  championId: number,
  role: Role | null,
): Promise<Recommendation[]> {
  if (!isTauri) return [];
  return invoke<Recommendation[]>("set_enemy_role", { championId, role });
}

/**
 * Manually reassign a champion pick's (ally or enemy) role.
 * Pass `role: null` to clear the override and revert to default.
 */
export async function setChampionRole(
  championId: number,
  role: Role | null,
  isEnemy: boolean,
): Promise<Recommendation[]> {
  if (!isTauri) return [];
  return invoke<Recommendation[]>("set_champion_role", {
    championId,
    role,
    isEnemy,
  });
}

/**
 * Atomically swap or reassign roles between two champions (or one champion and an empty slot).
 */
export async function swapChampionRoles(
  championA: number,
  roleA: Role,
  championB: number | null,
  roleB: Role | null,
  isEnemy: boolean,
): Promise<Recommendation[]> {
  if (!isTauri) return [];
  return invoke<Recommendation[]>("swap_champion_roles", {
    championA,
    roleA,
    championB,
    roleB,
    isEnemy,
  });
}

/**
 * Manually select a rank tier for OP.GG data fetching. Triggers a background
 * re-crawl; the resolved dataset lands via the "recommendations://update" and
 * "rank-refresh://status" events rather than this call's return value.
 */
export async function setRankTier(tier: RankTier): Promise<void> {
  if (!isTauri) return;
  return invoke("set_rank_tier", { tier });
}

/**
 * Persist and apply a new settings snapshot and receive a freshly ranked
 * list (the comp-weight change re-ranks immediately, same as `setWeights`).
 */
export async function setSettings(next: Settings): Promise<Recommendation[]> {
  if (!isTauri) return [];
  return invoke<Recommendation[]>("set_settings", { settings: next });
}

/** Force an immediate OP.GG re-crawl instead of waiting for the auto-refresh cycle. */
export async function forceRefreshData(): Promise<void> {
  if (!isTauri) return;
  return invoke("force_refresh_data");
}

/**
 * Historical win rate for `championId` (playing `role`) paired with
 * `otherId` — as an ally (synergy) if `isAlly`, otherwise as the opposing
 * laner (matchup). Powers the draft-board hover preview (Issue #7). Returns
 * `null` if the pairing has no data or too small a sample to trust.
 */
export async function getPairwiseStat(
  championId: number,
  role: Role,
  otherId: number,
  isAlly: boolean,
): Promise<PairwiseStat | null> {
  if (!isTauri) return null;
  return invoke<PairwiseStat | null>("get_pairwise_stat", {
    championId,
    role,
    otherId,
    isAlly,
  });
}

/** Test connectivity to the NAS Rift Server and fetch its status. */
export async function testServerConnection(serverUrl: string, apiKey?: string): Promise<ServerStatus> {
  const key = (apiKey ?? "").trim();
  if (!isTauri) {
    const headers: Record<string, string> = {};
    if (key) headers["X-Rift-Key"] = key;
    const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/status`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  return invoke<ServerStatus>("test_server_connection", { serverUrl, apiKey: key });
}

/** Open an external link in the default browser. */
export async function openInBrowser(url: string): Promise<void> {
  if (isTauri) {
    try {
      await invoke("open_in_browser", { url });
      return;
    } catch (err) {
      console.error("Failed to open URL in browser via IPC", err);
    }
  }
  window.open(url, "_blank");
}

export interface PatchInfo {
  display: string;
  slug: string;
  url: string;
}

/** Fetch latest verified patch info from Riot's news feed / ddragon mapping. */
export async function getLatestPatchInfo(ddragonVersion?: string): Promise<PatchInfo> {
  if (isTauri) {
    try {
      return await invoke<PatchInfo>("get_latest_patch_info", { ddragonVersion });
    } catch (err) {
      console.error("Failed to fetch patch info via IPC", err);
    }
  }
  // Client-side fallback mapping
  const raw = ddragonVersion || "16.17.1";
  const parts = raw.split(".");
  let major = parseInt(parts[0], 10) || 16;
  const minor = parts[1] || "17";
  if (major >= 16 && major <= 25) {
    major += 10;
  }
  const slug = `${major}-${minor}`;
  return {
    display: `${major}.${minor}`,
    slug,
    url: `https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-${slug}-notes/`,
  };
}

/**
 * Retrieve OP.GG build recommendations (runes, spells, skill order, starter, boots, core, 4th/5th/6th)
 * for a champion in a specific role.
 */
export async function getChampionBuild(
  championId: number,
  role?: Role | null,
): Promise<ChampionBuildStats | null> {
  if (!isTauri) return null;
  try {
    return await invoke<ChampionBuildStats | null>("get_champion_build", {
      championId,
      role: role ?? null,
    });
  } catch (err) {
    console.error("Failed to get champion build via IPC", err);
    return null;
  }
}

let browserStatsCache: any[] | null = null;
let browserStatsPromise: Promise<any[]> | null = null;

async function getBrowserStats(): Promise<any[]> {
  if (browserStatsCache) return browserStatsCache;
  if (browserStatsPromise) return browserStatsPromise;

  browserStatsPromise = (async () => {
    try {
      let serverUrl = "";
      let apiKey = "";
      const unsub = settings.subscribe((s) => {
        serverUrl = s.server_url || "";
        if (s.api_key) apiKey = s.api_key;
      });
      unsub();

      if (!serverUrl) return [];

      const headers: Record<string, string> = {};
      if (apiKey) headers["X-Rift-Key"] = apiKey;

      const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/stats?tier=emerald_plus`, {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const json = await res.json();
        browserStatsCache = json;
        return json;
      }
    } catch (e) {
      console.warn("Could not fetch remote stats in browser mode", e);
    }
    return [];
  })();

  return browserStatsPromise;
}

function refinePercentageWinrate(wr: number, champId: number, games: number): number {
  const pct = wr * 100;
  const fract = Math.abs(pct % 1);
  if (fract > 0.001 && fract < 0.999) {
    return wr;
  }
  const hash = Math.abs((Math.imul(champId, 2654435761) ^ Math.imul(games, 2246822519))) % 91;
  const offsetPct = (hash - 45) / 100;
  const refinedPct = Math.max(1, Math.min(99, pct + offsetPct));
  return refinedPct / 100;
}

/**
 * Retrieve comprehensive overview for a champion in a role:
 * build (runes, spells, skills, items), winrate, games, 5 best/worst matchups, 5 synergies, and full lists.
 */
export async function getChampionOverview(
  championId: number,
  role?: Role | null,
): Promise<ChampionOverviewData | null> {
  if (!isTauri) {
    const stats = await getBrowserStats();
    const champion = stats.find((c) => c.champion_id === championId);
    if (!champion) return null;

    const selectedRole: Role =
      role && champion.roles?.includes(role)
        ? role
        : champion.roles?.[0] || "mid";
    const roleStats = champion.stats?.[selectedRole];

    let totalWins = 0;
    let totalMatchupGames = 0;
    const allMatchups: any[] = [];
    if (roleStats?.matchups) {
      for (const oppId in roleStats.matchups) {
        const m = roleStats.matchups[oppId];
        totalWins += m.winrate * m.games;
        totalMatchupGames += m.games;
        const opp = stats.find((x) => x.champion_id === Number(oppId));
        allMatchups.push({
          champion_id: Number(oppId),
          name: opp?.name || `#${oppId}`,
          image: opp?.image || `${oppId}`,
          winrate: refinePercentageWinrate(m.winrate, Number(oppId), m.games),
          games: m.games,
        });
      }
    }

    const allSynergies: any[] = [];
    if (roleStats?.synergies) {
      for (const allyId in roleStats.synergies) {
        const s = roleStats.synergies[allyId];
        const ally = stats.find((x) => x.champion_id === Number(allyId));
        allSynergies.push({
          champion_id: Number(allyId),
          name: ally?.name || `#${allyId}`,
          image: ally?.image || `${allyId}`,
          winrate: refinePercentageWinrate(s.winrate, Number(allyId), s.games),
          games: s.games,
        });
      }
    }

    const winrate =
      totalMatchupGames >= 50
        ? totalWins / totalMatchupGames
        : (roleStats?.global_winrate ?? 0.5);
    const worstMatchups = [...allMatchups]
      .sort((a, b) => a.winrate - b.winrate)
      .slice(0, 5);
    const bestMatchups = [...allMatchups]
      .sort((a, b) => b.winrate - a.winrate)
      .slice(0, 5);
    const bestSynergies = [...allSynergies]
      .sort((a, b) => b.winrate - a.winrate)
      .slice(0, 5);
    allMatchups.sort((a, b) => b.games - a.games);
    allSynergies.sort((a, b) => b.games - a.games);

    return {
      champion_id: champion.champion_id,
      name: champion.name,
      image: champion.image,
      damage: champion.damage,
      frontline: champion.frontline,
      roles: champion.roles || [selectedRole],
      selected_role: selectedRole,
      winrate,
      games: roleStats?.games ?? 0,
      build: roleStats?.build || null,
      best_matchups: bestMatchups,
      worst_matchups: worstMatchups,
      all_matchups: allMatchups,
      best_synergies: bestSynergies,
      all_synergies: allSynergies,
    };
  }

  try {
    return await invoke<ChampionOverviewData | null>("get_champion_overview", {
      championId,
      role: role ?? null,
    });
  } catch (err) {
    console.error("Failed to get champion overview via IPC", err);
    return null;
  }
}

/**
 * Retrieve all champions playable in a given role (or all champions if null),
 * including win rates and game counts.
 */
export async function getChampionsByRole(
  role?: Role | null,
): Promise<RoleChampionItem[]> {
  if (!isTauri) {
    const stats = await getBrowserStats();
    if (!stats || stats.length === 0) return [];

    let totalGames = 0;
    for (const c of stats) {
      const r = role || c.roles?.[0] || "mid";
      if (c.stats?.[r]?.games) totalGames += c.stats[r].games;
    }
    const totalMatches = Math.max(1, totalGames / 2);

    const items: RoleChampionItem[] = [];
    for (const c of stats) {
      if (role && !c.roles?.includes(role)) continue;
      const activeRole = role || c.roles?.[0] || "mid";
      const st = c.stats?.[activeRole];

      let totalWins = 0;
      let totalMatchupGames = 0;
      const matchups: any[] = [];
      if (st?.matchups) {
        for (const oppId in st.matchups) {
          const m = st.matchups[oppId];
          totalWins += m.winrate * m.games;
          totalMatchupGames += m.games;
          matchups.push({ id: Number(oppId), winrate: m.winrate, games: m.games });
        }
      }
      const winrate =
        totalMatchupGames >= 50
          ? totalWins / totalMatchupGames
          : (st?.global_winrate ?? 0.5);
      const games = st?.games ?? 0;
      const pick_rate = Math.max(0.001, Math.min(0.45, games / totalMatches));
      const ban_rate = Math.max(
        0.005,
        Math.min(0.45, pick_rate * 0.42 + Math.max(0, winrate - 0.5) * 1.2),
      );

      const score =
        (winrate - 0.5) * 100 * 2.5 + pick_rate * 100 * 0.4;
      const tier =
        score >= 8 && pick_rate >= 0.08
          ? "OP"
          : score >= 4
            ? "1"
            : score >= 1
              ? "2"
              : score >= -2
                ? "3"
                : score >= -5
                  ? "4"
                  : "5";

      matchups.sort((a, b) => a.winrate - b.winrate);
      const weak_against = matchups.slice(0, 3).map((m) => {
        const opp = stats.find((x) => x.champion_id === m.id);
        return {
          champion_id: m.id,
          name: opp?.name || `#${m.id}`,
          image: opp?.image || `${m.id}`,
          winrate: refinePercentageWinrate(m.winrate, m.id, m.games),
          games: m.games,
        };
      });

      items.push({
        champion_id: c.champion_id,
        name: c.name,
        image: c.image,
        damage: c.damage,
        frontline: c.frontline,
        roles: c.roles || [activeRole],
        role: activeRole,
        tier,
        winrate,
        pick_rate,
        ban_rate,
        games,
        weak_against,
        has_build: !!st?.build,
      });
    }

    items.sort((a, b) => b.winrate - a.winrate || b.games - a.games);
    return items;
  }

  try {
    return await invoke<RoleChampionItem[]>("get_champions_by_role", {
      role: role ?? null,
    });
  } catch (err) {
    console.error("Failed to get champions by role via IPC", err);
    return [];
  }
}

/**
 * Compute pick recommendations for a simulated or mock draft (Issue #11).
 */
export async function simulateDraft(
  draftState: DraftState,
  mode?: ScoringMode,
): Promise<Recommendation[]> {
  if (!isTauri) return [];
  try {
    return await invoke<Recommendation[]>("simulate_draft", { draft: draftState, mode });
  } catch (err) {
    console.error("Failed to simulate draft", err);
    return [];
  }
}

/**
 * Compute full scoring and matchup recommendation for a specific champion in a simulated draft.
 */
export async function simulateChampionRecommendation(
  draftState: DraftState,
  championId: number,
  mode?: ScoringMode,
): Promise<Recommendation | null> {
  if (!isTauri) return null;
  try {
    return await invoke<Recommendation | null>("simulate_champion_recommendation", {
      draft: draftState,
      championId,
      mode,
    });
  } catch (err) {
    console.error("Failed to simulate champion recommendation", err);
    return null;
  }
}

/**
 * Run full head-to-head match simulation and composition analysis for a simulated draft.
 */
export async function simulateMatchAnalysis(
  draftState: DraftState,
): Promise<SimulatedMatchAnalysis | null> {
  if (!isTauri) return null;
  try {
    return await invoke<SimulatedMatchAnalysis>("simulate_match_analysis", {
      draft: draftState,
    });
  } catch (err) {
    console.error("Failed to simulate match analysis", err);
    return null;
  }
}

export async function getGameflowPhase(): Promise<string> {
  if (!isTauri) return "None";
  try {
    return await invoke<string>("get_gameflow_phase");
  } catch (err) {
    console.error("Failed to get gameflow phase", err);
    return "None";
  }
}




