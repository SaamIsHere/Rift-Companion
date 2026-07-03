import { writable } from "svelte/store";
import type { RankTier } from "../types";

/** Rank tier currently driving OP.GG data fetching. */
export const rankTier = writable<RankTier>("emerald_plus");

/** True while a rank change is re-crawling OP.GG in the background. */
export const rankRefreshing = writable<boolean>(false);

/** Live progress of the in-flight crawl (champion/role fetches done/total), or null when unknown. */
export const rankRefreshProgress = writable<{ done: number; total: number } | null>(null);
