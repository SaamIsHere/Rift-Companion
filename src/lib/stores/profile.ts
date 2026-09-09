import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { Summoner, FullPlayerProfile, PlayerMatch, DetailedParticipant } from "../types";
import { normalizeProfile, normalizeMatches, normalizeGameDetail } from "../utils/profileNormalizer";

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
    return;
  }

  viewedProfileLoading.set(true);
  viewedMatchesLoading.set(true);
  viewedProfileError.set(null);

  // Determine lookup key
  const isLocal =
    !gameName ||
    (local &&
      (gameName.toLowerCase() === local.display_name.toLowerCase() ||
        (local.game_name && gameName.toLowerCase() === local.game_name.toLowerCase())));
  const gn = gameName || local?.game_name || local?.display_name.split("#")[0] || "Summoner";
  const tl = tagLine || local?.tag_line || local?.display_name.split("#")[1] || region;
  const cacheKey = `rift_profile_cache_${region.toLowerCase()}_${gn.toLowerCase()}_${tl.toLowerCase()}`;

  // 1. Check local cache (SWR)
  let cachedData: { profile: FullPlayerProfile; matches: PlayerMatch[]; cached_at: number } | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        cachedData = JSON.parse(saved);
        if (cachedData?.profile) {
          viewedProfile.set(cachedData.profile);
          viewedMatches.set(cachedData.matches || []);
        }
      }
    }
  } catch {}

  const cacheAge = cachedData ? Date.now() - (cachedData.cached_at || 0) : Infinity;
  // If cache is fresh (< 2 mins) and not force refresh, stop loading early
  if (cachedData && cacheAge < 120_000 && !forceRefresh) {
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    return;
  }

  // 2. Fetch fresh data from backend
  try {
    const profileArgs: Record<string, any> = {
      region,
      game_name: gn,
      tag_line: tl,
    };

    const rawProfile = await invoke<any>("get_player_profile", profileArgs);

    // Fetch matches first so profile normalizer can compute real champion stats from match history
    const matchesArgs: Record<string, any> = {
      region,
      limit: 15,
      game_name: gn,
      tag_line: tl,
    };

    const rawMatches = await invoke<any>("get_player_matches", matchesArgs);
    const targetLookup = rawProfile?.summoner?.game_name || gn;
    const normalizedMatches = normalizeMatches(rawMatches, targetLookup);
    viewedMatches.set(normalizedMatches);
    viewedMatchesLoading.set(false);

    const normalizedProfile = normalizeProfile(rawProfile, region, normalizedMatches);
    viewedProfile.set(normalizedProfile);
    viewedProfileLoading.set(false);

    // Save recent search
    saveRecentSearch({
      riot_id: normalizedProfile.display_name,
      region,
      level: normalizedProfile.level,
      profile_icon_id: normalizedProfile.profile_icon_id,
      profile_icon_url: normalizedProfile.profile_icon_url,
      tier: normalizedProfile.solo_rank?.tier || normalizedProfile.flex_rank?.tier,
    });

    // Save to cache
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            profile: normalizedProfile,
            matches: normalizedMatches,
            cached_at: Date.now(),
          })
        );
      }
    } catch {}
  } catch (err: any) {
    console.warn("Failed to load player profile:", err);
    viewedProfileLoading.set(false);
    viewedMatchesLoading.set(false);
    if (!cachedData) {
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
      game_id: matchId,
      region,
      created_at: crStr,
      focus_riot_id: focusRiotId,
    });
    const participants = normalizeGameDetail(raw, focusRiotId);
    if (participants.length > 0) {
      viewedMatches.update((matches) =>
        matches.map((m) => (m.id === matchId ? { ...m, participants } : m))
      );
      return participants;
    }
  } catch (err) {
    console.warn("Failed to load match detail:", err);
  }
  return null;
}
