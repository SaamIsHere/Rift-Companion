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
export const viewedProfileRefreshing = writable<boolean>(false);
export const viewedProfileError = writable<string | null>(null);
export const recentSearches = writable<RecentSearchItem[]>(getInitialRecentSearches());
export const lastSyncedAt = writable<number | null>(null);

/** Global search query across LandingPage and ProfileView */
export const activeSearchQuery = writable<string>("");
/** Indicates an intentional summoner search has taken place (prevents auto-reloading local profile) */
export const isExplicitSearch = writable<boolean>(false);

/** Auto-refresh time-to-live: 3 hours in milliseconds */
export const AUTO_REFRESH_TTL_MS = 3 * 60 * 60 * 1000;

// Automatically purge any cached profiles from localStorage so no data accumulates on the client PC
try {
  if (typeof localStorage !== "undefined") {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("rift_profile_")) {
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

export const MATCH_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

export function getLastRefreshTime(gn?: string, tl?: string, region = "EUW"): number | null {
  const inMemory = get(lastSyncedAt);
  const viewed = get(viewedProfile);
  if (viewed && (!gn || viewed.game_name.toLowerCase() === gn.toLowerCase())) {
    if (inMemory) return inMemory;
    if (viewed.updated_at) return viewed.updated_at;
  }
  return inMemory || viewed?.updated_at || null;
}

function prefetchRecentMatches(matches: PlayerMatch[], region: string, focusRiotId?: string) {
  if (!matches || matches.length === 0) return;
  setTimeout(() => {
    for (const m of matches.slice(0, 3)) {
      if (!m.participants || m.participants.length < 2) {
        loadMatchDetail(m.id, region, m.raw_created_at || m.game_creation, focusRiotId).catch(() => {});
      }
    }
  }, 1200);
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
    viewedProfileRefreshing.set(false);
    viewedProfileError.set(null);
    lastSyncedAt.set(null);
    return;
  }

  // Determine lookup key
  const gn = gameName || local?.game_name || local?.display_name.split("#")[0] || "Summoner";
  const tl = tagLine || local?.tag_line || local?.display_name.split("#")[1] || region;

  // 1. Check in-memory store if this summoner is already loaded
  let cachedData: { profile: FullPlayerProfile; matches: PlayerMatch[]; cached_at: number } | null = null;
  const currentViewed = get(viewedProfile);
  const currentMatches = get(viewedMatches);
  if (
    currentViewed &&
    currentViewed.game_name.toLowerCase() === gn.toLowerCase() &&
    (!tl || currentViewed.tag_line.toLowerCase() === tl.toLowerCase())
  ) {
    cachedData = {
      profile: currentViewed,
      matches: currentMatches || [],
      cached_at: get(lastSyncedAt) || currentViewed.updated_at || Date.now(),
    };
  }

  // 2. Query the central Rift Server (no local disk storage)
  if (!cachedData) {
    try {
      const serverCached = await invoke<any>("get_cached_player_profile", {
        gameName: gn,
        game_name: gn,
        tagLine: tl,
        tag_line: tl,
        region,
      });
      if (serverCached?.profile) {
        cachedData = {
          profile: serverCached.profile,
          matches: serverCached.matches || [],
          cached_at: serverCached.cached_at || Date.now(),
        };
      }
    } catch (err) {
      console.warn("Rift Server profile cache lookup:", err);
    }
  }

  // 3. Stale-While-Revalidate: If cached data exists, display it IMMEDIATELY! (0ms perception)
  if (cachedData) {
    viewedProfile.set(cachedData.profile);
    viewedMatches.set(cachedData.matches || []);
    if (cachedData.cached_at) {
      lastSyncedAt.set(cachedData.cached_at);
    }
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    viewedProfileError.set(null);
  } else {
    // Brand new lookup: clear previous player's stats to show loading skeletons/spinner
    viewedProfile.set(null);
    viewedMatches.set([]);
    viewedProfileLoading.set(true);
    viewedMatchesLoading.set(true);
    viewedProfileError.set(null);
  }

  const cacheAge = cachedData ? Date.now() - (cachedData.cached_at || 0) : Infinity;

  const isCacheMissingQueueStats =
    cachedData?.profile &&
    (!cachedData.profile.top_champions_solo || cachedData.profile.top_champions_solo.length === 0) &&
    (!cachedData.profile.top_champions_flex || cachedData.profile.top_champions_flex.length === 0) &&
    (Boolean(cachedData.profile.solo_rank) || Boolean(cachedData.profile.flex_rank));

  // If cached data was retrieved and is super fresh (< 90 seconds) and not a forced refresh, no need to re-query network
  const isSuperFresh = cacheAge < 90 * 1000;
  if (cachedData && !forceRefresh && isSuperFresh && !isCacheMissingQueueStats) {
    prefetchRecentMatches(cachedData.matches, region, cachedData.profile.display_name);
    return;
  }

  // 4. Background Revalidation / Fresh Network Fetch
  if (cachedData) {
    viewedProfileRefreshing.set(true);
  }

  try {
    const profileArgs: Record<string, any> = {
      region,
      gameName: gameName ? gn : undefined,
      game_name: gameName ? gn : undefined,
      tagLine: tagLine ? tl : undefined,
      tag_line: tagLine ? tl : undefined,
    };

    const matchesArgs: Record<string, any> = {
      region,
      limit: 20,
      gameName: gameName ? gn : undefined,
      game_name: gameName ? gn : undefined,
      tagLine: tagLine ? tl : undefined,
      tag_line: tagLine ? tl : undefined,
    };

    // Parallel execution: fetch profile and matches concurrently!
    const profilePromise = invoke<any>("get_player_profile", profileArgs);
    const matchesPromise = invoke<any>("get_player_matches", matchesArgs).catch((matchErr) => {
      console.warn("Failed to fetch matches in parallel:", matchErr);
      return null;
    });

    const [rawProfile, rawMatches] = await Promise.all([profilePromise, matchesPromise]);

    const targetGameName = rawProfile?.data?.summoner?.game_name || rawProfile?.summoner?.game_name || gn;
    const targetTagLine = rawProfile?.data?.summoner?.tagline || rawProfile?.summoner?.tag_line || tl;
    const targetRegion = rawProfile?.region || region;

    let normalizedMatches: PlayerMatch[] = [];
    if (rawMatches) {
      normalizedMatches = normalizeMatches(rawMatches, targetGameName);
    } else if (cachedData?.matches?.length) {
      normalizedMatches = cachedData.matches;
    }
    viewedMatches.set(normalizedMatches);
    viewedMatchesLoading.set(false);

    const normalizedProfile = normalizeProfile(rawProfile, targetRegion, normalizedMatches);
    viewedProfile.set(normalizedProfile);
    viewedProfileLoading.set(false);
    viewedProfileRefreshing.set(false);
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

    // Persist to central Rift Server (no profile files on local client disk)
    try {
      invoke("save_cached_player_profile", {
        gameName: normalizedProfile.game_name,
        game_name: normalizedProfile.game_name,
        tagLine: normalizedProfile.tag_line,
        tag_line: normalizedProfile.tag_line,
        region: targetRegion,
        profile: normalizedProfile,
        matches: normalizedMatches,
        cachedAt: now,
        cached_at: now,
      }).catch((err) => console.warn("Failed to save cached profile to disk/server:", err));
    } catch {}

    // Background prefetch match details for first 3 games
    prefetchRecentMatches(normalizedMatches, targetRegion, normalizedProfile.display_name);
  } catch (err: any) {
    console.warn("Failed to load player profile:", err);
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    viewedProfileRefreshing.set(false);
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
  // First check if viewedMatches already has participants for this match
  const currentMatches = get(viewedMatches);
  const existing = currentMatches.find((m) => m.id === matchId);
  if (existing?.participants && existing.participants.length >= 2) {
    return existing.participants;
  }

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

