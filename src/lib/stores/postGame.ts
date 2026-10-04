import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { PostGameMatch } from "../types";
import { normalizePostGameMatch, createMockPostGameMatch } from "../utils/postGameScoring";
import { profile } from "./profile";
import { activeTab } from "./navigation";

export const postGameMatch = writable<PostGameMatch | null>(null);
export const isPostGameLoading = writable<boolean>(false);
export const postGameError = writable<string | null>(null);

/**
 * Sets the active post-game match and navigates to the post_game tab.
 */
export function setPostGameMatch(match: PostGameMatch | null, autoNavigate = true) {
  postGameMatch.set(match);
  if (match && autoNavigate) {
    activeTab.set("post_game");
  }
}

/**
 * Loads a match by raw LCU object or JSON.
 */
export function loadPostGameFromRaw(raw: any, autoNavigate = true): PostGameMatch | null {
  const currentProfile = get(profile);
  const localTarget = currentProfile?.puuid || currentProfile?.display_name || currentProfile?.game_name;
  const normalized = normalizePostGameMatch(raw, localTarget);
  if (normalized) {
    setPostGameMatch(normalized, autoNavigate);
    return normalized;
  }
  return null;
}

/**
 * Clears current post-game match and invokes Tauri backend to reset cached post-game.
 */
export async function clearPostGame() {
  postGameMatch.set(null);
  postGameError.set(null);
  try {
    await invoke("clear_post_game_data");
  } catch {}
}

/**
 * Loads the built-in mock match for instant testing & evaluation.
 */
export function loadMockPostGame(win = true, mode: "classic" | "aram" = "classic") {
  const mock = createMockPostGameMatch(win, mode);
  setPostGameMatch(mock, true);
  return mock;
}

/**
 * Pulls the latest match directly from LCU match history and processes it.
 */
export async function fetchLatestPostGame(): Promise<PostGameMatch | null> {
  isPostGameLoading.set(true);
  postGameError.set(null);
  try {
    const raw: any = await invoke("fetch_latest_post_game");
    if (raw && raw.game) {
      const match = loadPostGameFromRaw(raw, true);
      return match;
    } else {
      postGameError.set("No recently completed match found in client history.");
      return null;
    }
  } catch (e: any) {
    postGameError.set(e?.message || "Failed to load match data.");
    return null;
  } finally {
    isPostGameLoading.set(false);
  }
}
