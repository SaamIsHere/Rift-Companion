import { writable } from "svelte/store";
import type { RankTier } from "../types";

const STORAGE_KEY = "rift_cached_rank_tier";

function getInitialRankTier(): RankTier {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return saved as RankTier;
    }
  } catch {
    // ignore
  }
  return "emerald_plus";
}

/** Rank tier currently driving OP.GG data fetching (persisted across sessions). */
export const rankTier = writable<RankTier>(getInitialRankTier());

if (typeof localStorage !== "undefined") {
  rankTier.subscribe((val) => {
    try {
      if (val) localStorage.setItem(STORAGE_KEY, val);
    } catch {
      // ignore
    }
  });
}

/** True while a rank change is re-crawling OP.GG in the background. */
export const rankRefreshing = writable<boolean>(false);

/** Live progress of the in-flight crawl (champion/role fetches done/total), or null when unknown. */
export const rankRefreshProgress = writable<{ done: number; total: number } | null>(null);
