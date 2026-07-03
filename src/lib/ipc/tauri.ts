import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { connection } from "../stores/connection";
import { draft } from "../stores/draft";
import { rankRefreshing, rankRefreshProgress, rankTier } from "../stores/rank";
import { recommendations } from "../stores/recommendations";
import type {
  ConnectionStatus,
  DraftState,
  RankTier,
  Recommendation,
  Role,
  Weights,
} from "../types";

/**
 * Wire backend events into the Svelte stores and prime initial state.
 * Call once on app mount.
 */
export async function initIpc(): Promise<void> {
  // Subscribe first so we never miss an update that fires during priming.
  await listen<ConnectionStatus>("lcu://connection", (e) =>
    connection.set(e.payload),
  );
  await listen<DraftState>("champ-select://update", (e) =>
    draft.set(e.payload),
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
    draft.set(await invoke<DraftState | null>("get_draft_state"));
    recommendations.set(await invoke<Recommendation[]>("get_recommendations"));
    rankTier.set(await invoke<RankTier>("get_rank_tier"));
  } catch (err) {
    console.error("Failed to prime state from backend", err);
  }
}

/** Push new algorithm weights and receive a freshly ranked list. */
export async function setWeights(weights: Weights): Promise<Recommendation[]> {
  return invoke<Recommendation[]>("set_weights", { weights });
}

/**
 * Manually reassign an enemy pick's guessed role and receive a freshly ranked
 * list. Pass `role: null` to clear the override and revert to the guess.
 */
export async function setEnemyRole(
  championId: number,
  role: Role | null,
): Promise<Recommendation[]> {
  return invoke<Recommendation[]>("set_enemy_role", { championId, role });
}

/**
 * Manually select a rank tier for OP.GG data fetching. Triggers a background
 * re-crawl; the resolved dataset lands via the "recommendations://update" and
 * "rank-refresh://status" events rather than this call's return value.
 */
export async function setRankTier(tier: RankTier): Promise<void> {
  return invoke("set_rank_tier", { tier });
}
