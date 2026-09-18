import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { Summoner, FullPlayerProfile, PlayerMatch, DetailedParticipant } from "../types";
import { normalizeProfile, normalizeMatches, normalizeGameDetail, extractBansFromGameDetail } from "../utils/profileNormalizer";

const STORAGE_KEY = "rift_cached_profile";
const RECENT_SEARCHES_KEY = "rift_recent_searches";

export interface RecentSearchItem {
  riot_id: string;
  region: string;
  level?: number;
  profile_icon_id?: number;
  profile_icon_url?: string;
  tier?: string;
}

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

function getInitialRecentSearches(): RecentSearchItem[] {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return [];
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

export const viewedProfile = writable<FullPlayerProfile | null>(null);
export const viewedMatches = writable<PlayerMatch[]>([]);
export const viewedProfileLoading = writable<boolean>(false);
export const viewedMatchesLoading = writable<boolean>(false);
export const viewedProfileError = writable<string | null>(null);
export const recentSearches = writable<RecentSearchItem[]>(getInitialRecentSearches());
export const lastSyncedAt = writable<number | null>(null);

/** Global search query across LandingPage and ProfileView */
export const activeSearchQuery = writable<string>("");
/** Indicates an intentional summoner search has taken place (prevents auto-reloading local profile) */
export const isExplicitSearch = writable<boolean>(false);

/** Auto-refresh time-to-live: 3 hours in milliseconds */
export const AUTO_REFRESH_TTL_MS = 3 * 60 * 60 * 1000;

const CACHE_PREFIX = "rift_profile_v3_cache_";

// Automatically purge corrupted or outdated cache entries from earlier buggy versions
try {
  if (typeof localStorage !== "undefined") {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("rift_profile_cache_") || k.startsWith("rift_profile_v2_cache_"))) {
        localStorage.removeItem(k);
      }
    }
  }
} catch {}

function saveRecentSearch(item: RecentSearchItem) {
  recentSearches.update((list) => {
    const filtered = list.filter(
      (s) =>
        s.riot_id.toLowerCase() !== item.riot_id.toLowerCase() ||
        s.region.toLowerCase() !== item.region.toLowerCase()
    );
    const updated = [item, ...filtered].slice(0, 8);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      }
    } catch {}
    return updated;
  });
}

export function removeRecentSearch(riotId: string, region: string) {
  recentSearches.update((list) => {
    const updated = list.filter(
      (s) =>
        s.riot_id.toLowerCase() !== riotId.toLowerCase() ||
        s.region.toLowerCase() !== region.toLowerCase()
    );
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      }
    } catch {}
    return updated;
  });
}

export function clearAllRecentSearches() {
  recentSearches.set([]);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    }
  } catch {}
}

