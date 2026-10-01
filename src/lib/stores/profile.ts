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

/** Cooldown before automatically re-fetching profile from network (5 minutes) */
export const PROFILE_CACHE_COOLDOWN_MS = 5 * 60 * 1000;

interface CachedProfileData {
  profile: FullPlayerProfile;
  matches: PlayerMatch[];
  cached_at: number;
}

const profileMemoryCache = new Map<string, CachedProfileData>();

function getProfileCacheKey(gameName: string, tagLine: string, region: string): string {
  return `${gameName.trim().toLowerCase()}#${tagLine.trim().toLowerCase()}@${region.trim().toUpperCase()}`;
}

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

let activeLoadRequestId = 0;

export async function loadPlayerProfile(
  gameName?: string,
  tagLine?: string,
  region = "EUW",
  forceRefresh = false
): Promise<void> {
  const requestId = ++activeLoadRequestId;

  let local = get(profile);
  if (!gameName && !local) {
    try {
      const fetched = await invoke<Summoner | null>("get_profile");
      if (requestId !== activeLoadRequestId) return;
      if (fetched) {
        profile.set(fetched);
        local = fetched;
      }
    } catch {}
  }

  if (requestId !== activeLoadRequestId) return;

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

  if (gn && (!get(activeSearchQuery) || !get(activeSearchQuery).toLowerCase().includes(gn.toLowerCase()))) {
    activeSearchQuery.set(`${gn}#${tl}`);
  }

  const cacheKey = getProfileCacheKey(gn, tl, region);

  // 1. Check local in-memory cache first (0ms)
  let cachedData: CachedProfileData | null = null;
  if (profileMemoryCache.has(cacheKey)) {
    cachedData = profileMemoryCache.get(cacheKey)!;
  } else {
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
      profileMemoryCache.set(cacheKey, cachedData);
    }
  }

  // 2. Query the central Rift Server (fast network cache, no local disk storage)
  if (!cachedData) {
    try {
      const serverCached = await invoke<any>("get_cached_player_profile", {
        gameName: gn,
        game_name: gn,
        tagLine: tl,
        tag_line: tl,
        region,
      });
      if (requestId !== activeLoadRequestId) return;
      if (serverCached?.profile) {
        cachedData = {
          profile: serverCached.profile,
          matches: serverCached.matches || [],
          cached_at: serverCached.cached_at || Date.now(),
        };
        profileMemoryCache.set(cacheKey, cachedData);
      }
    } catch (err) {
      if (requestId !== activeLoadRequestId) return;
      console.warn("Rift Server profile cache lookup:", err);
    }
  }

  if (requestId !== activeLoadRequestId) return;

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

  // 4. Auto-Refresh Cooldown: If cached data was retrieved (from local memory or Rift server)
  // and is newer than PROFILE_CACHE_COOLDOWN_MS (5 min), and the user didn't explicitly click "Refresh",
  // skip the automatic network fetch!
  if (cachedData && !forceRefresh && cacheAge < PROFILE_CACHE_COOLDOWN_MS) {
    viewedProfileRefreshing.set(false);
    prefetchRecentMatches(cachedData.matches, region, cachedData.profile.display_name);
    return;
  }

  // 5. Background Revalidation / Progressive Network Fetch
  if (cachedData) {
    viewedProfileRefreshing.set(true);
  }

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

  let latestProfile: FullPlayerProfile | null = cachedData?.profile || null;
  let latestMatches: PlayerMatch[] = cachedData?.matches || [];
  let targetRegion = region;
  let profileFinished = false;
  let matchesFinished = false;

  const persistToServerIfReady = () => {
    if (requestId !== activeLoadRequestId) return;
    if (latestProfile) {
      const now = Date.now();
      lastSyncedAt.set(now);
      profileMemoryCache.set(cacheKey, {
        profile: latestProfile,
        matches: latestMatches,
        cached_at: now,
      });
      try {
        invoke("save_cached_player_profile", {
          gameName: latestProfile.game_name,
          game_name: latestProfile.game_name,
          tagLine: latestProfile.tag_line,
          tag_line: latestProfile.tag_line,
          region: targetRegion,
          profile: latestProfile,
          matches: latestMatches,
          cachedAt: now,
          cached_at: now,
        }).catch((err) => console.warn("Failed to save cached profile to disk/server:", err));
      } catch {}
    }
  };

  // Progressive parallel execution: Profile header & ranks render as soon as get_player_profile completes!
  const profileTask = invoke<any>("get_player_profile", profileArgs)
    .then((rawProfile) => {
      if (requestId !== activeLoadRequestId) return;

      targetRegion = rawProfile?.region || region;
      const normalizedProfile = normalizeProfile(rawProfile, targetRegion, latestMatches);
      latestProfile = normalizedProfile;

      viewedProfile.set(normalizedProfile);
      viewedProfileLoading.set(false);
      viewedProfileRefreshing.set(false);
      viewedProfileError.set(null);

      // Save recent search immediately
      saveRecentSearch({
        riot_id: normalizedProfile.display_name,
        region: targetRegion,
        level: normalizedProfile.level,
        profile_icon_id: normalizedProfile.profile_icon_id,
        profile_icon_url: normalizedProfile.profile_icon_url,
        tier: normalizedProfile.solo_rank?.tier || normalizedProfile.flex_rank?.tier,
      });

      profileFinished = true;
      if (matchesFinished) {
        persistToServerIfReady();
      }
    })
    .catch((err: any) => {
      if (requestId !== activeLoadRequestId) return;
      console.warn("Failed to load player profile:", err);
      viewedProfileLoading.set(false);
      viewedProfileRefreshing.set(false);
      if (!cachedData) {
        viewedProfile.set(null);
        viewedMatches.set([]);
        viewedProfileError.set(err?.message || String(err));
      }
      profileFinished = true;
    });

  // Matches render as soon as get_player_matches completes!
  const matchesTask = invoke<any>("get_player_matches", matchesArgs)
    .then((rawMatches) => {
      if (requestId !== activeLoadRequestId) return;

      const targetGameName = latestProfile?.game_name || gn;
      if (rawMatches) {
        const fresh = normalizeMatches(rawMatches, targetGameName);
        const prevMatches = get(viewedMatches);
        const existingMap = new Map<string, { participants?: DetailedParticipant[]; bans?: number[] }>();

        for (const m of cachedData?.matches || []) {
          if (m.participants && m.participants.length >= 2) {
            existingMap.set(m.id, { participants: m.participants, bans: m.bans });
          }
        }
        for (const m of prevMatches) {
          if (m.participants && m.participants.length >= 2) {
            existingMap.set(m.id, { participants: m.participants, bans: m.bans });
          }
        }

        latestMatches = fresh.map((m) => {
          const prev = existingMap.get(m.id);
          if (prev && (!m.participants || m.participants.length < 2)) {
            return {
              ...m,
              participants: prev.participants,
              bans: prev.bans || m.bans,
            };
          }
          return m;
        });
      } else if (cachedData?.matches?.length) {
        latestMatches = cachedData.matches;
      }

      viewedMatches.set(latestMatches);
      viewedMatchesLoading.set(false);

      if (latestProfile) {
        prefetchRecentMatches(latestMatches, targetRegion, latestProfile.display_name);
      }

      matchesFinished = true;
      if (profileFinished) {
        persistToServerIfReady();
      }
    })
    .catch((matchErr: any) => {
      if (requestId !== activeLoadRequestId) return;
      console.warn("Failed to fetch matches in parallel:", matchErr);
      viewedMatchesLoading.set(false);
      matchesFinished = true;
      if (profileFinished) {
        persistToServerIfReady();
      }
    });

  await Promise.allSettled([profileTask, matchesTask]);
}

const pendingMatchDetails = new Map<string, Promise<DetailedParticipant[] | null>>();

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
    const isArena = (existing.queue_label || "").toLowerCase().includes("arena") ||
                    (existing.game_type || "").toLowerCase().includes("arena") ||
                    (existing.game_type || "").toLowerCase().includes("cherry");
    if (isArena && existing.participants.length > 4) {
      const distinct = new Set(
        existing.participants
          .map((p) => p.subteam_id || (p.team_id !== 100 && p.team_id !== 200 ? String(p.team_id) : undefined))
          .filter(Boolean)
      );
      if (distinct.size >= 3) {
        return existing.participants;
      }
      // If distinct < 3, it's stale 2-team Arena data! Re-fetch fresh below!
    } else {
      return existing.participants;
    }
  }

  const pendingKey = `${matchId}:${region}`;
  const existingPromise = pendingMatchDetails.get(pendingKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
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
  })().finally(() => {
    pendingMatchDetails.delete(pendingKey);
  });

  pendingMatchDetails.set(pendingKey, promise);
  return promise;
}

