import { writable } from "svelte/store";
import type { Summoner } from "../types";

const STORAGE_KEY = "rift_cached_profile";

function getInitialProfile(): Summoner | null {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return null;
}

// Remembers the last connected summoner across sessions (Issue #40).
export const profile = writable<Summoner | null>(getInitialProfile());

if (typeof localStorage !== "undefined") {
  profile.subscribe((val) => {
    try {
      if (val) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
      }
    } catch {
      // ignore
    }
  });
}