export async function loadPlayerProfile(
  gameName?: string,
  tagLine?: string,
  region = "EUW",
  forceRefresh = false
): Promise<void> {
  let local = get(profile);
  if (!gameName && !local) {
    try {
      const fetched = await invoke<Summoner | null>("get_profile");
      if (fetched) {
        profile.set(fetched);
        local = fetched;
      }
    } catch {}
  }

  // If no search query and no local/remembered profile, show search landing instead of erroring
  if (!gameName && !local) {
    viewedProfile.set(null);
    viewedMatches.set([]);
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    viewedProfileError.set(null);
    lastSyncedAt.set(null);
    return;
  }

  // Determine lookup key
  const gn = gameName || local?.game_name || local?.display_name.split("#")[0] || "Summoner";
  const tl = tagLine || local?.tag_line || local?.display_name.split("#")[1] || region;
  const cacheKey = `${CACHE_PREFIX}${region.toLowerCase()}_${gn.toLowerCase()}_${tl.toLowerCase()}`;

  // 1. Check local cache
  let cachedData: { profile: FullPlayerProfile; matches: PlayerMatch[]; cached_at: number } | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.profile) {
          const profileGameName = (parsed.profile.game_name || "").toLowerCase();
          const profileDispName = (parsed.profile.display_name || "").toLowerCase();
          const targetGn = gn.toLowerCase();
          // STRICT VALIDATION: Ensure the cached profile actually belongs to the searched summoner!
          const isMatch =
            !gameName ||
            profileGameName === targetGn ||
            profileDispName === `${targetGn}#${tl.toLowerCase()}` ||
            profileDispName.startsWith(`${targetGn}#`);
          if (isMatch) {
            cachedData = parsed;
            viewedProfile.set(parsed.profile);
            viewedMatches.set(parsed.matches || []);
            if (parsed.cached_at) {
              lastSyncedAt.set(parsed.cached_at);
            }
          }
        }
      }
    }
  } catch {}

  const cacheAge = cachedData ? Date.now() - (cachedData.cached_at || 0) : Infinity;

  // If cache is fresh (< 3 hours) and not a force refresh, DO NOT trigger network reload!
  if (cachedData && cacheAge < AUTO_REFRESH_TTL_MS && !forceRefresh) {
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    viewedProfileError.set(null);
    return;
  }

  // 2. Fetch fresh data from backend
  viewedProfileLoading.set(true);
  viewedMatchesLoading.set(true);
  viewedProfileError.set(null);

  // If no cached data exists for this player, clear the view so we display a loading spinner
  // rather than keeping the previous player's stats on screen
  if (!cachedData) {
    viewedProfile.set(null);
    viewedMatches.set([]);
  }

  try {
    const profileArgs: Record<string, any> = {
      region,
      gameName: gameName ? gn : undefined,
      game_name: gameName ? gn : undefined,
      tagLine: tagLine ? tl : undefined,
      tag_line: tagLine ? tl : undefined,
    };

    const rawProfile = await invoke<any>("get_player_profile", profileArgs);

    // Extract exact resolved game name, tagline, and region (e.g. from OP.GG or LCU)
    const targetGameName = rawProfile?.data?.summoner?.game_name || rawProfile?.summoner?.game_name || gn;
    const targetTagLine = rawProfile?.data?.summoner?.tagline || rawProfile?.summoner?.tag_line || tl;
    const targetRegion = rawProfile?.region || region;

    // Fetch matches using the exact resolved player identity
    const matchesArgs: Record<string, any> = {
      region: targetRegion,
      limit: 20,
      gameName: gameName ? targetGameName : undefined,
      game_name: gameName ? targetGameName : undefined,
      tagLine: tagLine ? targetTagLine : undefined,
      tag_line: tagLine ? targetTagLine : undefined,
    };

    let normalizedMatches: PlayerMatch[] = [];
    try {
      const rawMatches = await invoke<any>("get_player_matches", matchesArgs);
      normalizedMatches = normalizeMatches(rawMatches, targetGameName);
      viewedMatches.set(normalizedMatches);
    } catch (matchErr) {
      console.warn("Failed to fetch matches for player:", matchErr);
      viewedMatches.set([]);
    } finally {
      viewedMatchesLoading.set(false);
    }

    const normalizedProfile = normalizeProfile(rawProfile, targetRegion, normalizedMatches);
    viewedProfile.set(normalizedProfile);
    viewedProfileLoading.set(false);
    viewedProfileError.set(null);

    const now = Date.now();
    lastSyncedAt.set(now);

    // Save recent search
    saveRecentSearch({
      riot_id: normalizedProfile.display_name,
      region: targetRegion,
      level: normalizedProfile.level,
      profile_icon_id: normalizedProfile.profile_icon_id,
      profile_icon_url: normalizedProfile.profile_icon_url,
      tier: normalizedProfile.solo_rank?.tier || normalizedProfile.flex_rank?.tier,
    });

    // Save to cache under both query key and resolved key
    try {
      if (typeof localStorage !== "undefined") {
        const actualCacheKey = `${CACHE_PREFIX}${targetRegion.toLowerCase()}_${normalizedProfile.game_name.toLowerCase()}_${normalizedProfile.tag_line.toLowerCase()}`;
        const cachePayload = JSON.stringify({
          profile: normalizedProfile,
          matches: normalizedMatches,
          cached_at: now,
        });
        localStorage.setItem(actualCacheKey, cachePayload);
        if (actualCacheKey !== cacheKey && gameName) {
          localStorage.setItem(cacheKey, cachePayload);
        }
      }
    } catch {}
  } catch (err: any) {
    console.warn("Failed to load player profile:", err);
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    if (!cachedData) {
      viewedProfile.set(null);
      viewedMatches.set([]);
      viewedProfileError.set(err?.message || String(err));
    }
  }
}

export async function loadMatchDetail(
  matchId: string,
  region = "EUW",
  createdAt?: number | string,
  focusRiotId?: string
): Promise<DetailedParticipant[] | null> {
  try {
    let crStr: string | undefined = undefined;
    if (createdAt) {
      if (typeof createdAt === "number" || /^\d+$/.test(String(createdAt))) {
        crStr = new Date(Number(createdAt)).toISOString();
      } else {
        crStr = String(createdAt);
      }
    }
    const raw = await invoke<any>("get_match_detail", {
      gameId: matchId,
      game_id: matchId,
      region,
      createdAt: crStr,
      created_at: crStr,
      focusRiotId: focusRiotId,
      focus_riot_id: focusRiotId,
    });
    const participants = normalizeGameDetail(raw, focusRiotId);
    const bans = extractBansFromGameDetail(raw);
    if (participants.length > 0) {
      viewedMatches.update((matches) =>
        matches.map((m) =>
          m.id === matchId
            ? { ...m, participants, ...(bans.length > 0 ? { bans } : {}) }
            : m
        )
      );
      return participants;
    }
  } catch (err) {
    console.warn("Failed to load match detail:", err);
  }
  return null;
}
