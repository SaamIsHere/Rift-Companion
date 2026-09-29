import { writable } from "svelte/store";

/**
 * Top 5 distinct recent ban suggestions (ordered from #1 most recent to #5).
 */
export const recentBans = writable<number[]>([]);

/**
 * Full recorded ban history (up to 20 recorded bans in FIFO order).
 */
export const banHistory = writable<number[]>([]);
