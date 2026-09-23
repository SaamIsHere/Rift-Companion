<script lang="ts">
  import { onMount } from "svelte";
  import { connection } from "../stores/connection";
  import {
    profile,
    viewedProfile,
    viewedMatches,
    viewedProfileLoading,
    viewedMatchesLoading,
    viewedProfileError,
    recentSearches,
    lastSyncedAt,
    activeSearchQuery,
    isExplicitSearch,
    loadPlayerProfile,
    loadMatchDetail,
    removeRecentSearch,
    clearAllRecentSearches,
    type RecentSearchItem,
  } from "../stores/profile";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import {
    profileIconUrl,
    squareIconUrl,
    itemIconUrl,
    summonerSpellIconUrl,
    getRuneIconUrl,
    runeStyleIconUrl,
    tierMedalUrl,
    formatTimeAgo,
    formatDuration,
    loadRunesReforged,
  } from "../utils/ddragon";
  import { inferRegionFromTag } from "../utils/profileNormalizer";
  import type { PlayerMatch, ChampionPerformance, DetailedParticipant } from "../types";

  const REGIONS = [
    { code: "EUW", label: "Europe West (EUW)" },
    { code: "NA", label: "North America (NA)" },
    { code: "KR", label: "Korea (KR)" },
    { code: "EUNE", label: "Europe Nordic & East (EUNE)" },
    { code: "OCE", label: "Oceania (OCE)" },
    { code: "LAN", label: "Latin America North (LAN)" },
    { code: "LAS", label: "Latin America South (LAS)" },
    { code: "BR", label: "Brazil (BR)" },
    { code: "JP", label: "Japan (JP)" },
  ];

  let searchQuery = "";
  let selectedRegion = "EUW";
  let activeQueueFilter: "all" | "solo" | "flex" | "other" = "all";
  let championQueueFilter: "all" | "solo" | "flex" = "all";
  let showAllChampions = false;
  let expandedMatchIds = new Set<string>();
  let loadingMatchDetailIds = new Set<string>();
  let runesMap: Map<number, any> | null = null;
  let scrollContainer: HTMLDivElement | null = null;
  let searchInputEl: HTMLInputElement | null = null;
  let lastSyncedProfileName = "";
  let lastLoadedProfileKey = "";

  function resetExpandedMatches() {
    expandedMatchIds = new Set();
    loadingMatchDetailIds = new Set();
  }

  // Ensure all matches start collapsed whenever a new profile starts loading or the profile identity changes
  $: {
    const profileKey = $viewedProfile
      ? `${$viewedProfile.region || ""}:${$viewedProfile.game_name}#${$viewedProfile.tag_line}`
      : "";
    if (profileKey !== lastLoadedProfileKey) {
      lastLoadedProfileKey = profileKey;
      resetExpandedMatches();
    }
  }

  $: if ($viewedProfileLoading) {
    resetExpandedMatches();
  }

  $: if ($ddragonVersion) {
    loadRunesReforged($ddragonVersion).then((map) => {
      runesMap = map;
    });
  }

  onMount(() => {

    // If an explicit search was already initiated (e.g. from LandingPage) or profile is loading/loaded, do not overwrite!
    if ($isExplicitSearch || $viewedProfileLoading || $viewedProfile) {
      return;
    }

    // If local profile is already connected or remembered, load it automatically;
    // otherwise do not make a failing query so the search landing is displayed.
    if ($profile) {
      loadPlayerProfile(undefined, undefined, selectedRegion);
    }
  });

  // Automatically load profile once League client connects ONLY if no search was ever made and no profile is loaded
  $: if ($profile && !$viewedProfile && !$viewedProfileLoading && !$isExplicitSearch && !$viewedProfileError) {
    loadPlayerProfile(undefined, undefined, selectedRegion);
  }

  // Keep search bar in sync with loaded profile, but allow user to clear with ✕ button
  $: if ($viewedProfile && $viewedProfile.display_name !== lastSyncedProfileName) {
    lastSyncedProfileName = $viewedProfile.display_name;
    searchQuery = $viewedProfile.display_name;
    activeSearchQuery.set($viewedProfile.display_name);
    if ($viewedProfile.region) {
      selectedRegion = $viewedProfile.region;
    }
  }

  // Also sync searchQuery if activeSearchQuery was set from LandingPage before profile loaded
  $: if ($activeSearchQuery && $activeSearchQuery !== searchQuery && !$viewedProfile && !$viewedProfileLoading) {
    searchQuery = $activeSearchQuery;
  }

  function clearSearch() {
    searchQuery = "";
    activeSearchQuery.set("");
    if (searchInputEl) {
      searchInputEl.focus();
    }
  }

  function handleSearch(force = false) {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    resetExpandedMatches();
    isExplicitSearch.set(true);
    activeSearchQuery.set(trimmed);
    viewedProfileError.set(null);
    let gn = trimmed;
    let tl = selectedRegion;
    let targetRegion = selectedRegion;

    if (trimmed.includes("#")) {
      const parts = trimmed.split("#");
      gn = parts[0].trim();
      tl = parts[1].trim() || selectedRegion;
      const inferred = inferRegionFromTag(tl);
      if (inferred) {
        targetRegion = inferred;
        selectedRegion = inferred;
      }
    }

    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "auto" });
    }
    loadPlayerProfile(gn, tl, targetRegion, force);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      handleSearch(false);
    }
  }

  function selectRecent(item: RecentSearchItem) {
    resetExpandedMatches();
    isExplicitSearch.set(true);
    searchQuery = item.riot_id;
    activeSearchQuery.set(item.riot_id);
    selectedRegion = item.region;
    handleSearch(false);
  }

  function openPlayerProfile(p: DetailedParticipant) {
    let gn = (p.game_name || p.summoner_name || "").trim();
    let tl = (p.tag_line || "").trim();

    // Ignore placeholder names like "Player 1", "Player 2"
    if (!gn || /^Player\s+\d+$/i.test(gn)) return;

    if (gn.includes("#")) {
      const parts = gn.split("#");
      gn = parts[0].trim();
      tl = parts[1].trim() || tl;
    }

    if (!tl) {
      tl = selectedRegion;
    }

    // If clicking the profile currently being viewed, just smooth-scroll to top
    if (
      $viewedProfile &&
      $viewedProfile.game_name.toLowerCase() === gn.toLowerCase() &&
      (!$viewedProfile.tag_line || !tl || $viewedProfile.tag_line.toLowerCase() === tl.toLowerCase())
    ) {
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    resetExpandedMatches();
    isExplicitSearch.set(true);
    const fullQuery = `${gn}#${tl}`;
    searchQuery = fullQuery;
    activeSearchQuery.set(fullQuery);
    viewedProfileError.set(null);

    const inferred = inferRegionFromTag(tl);
    const targetRegion = inferred || selectedRegion;
    selectedRegion = targetRegion;

    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }

    loadPlayerProfile(gn, tl, targetRegion, false);
  }

  function returnToMyAccount() {
    resetExpandedMatches();
    isExplicitSearch.set(false);
    viewedProfileError.set(null);
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "auto" });
    }
    if ($profile) {
      searchQuery = $profile.display_name;
      activeSearchQuery.set($profile.display_name);
      const parts = $profile.display_name.split("#");
      const gn = parts[0];
      const tl = parts[1] || selectedRegion;
      loadPlayerProfile(gn, tl, selectedRegion, false);
    } else {
      searchQuery = "";
      activeSearchQuery.set("");
      loadPlayerProfile(undefined, undefined, selectedRegion, false);
    }
  }

  function handleManualRefresh() {
    resetExpandedMatches();
    if ($viewedProfile) {
      loadPlayerProfile($viewedProfile.game_name, $viewedProfile.tag_line, selectedRegion, true);
    } else {
      loadPlayerProfile(undefined, undefined, selectedRegion, true);
    }
  }

  function selectQueueFilter(filter: "all" | "solo" | "flex" | "other") {
    activeQueueFilter = filter;
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function toggleMatchDetails(match: PlayerMatch) {
    if (expandedMatchIds.has(match.id)) {
      expandedMatchIds.delete(match.id);
      expandedMatchIds = new Set(expandedMatchIds);
    } else {
      expandedMatchIds.add(match.id);
      expandedMatchIds = new Set(expandedMatchIds);

      // If match has fewer than 2 participants (e.g. OP.GG match list summary), fetch full game detail
      if (!match.participants || match.participants.length < 2) {
        loadingMatchDetailIds.add(match.id);
        loadingMatchDetailIds = new Set(loadingMatchDetailIds);
        try {
          await loadMatchDetail(
            match.id,
            selectedRegion,
            match.raw_created_at || match.game_creation,
            $viewedProfile?.display_name
          );
        } finally {
          loadingMatchDetailIds.delete(match.id);
          loadingMatchDetailIds = new Set(loadingMatchDetailIds);
        }
      }
    }
  }

  // Filtered matches
  $: filteredMatches = $viewedMatches.filter((m) => {
    if (activeQueueFilter === "all") return true;
    const label = m.queue_label.toLowerCase();
    if (activeQueueFilter === "solo") return label.includes("solo");
    if (activeQueueFilter === "flex") return label.includes("flex");
    if (activeQueueFilter === "other") return !label.includes("solo") && !label.includes("flex");
    return true;
  });

  function selectChampQueueFilter(filter: "all" | "solo" | "flex") {
    championQueueFilter = filter;
    showAllChampions = false;
  }

  function isSoloMatch(m: PlayerMatch): boolean {
    const label = (m.queue_label || "").toLowerCase();
    const type = (m.game_type || "").toLowerCase();
    return label.includes("solo") || type.includes("solo");
  }

  function isFlexMatch(m: PlayerMatch): boolean {
    const label = (m.queue_label || "").toLowerCase();
    const type = (m.game_type || "").toLowerCase();
    return label.includes("flex") || type.includes("flex");
  }

  function computeChampionsFromMatches(matchesList: PlayerMatch[]): ChampionPerformance[] {
    if (!matchesList.length) return [];

    const statsMap = new Map<number, {
      id: number;
      name: string;
      games: number;
      wins: number;
      losses: number;
      kills: number;
      deaths: number;
      assists: number;
      cs: number;
      duration: number;
    }>();

    const masteryMap = new Map<number, { level?: number; points?: number }>();
    if ($viewedProfile?.top_champions) {
      for (const c of $viewedProfile.top_champions) {
        if (c.mastery_level || c.mastery_points) {
          masteryMap.set(c.id, { level: c.mastery_level, points: c.mastery_points });
        }
      }
    }

    for (const m of matchesList) {
      if (!m.champion_id) continue;
      let entry = statsMap.get(m.champion_id);
      if (!entry) {
        const cInfo = getChampInfo(m.champion_id);
        entry = {
          id: m.champion_id,
          name: m.champion_name || cInfo.name || `Champion ${m.champion_id}`,
          games: 0,
          wins: 0,
          losses: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          cs: 0,
          duration: 0,
        };
        statsMap.set(m.champion_id, entry);
      }
      entry.games++;
      if (m.win) entry.wins++;
      else entry.losses++;
      entry.kills += m.kills;
      entry.deaths += m.deaths;
      entry.assists += m.assists;
      entry.cs += m.cs;
      entry.duration += m.game_duration;
    }

    return Array.from(statsMap.values())
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .map((entry) => {
        const kda =
          entry.deaths > 0
            ? (entry.kills + entry.assists) / entry.deaths
            : entry.kills + entry.assists;
        const mastery = masteryMap.get(entry.id);
        return {
          id: entry.id,
          name: entry.name,
          games: entry.games,
          wins: entry.wins,
          losses: entry.losses,
          win_rate: entry.games > 0 ? entry.wins / entry.games : 0,
          kills: entry.games > 0 ? Math.round((entry.kills / entry.games) * 10) / 10 : entry.kills,
          deaths: entry.games > 0 ? Math.round((entry.deaths / entry.games) * 10) / 10 : entry.deaths,
          assists: entry.games > 0 ? Math.round((entry.assists / entry.games) * 10) / 10 : entry.assists,
          kda: Math.round(kda * 100) / 100,
          cs: Math.round(entry.cs / entry.games),
          cs_per_min:
            entry.duration > 0
              ? Math.round((entry.cs / (entry.duration / 60)) * 10) / 10
              : 0,
          mastery_level: mastery?.level,
          mastery_points: mastery?.points,
        };
      });
  }

  $: soloMatches = $viewedMatches.filter(isSoloMatch);
  $: flexMatches = $viewedMatches.filter(isFlexMatch);

  $: displayedChampions = (() => {
    if (championQueueFilter === "all") {
      if ($viewedProfile?.top_champions && $viewedProfile.top_champions.length > 0) {
        return $viewedProfile.top_champions;
      }
      return computeChampionsFromMatches($viewedMatches);
    }

    if (championQueueFilter === "solo") {
      if ($viewedProfile?.top_champions_solo && $viewedProfile.top_champions_solo.length > 0) {
        return $viewedProfile.top_champions_solo;
      }
      const fromSoloMatches = computeChampionsFromMatches(soloMatches);
      if (fromSoloMatches.length > 0) {
        return fromSoloMatches;
      }
      if (
        $viewedProfile?.solo_rank &&
        (!$viewedProfile.flex_rank || ($viewedProfile.flex_rank.wins + $viewedProfile.flex_rank.losses === 0)) &&
        $viewedProfile.top_champions &&
        $viewedProfile.top_champions.length > 0
      ) {
        return $viewedProfile.top_champions;
      }
      return [];
    }

    if (championQueueFilter === "flex") {
      if ($viewedProfile?.top_champions_flex && $viewedProfile.top_champions_flex.length > 0) {
        return $viewedProfile.top_champions_flex;
      }
      const fromFlexMatches = computeChampionsFromMatches(flexMatches);
      if (fromFlexMatches.length > 0) {
        return fromFlexMatches;
      }
      if (
        $viewedProfile?.flex_rank &&
        (!$viewedProfile.solo_rank || ($viewedProfile.solo_rank.wins + $viewedProfile.solo_rank.losses === 0)) &&
        $viewedProfile.top_champions &&
        $viewedProfile.top_champions.length > 0
      ) {
        return $viewedProfile.top_champions;
      }
      return [];
    }


    return [];
  })();

  // Recent 20 summary metrics
  $: recentStats = (() => {
    const matches = $viewedMatches;
    if (!matches.length) return null;
    let wins = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    for (const m of matches) {
      if (m.win) wins++;
      kills += m.kills;
      deaths += m.deaths;
      assists += m.assists;
    }
    const count = matches.length;
    const winrate = Math.round((wins / count) * 1000) / 10;
    const avgK = Math.round((kills / count) * 10) / 10;
    const avgD = Math.round((deaths / count) * 10) / 10;
    const avgA = Math.round((assists / count) * 10) / 10;
    const kdaRatio = deaths > 0 ? Math.round(((kills + assists) / deaths) * 100) / 100 : kills + assists;
    return {
      count,
      wins,
      losses: count - wins,
      winrate,
      avgK,
      avgD,
      avgA,
      kdaRatio,
    };
  })();

  function getChampInfo(champId: number) {
    const info = $championCatalog.get(champId);
    if (info) return info;
    return { id: champId, key: String(champId), name: `Champion ${champId}` };
  }

  function formatPct(val?: number | null): string {
    if (val == null || isNaN(val)) return "0.00%";
    return (val * 100).toFixed(2) + "%";
  }

  function getKdaColor(kda: number): string {
    if (kda >= 4.5) return "text-amber-300 font-black";
    if (kda >= 3.0) return "text-emerald-400 font-extrabold";
    if (kda >= 2.0) return "text-cyan-300 font-bold";
    return "text-slate-300 font-medium";
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden select-none text-slate-100">
  <!-- SEARCH BAR & ACCOUNT ACTIONS TOP HEADER -->
  <header class="z-30 shrink-0 border-b border-purple-500/20 bg-void-950/60 px-6 py-3 shadow-md backdrop-blur-md">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- Search Form -->
      <div class="flex flex-1 items-center gap-2 min-w-[300px] max-w-2xl">
        <!-- Region Picker -->
        <select
          bind:value={selectedRegion}
          class="rounded-xl border border-purple-500/30 bg-purple-950/50 px-3 py-2 text-xs font-bold text-purple-200 outline-none transition focus:border-purple-400 cursor-pointer"
        >
          {#each REGIONS as reg}
            <option value={reg.code} class="bg-[#120a26] text-white">{reg.code}</option>
          {/each}
        </select>

        <!-- Search Input -->
        <div class="relative flex-1">
          <input
            bind:this={searchInputEl}
            type="text"
            bind:value={searchQuery}
            on:keydown={handleKeyDown}
            placeholder="Search summoner (e.g. Agurin#EUW, Faker#KR1)..."
            class="w-full rounded-xl border border-purple-500/30 bg-purple-950/40 pl-4 pr-9 py-2 text-xs font-semibold text-white placeholder-purple-300/40 outline-none transition focus:border-purple-400 focus:bg-purple-950/60 focus:ring-1 focus:ring-purple-400/40"
          />
          {#if searchQuery}
            <button
              type="button"
              on:click={clearSearch}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-purple-400/60 transition hover:bg-purple-800/40 hover:text-white"
              title="Clear search"
            >
              ✕
            </button>
          {/if}
        </div>

        <!-- Search Button -->
        <button
          type="button"
          on:click={() => handleSearch(false)}
          disabled={$viewedProfileLoading}
          class="inline-flex items-center gap-1.5 rounded-xl border border-purple-400/40 bg-purple-600/30 px-4 py-2 text-xs font-bold text-white transition hover:bg-purple-600/50 shadow-sm active:scale-95 disabled:opacity-50"
        >
          {#if $viewedProfileLoading}
            <div class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            <span>Searching…</span>
          {:else}
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>Search</span>
          {/if}
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        {#if $profile && $viewedProfile && $viewedProfile.display_name.toLowerCase() !== $profile.display_name.toLowerCase()}
          <button
            type="button"
            on:click={returnToMyAccount}
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-900/40 active:scale-95"
            title="Return to connected / remembered local account"
          >
            <span>★</span>
            <span>My Account</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- Recent Searches Chips -->
    {#if $recentSearches.length > 0}
      <div class="mt-2.5 flex flex-wrap items-center gap-2 border-t border-purple-500/15 pt-2">
        <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300/60">Recent:</span>
        {#each $recentSearches as recent}
          <div
            class="group inline-flex items-center rounded-lg border border-purple-500/20 bg-purple-950/30 text-[11px] font-semibold text-purple-200 transition hover:border-purple-400/40 hover:bg-purple-900/40"
          >
            <button
              type="button"
              on:click={() => selectRecent(recent)}
              class="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 hover:text-white"
            >
              {#if recent.tier}
                <img src={tierMedalUrl(recent.tier)} alt="Rank" class="h-3.5 w-3.5 object-contain" />
              {/if}
              <span>{recent.riot_id}</span>
              <span class="rounded bg-purple-900/50 px-1 text-[9px] text-purple-300/70">{recent.region}</span>
            </button>
            <button
              type="button"
              on:click|stopPropagation={() => removeRecentSearch(recent.riot_id, recent.region)}
              class="flex items-center justify-center p-1 pr-2 text-purple-400/40 transition hover:text-rose-400"
              title="Aus Verlauf entfernen"
              aria-label="Remove search"
            >
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
        {#if $recentSearches.length > 1}
          <button
            type="button"
            on:click={clearAllRecentSearches}
            class="ml-1 text-[10px] text-purple-400/50 underline underline-offset-2 transition hover:text-rose-400"
            title="Alle kürzlich gesuchten Profile löschen"
          >
            Clear all
          </button>
        {/if}
      </div>
    {/if}
  </header>

  <!-- SCROLLABLE BODY FOR PROFILE & MATCHES -->
  <div
    bind:this={scrollContainer}
    class="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 scroll-smooth"
  >
    <!-- PROFILE HEADER CARD -->
    {#if $viewedProfileError && $viewedProfile}
      <div class="mb-4 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-2.5 text-xs font-semibold text-rose-300 shadow-md">
        <div class="flex items-center gap-2">
          <span>⚠️</span>
          <span>{$viewedProfileError}</span>
        </div>
        <button
          type="button"
          on:click={() => viewedProfileError.set(null)}
          class="rounded p-1 text-rose-400 hover:text-white"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    {/if}

    {#if $viewedProfileLoading && !$viewedProfile}
      <div class="glass flex min-h-[400px] flex-col items-center justify-center rounded-2xl p-8 text-center">
        <div class="relative flex h-16 w-16 items-center justify-center">
          <div class="absolute h-16 w-16 animate-ping rounded-full bg-purple-600/20"></div>
          <div class="h-10 w-10 animate-spin rounded-full border-2 border-purple-400 border-t-transparent"></div>
        </div>
        <h2 class="mt-5 text-lg font-black tracking-wide text-white">Loading Summoner Profile…</h2>
        <p class="mt-2 max-w-sm text-xs text-purple-300/70">
          Querying OP.GG and compiling match history, rankings, and champion statistics…
        </p>
      </div>
    {:else if $viewedProfileError && !$viewedProfile}
      <div class="glass flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-rose-500/30 p-8 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-950/40 text-2xl text-rose-400 shadow-md">
          ⚠️
        </div>
        <h2 class="mt-4 text-lg font-black text-white">Summoner Not Found</h2>
        <p class="mt-2 max-w-md text-xs font-semibold text-rose-300/80">
          {$viewedProfileError}
        </p>
        <div class="mt-5 max-w-md rounded-xl border border-purple-500/20 bg-purple-950/30 p-4 text-left text-xs text-purple-300/80 space-y-1.5">
          <p class="font-bold text-purple-200">Tips for searching:</p>
          <p>• Include the tagline (e.g. <span class="font-mono font-bold text-white">Agurin#EUW</span> or <span class="font-mono font-bold text-white">Hide on bush#KR1</span>).</p>
          <p>• Make sure the selected region matches the player's server.</p>
          <p>• Pro players and streamers (e.g. <span class="font-mono font-bold text-purple-200">Agurin</span>, <span class="font-mono font-bold text-purple-200">Faker</span>, <span class="font-mono font-bold text-purple-200">Caps</span>, <span class="font-mono font-bold text-purple-200">Noway</span>) are automatically resolved to their official Riot IDs.</p>
        </div>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            on:click={() => handleSearch(true)}
            class="inline-flex items-center gap-2 rounded-xl border border-purple-400/40 bg-purple-600/40 px-4 py-2 text-xs font-bold text-white transition hover:bg-purple-600/60 shadow-sm active:scale-95"
          >
            <span>↻</span>
            <span>Try Again</span>
          </button>
          {#if $profile}
            <button
              type="button"
              on:click={returnToMyAccount}
              class="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-900/50 active:scale-95"
            >
              <span>★</span>
              <span>Return to My Account</span>
            </button>
          {/if}
        </div>
      </div>
    {:else if $viewedProfile}
      <div class="relative shrink-0 block glass mb-5 min-h-[150px] overflow-hidden rounded-2xl p-6">
      <!-- Ambient background decoration -->
      <div class="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-purple-600/10 blur-3xl"></div>
      <div class="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl"></div>

      <div class="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <!-- Identity -->
        <div class="flex items-center gap-4">
          <!-- Icon with level badge -->
          <div class="relative shrink-0">
            <img
              src={$viewedProfile.profile_icon_url ||
                profileIconUrl($viewedProfile.profile_icon_id || 1, $ddragonVersion)}
              alt="Summoner Icon"
              class="h-20 w-20 rounded-2xl border-2 border-purple-500/40 object-cover shadow-md"
            />
            <span class="absolute -bottom-2 -right-2 rounded-lg border border-purple-400/50 bg-purple-950/90 px-2 py-0.5 text-[10px] font-black text-purple-200 shadow-md">
              {$viewedProfile.level}
            </span>
          </div>

          <!-- Name, Tag, Region & Status -->
          <div>
            <div class="flex items-center gap-2.5">
              <h1 class="text-2xl font-black text-white tracking-wide">
                {$viewedProfile.game_name}
              </h1>
              <span class="text-lg font-bold text-purple-300/60">
                #{$viewedProfile.tag_line}
              </span>
              <span class="rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-300">
                {$viewedProfile.region}
              </span>
            </div>

            <!-- Status & Sync info -->
            <div class="mt-2 flex flex-wrap items-center gap-2.5">
              <span
                class="text-[10px] text-slate-400"
                title="Last synchronized: {new Date($lastSyncedAt || $viewedProfile.updated_at || Date.now()).toLocaleTimeString()} (auto-refreshes every 3 hours)"
              >
                Updated {formatTimeAgo($lastSyncedAt || $viewedProfile.updated_at)}
              </span>

              <!-- Refresh button directly to the right of the Update-Timer -->
              <button
                type="button"
                on:click={handleManualRefresh}
                disabled={$viewedProfileLoading}
                class="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-950/40 px-2.5 py-0.5 text-[10px] font-bold text-purple-200 transition hover:border-purple-400/60 hover:bg-purple-900/50 hover:text-white active:scale-95 disabled:opacity-50"
                title="Force fresh data sync (Auto-refreshes every 3 hours)"
              >
                <span class="text-xs {$viewedProfileLoading ? 'animate-spin' : ''}">↻</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Ranked Emblems (Solo & Flex) -->
        <div class="flex flex-wrap items-center gap-4">
          <!-- Ranked Solo/Duo Card -->
          <div class="glass-soft flex min-w-[200px] items-center gap-3.5 rounded-xl border border-purple-500/20 bg-purple-950/30 p-3.5">
            <img
              src={tierMedalUrl($viewedProfile.solo_rank?.tier || "UNRANKED")}
              alt="Solo Rank"
              class="h-14 w-14 object-contain"
            />
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70 block">
                Ranked Solo
              </span>
              {#if $viewedProfile.solo_rank}
                <span class="text-sm font-black text-white block">
                  {$viewedProfile.solo_rank.tier} {$viewedProfile.solo_rank.division}
                </span>
                <span class="text-xs font-bold text-purple-300 block">
                  {$viewedProfile.solo_rank.league_points} LP
                </span>
                <span class="text-[10px] font-semibold text-slate-400 block">
                  {$viewedProfile.solo_rank.wins}W {$viewedProfile.solo_rank.losses}L ({formatPct($viewedProfile.solo_rank.win_rate)})
                </span>
              {:else}
                <span class="text-sm font-bold text-slate-400 block">Unranked</span>
                <span class="text-[10px] text-slate-500 block">No games played</span>
              {/if}
            </div>
          </div>

          <!-- Ranked Flex Card -->
          <div class="glass-soft flex min-w-[200px] items-center gap-3.5 rounded-xl border border-purple-500/20 bg-purple-950/30 p-3.5">
            <img
              src={tierMedalUrl($viewedProfile.flex_rank?.tier || "UNRANKED")}
              alt="Flex Rank"
              class="h-14 w-14 object-contain"
            />
            <div>
              <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70 block">
                Ranked Flex
              </span>
              {#if $viewedProfile.flex_rank}
                <span class="text-sm font-black text-white block">
                  {$viewedProfile.flex_rank.tier} {$viewedProfile.flex_rank.division}
                </span>
                <span class="text-xs font-bold text-purple-300 block">
                  {$viewedProfile.flex_rank.league_points} LP
                </span>
                <span class="text-[10px] font-semibold text-slate-400 block">
                  {$viewedProfile.flex_rank.wins}W {$viewedProfile.flex_rank.losses}L ({formatPct($viewedProfile.flex_rank.win_rate)})
                </span>
              {:else}
                <span class="text-sm font-bold text-slate-400 block">Unranked</span>
                <span class="text-[10px] text-slate-500 block">No games played</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  {:else if $viewedProfileLoading}
    <div class="glass mb-5 flex h-48 flex-col items-center justify-center rounded-2xl p-6">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
      <p class="mt-3 text-xs font-semibold text-purple-300/80">Loading summoner profile…</p>
    </div>
  {:else if $viewedProfileError}
    <div class="glass mb-5 rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-center">
      <span class="text-2xl">⚠️</span>
      <h2 class="mt-2 text-base font-bold text-rose-300">Summoner Lookup</h2>
      <p class="mt-1 text-xs text-rose-200/70">{$viewedProfileError}</p>
      {#if $profile}
        <button
          type="button"
          on:click={returnToMyAccount}
          class="mt-4 rounded-xl border border-purple-500/30 bg-purple-900/40 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-purple-800/50"
        >
          Return to My Account
        </button>
      {/if}
    </div>
  {:else}
    <!-- WELCOME & SEARCH HERO LANDING -->
    <div class="glass my-auto flex flex-col items-center justify-center rounded-2xl p-10 text-center">
      <div class="relative mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-purple-500/40 bg-purple-950/40 shadow-md">
        <svg class="h-10 w-10 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>

      <h2 class="text-xl font-black tracking-wide text-white">
        Summoner Lookup & Match History
      </h2>
      <p class="mt-2 max-w-md text-xs font-medium text-purple-200/70">
        Search for any summoner by Riot ID (e.g. <span class="font-bold text-purple-200">Faker#KR1</span>, <span class="font-bold text-purple-200">Caps#EUW</span>, <span class="font-bold text-purple-200">Agurin#EUW2</span>) across all regions, or launch the League of Legends client to view your personal live stats.
      </p>

      <!-- Quick Search Suggestions -->
      <div class="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-lg">
        <span class="text-[11px] font-bold uppercase tracking-wider text-purple-300/60 block w-full mb-1">
          Popular Lookups:
        </span>
        <button
          type="button"
          on:click={() => { searchQuery = "Faker#KR1"; selectedRegion = "KR"; handleSearch(); }}
          class="rounded-xl border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:border-purple-400/50 hover:bg-purple-900/50 hover:text-white"
        >
          🇰🇷 Faker#KR1
        </button>
        <button
          type="button"
          on:click={() => { searchQuery = "Caps"; selectedRegion = "EUW"; handleSearch(); }}
          class="rounded-xl border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:border-purple-400/50 hover:bg-purple-900/50 hover:text-white"
        >
          🇪🇺 Caps (EUW)
        </button>
        <button
          type="button"
          on:click={() => { searchQuery = "Agurin"; selectedRegion = "EUW"; handleSearch(); }}
          class="rounded-xl border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:border-purple-400/50 hover:bg-purple-900/50 hover:text-white"
        >
          🇩🇪 Agurin (EUW)
        </button>
        <button
          type="button"
          on:click={() => { searchQuery = "Chovy#KR1"; selectedRegion = "KR"; handleSearch(); }}
          class="rounded-xl border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:border-purple-400/50 hover:bg-purple-900/50 hover:text-white"
        >
          🇰🇷 Chovy#KR1
        </button>
      </div>

      {#if $profile}
        <button
          type="button"
          on:click={returnToMyAccount}
          class="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-5 py-2.5 text-xs font-black text-emerald-300 transition hover:bg-emerald-900/50 shadow-sm active:scale-95"
        >
          <span>★</span>
          <span>View My Account ({$profile.display_name})</span>
        </button>
      {/if}
    </div>
  {/if}

  {#if $viewedProfile}
  <!-- MAIN CONTENT LAYOUT (TWO COLUMNS) -->
  <div class="grid grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)] gap-5 shrink-0 items-start">
    <!-- LEFT COLUMN: RECENT METRICS & TOP CHAMPIONS -->
    <div class="w-full lg:max-w-[310px] flex flex-col gap-5">
      <!-- CARD: RECENT PERFORMANCE SUMMARY -->
      {#if recentStats}
        <div class="glass rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xs font-bold uppercase tracking-wider text-purple-200">
              Recent Games
            </h2>
            <span class="rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-0.5 text-[10px] font-bold text-purple-300">
              Last {recentStats.count} Games
            </span>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <!-- Winrate box -->
            <div class="rounded-xl border border-purple-500/15 bg-purple-950/30 p-3 text-center">
              <span class="text-[10px] uppercase font-bold text-purple-300/70 block">Recent Winrate</span>
              <span class="text-xl font-black text-white block mt-0.5">
                {recentStats.winrate}%
              </span>
              <span class="text-[10px] font-semibold text-slate-400 block mt-0.5">
                <span class="text-emerald-400 font-bold">{recentStats.wins}W</span>
                <span class="text-rose-400 font-bold">{recentStats.losses}L</span>
              </span>
            </div>

            <!-- KDA Ratio box -->
            <div class="rounded-xl border border-purple-500/15 bg-purple-950/30 p-3 text-center">
              <span class="text-[10px] uppercase font-bold text-purple-300/70 block">Avg KDA</span>
              <span class="text-xl {getKdaColor(recentStats.kdaRatio)} block mt-0.5">
                {recentStats.kdaRatio}:1
              </span>
              <span class="text-[10px] font-semibold text-slate-400 block mt-0.5">
                {recentStats.avgK} / <span class="text-rose-400">{recentStats.avgD}</span> / {recentStats.avgA}
              </span>
            </div>
          </div>
        </div>
      {/if}

      <!-- CARD: TOP CHAMPIONS -->
      <div class="glass rounded-2xl p-4">
        <h2 class="text-xs font-bold uppercase tracking-wider text-purple-200 mb-3">
          Most Played Champions
        </h2>

        <!-- QUEUE FILTER BUTTONS (All, Solo/Duo, Flex) -->
        <div class="mb-3.5 flex items-center rounded-xl border border-purple-500/20 bg-purple-950/40 p-1">
          <button
            type="button"
            on:click={() => selectChampQueueFilter("all")}
            class="flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition {championQueueFilter === 'all'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-900/40 hover:text-white'}"
          >
            All
          </button>
          <button
            type="button"
            on:click={() => selectChampQueueFilter("solo")}
            class="flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition {championQueueFilter === 'solo'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-900/40 hover:text-white'}"
          >
            Solo/Duo
          </button>
          <button
            type="button"
            on:click={() => selectChampQueueFilter("flex")}
            class="flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition {championQueueFilter === 'flex'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-900/40 hover:text-white'}"
          >
            Flex
          </button>
        </div>

        {#if displayedChampions && displayedChampions.length > 0}
          <div class="flex flex-col gap-2">
            {#each (showAllChampions ? displayedChampions : displayedChampions.slice(0, 7)) as champ, cIdx (`champ-${championQueueFilter}-${champ.id}-${cIdx}`)}
              {@const champInfo = getChampInfo(champ.id)}
              <div class="flex items-center justify-between rounded-xl border border-purple-500/15 bg-purple-950/25 p-2 transition hover:bg-purple-900/30">
                <!-- Champion Icon & Name -->
                <div class="flex items-center gap-2 min-w-0 pr-1.5">
                  <img
                    src={squareIconUrl(champInfo.key, $ddragonVersion)}
                    alt={champ.name}
                    class="h-8.5 w-8.5 rounded-lg border border-purple-500/30 object-cover bg-black shrink-0"
                  />
                  <div class="min-w-0">
                    <span class="text-xs font-bold text-white truncate block" title={champInfo.name || champ.name}>
                      {champInfo.name || champ.name}
                    </span>
                    {#if champ.games > 0}
                      <span class="text-[10px] font-semibold text-slate-400 block truncate">
                        {champ.games} {champ.games === 1 ? "Game" : "Games"}
                        {#if champ.mastery_points}
                          · <span class="text-purple-300 font-bold">{(champ.mastery_points / 1000).toFixed(1)}k</span>
                        {/if}
                      </span>
                    {:else if champ.mastery_points}
                      <span class="text-[10px] font-bold text-purple-300 block truncate">
                        Mastery Lv. {champ.mastery_level || 7} · {(champ.mastery_points / 1000).toFixed(1)}k
                      </span>
                    {:else}
                      <span class="text-[10px] text-slate-500 block">No recent games</span>
                    {/if}
                  </div>
                </div>

                <!-- Stats -->
                <div class="text-right shrink-0">
                  {#if champ.games > 0}
                    <div class="flex items-center gap-1.5">
                      <div class="text-right">
                        <span class="text-xs font-bold text-white block">
                          {formatPct(champ.win_rate)}
                        </span>
                        <span class="text-[9px] font-semibold text-slate-400 block">
                          {champ.wins}W {champ.losses}L
                        </span>
                      </div>
                      <div class="w-12 border-l border-purple-500/20 pl-1.5 text-right">
                        <span class="text-xs {getKdaColor(champ.kda)} block">
                          {champ.kda.toFixed(2)}:1
                        </span>
                        <span class="text-[9px] text-slate-400 block">KDA</span>
                      </div>
                    </div>
                  {:else}
                    <div class="rounded border border-purple-500/20 bg-purple-950/30 px-2 py-0.5 text-[10px] font-semibold text-purple-300/80">
                      Top Mastery
                    </div>
                  {/if}
                </div>
              </div>
            {/each}

            {#if displayedChampions.length > 7}
              <button
                type="button"
                on:click={() => (showAllChampions = !showAllChampions)}
                class="mt-1 w-full rounded-lg border border-purple-500/20 bg-purple-950/40 py-1.5 text-center text-xs font-semibold text-purple-300 hover:bg-purple-900/40 hover:text-white transition"
              >
                {showAllChampions ? "Show less" : `Show all (${displayedChampions.length} champions)`}
              </button>
            {/if}
          </div>
        {:else if $viewedProfileLoading || $viewedMatchesLoading}
          <div class="flex h-36 flex-col items-center justify-center gap-2">
            <div class="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
            <p class="text-[11px] text-purple-300/70">Loading champions…</p>
          </div>
        {:else}
          <div class="rounded-xl border border-purple-500/15 bg-purple-950/20 p-5 text-center">
            <div class="text-xl mb-1 text-purple-300/50">🛡️</div>
            <p class="text-xs font-semibold text-slate-300">
              {#if championQueueFilter === "solo"}
                No Ranked Solo/Duo games found
              {:else if championQueueFilter === "flex"}
                No Ranked Flex games found
              {:else}
                No champion statistics recorded
              {/if}
            </p>
            <p class="mt-1 text-[10px] text-purple-300/60">
              {#if championQueueFilter === "solo"}
                No games recorded for Ranked Solo/Duo this season.
              {:else if championQueueFilter === "flex"}
                No games recorded for Ranked Flex this season.
              {:else}
                No matches or champion data available for this profile.
              {/if}
            </p>

          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT COLUMN: MATCH HISTORY FEED -->
    <div class="w-full min-w-0 flex flex-col gap-4">
      <!-- FILTER TABS & MATCH COUNT -->
      <div class="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            on:click={() => selectQueueFilter("all")}
            class="rounded-xl px-3 py-1.5 text-xs font-bold transition {activeQueueFilter === 'all'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-950/50 hover:text-white'}"
          >
            All Matches
          </button>
          <button
            type="button"
            on:click={() => selectQueueFilter("solo")}
            class="rounded-xl px-3 py-1.5 text-xs font-bold transition {activeQueueFilter === 'solo'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-950/50 hover:text-white'}"
          >
            Ranked Solo
          </button>
          <button
            type="button"
            on:click={() => selectQueueFilter("flex")}
            class="rounded-xl px-3 py-1.5 text-xs font-bold transition {activeQueueFilter === 'flex'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-950/50 hover:text-white'}"
          >
            Ranked Flex
          </button>
          <button
            type="button"
            on:click={() => selectQueueFilter("other")}
            class="rounded-xl px-3 py-1.5 text-xs font-bold transition {activeQueueFilter === 'other'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300/70 hover:bg-purple-950/50 hover:text-white'}"
          >
            ARAM & Normals
          </button>
        </div>

        <span class="text-xs font-semibold text-slate-400">
          Showing {filteredMatches.length} Matches
        </span>
      </div>

      <!-- MATCHES FEED LIST -->
      {#if $viewedMatchesLoading && !$viewedMatches.length}
        <div class="glass flex h-64 flex-col items-center justify-center rounded-2xl p-6">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
          <p class="mt-3 text-xs font-semibold text-purple-300/80">Loading recent match history…</p>
        </div>
      {:else if filteredMatches.length > 0}
        <div class="flex flex-col gap-3">
          {#each filteredMatches as match (match.id)}
            {@const isWin = match.win}
            {@const isRemake = match.is_remake}
            {@const champInfo = getChampInfo(match.champion_id)}
            {@const isExpanded = expandedMatchIds.has(match.id)}

            <!-- MATCH CARD CONTAINER -->
            <div
              class="glass group relative overflow-hidden rounded-2xl border transition-all duration-200 {isRemake
                ? 'border-slate-500/25 bg-void-950/30 hover:border-slate-500/40'
                : isWin
                  ? 'border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/50 hover:bg-emerald-950/30'
                  : 'border-rose-500/30 bg-rose-950/20 hover:border-rose-500/50 hover:bg-rose-950/30'}"
            >
              <!-- Colored left bar strip -->
              <div
                class="absolute left-0 top-0 bottom-0 w-1.5 {isRemake
                  ? 'bg-slate-400'
                  : isWin
                    ? 'bg-emerald-400'
                    : 'bg-rose-500'}"
              ></div>

              <!-- CARD MAIN ROW -->
              <div class="flex flex-wrap items-center justify-between gap-3 sm:gap-4 py-2.5 px-3.5 pl-4 sm:py-3 sm:px-4 sm:pl-4.5">
                <!-- 1. Match Outcome & Queue Info -->
                <div class="w-24 sm:w-28 shrink-0">
                  <span
                    class="text-xs sm:text-sm font-black uppercase tracking-wider block {isRemake
                      ? 'text-slate-300'
                      : isWin
                        ? 'text-emerald-400'
                        : 'text-rose-400'}"
                  >
                    {isRemake ? "Remake" : isWin ? "Victory" : "Defeat"}
                  </span>
                  <span class="text-xs font-bold text-white block mt-0.5 truncate" title={match.queue_label}>
                    {match.queue_label}
                  </span>
                  <span class="text-[11px] text-slate-400 block mt-0.5">
                    {formatTimeAgo(match.game_creation)}
                  </span>
                  <span class="text-[11px] font-semibold text-purple-300/80 block mt-0.5">
                    {formatDuration(match.game_duration)}
                  </span>
                </div>

                <!-- 2. Champion Portrait, Spells & Runes -->
                <div class="flex items-center gap-2.5">
                  <!-- Champion Avatar -->
                  <div class="relative">
                    <img
                      src={squareIconUrl(champInfo.key, $ddragonVersion)}
                      alt={champInfo.name}
                      class="h-11 w-11 rounded-lg border border-purple-500/30 object-cover bg-black"
                    />
                    <span class="absolute -bottom-1 -right-1 rounded bg-void-950/80 border border-purple-400/40 px-1 text-[9px] font-black text-purple-200">
                      {match.champion_level}
                    </span>
                  </div>

                  <!-- Summoner Spells & Runes: Left column for Spells, Right column for Runes -->
                  <div class="flex items-center gap-1 shrink-0">
                    <!-- Spells Column: Spell 1 on top, Spell 2 underneath -->
                    <div class="flex flex-col gap-1">
                      {#if match.spells[0]}
                        <img
                          src={summonerSpellIconUrl(match.spells[0], $ddragonVersion)}
                          alt="Spell 1"
                          class="h-5 w-5 rounded border border-purple-500/30 object-cover bg-black"
                        />
                      {:else}
                        <div class="h-5 w-5 rounded border border-purple-500/20 bg-purple-950/40"></div>
                      {/if}
                      {#if match.spells[1]}
                        <img
                          src={summonerSpellIconUrl(match.spells[1], $ddragonVersion)}
                          alt="Spell 2"
                          class="h-5 w-5 rounded border border-purple-500/30 object-cover bg-black"
                        />
                      {:else}
                        <div class="h-5 w-5 rounded border border-purple-500/20 bg-purple-950/40"></div>
                      {/if}
                    </div>

                    <!-- Runes Column: Main Rune on top, Secondary Rune Page underneath -->
                    <div class="flex flex-col gap-1">
                      {#if match.primary_rune_id}
                        <img
                          src={getRuneIconUrl(match.primary_rune_id, runesMap)}
                          alt="Keystone"
                          class="h-5 w-5 rounded-full border border-purple-500/30 object-contain bg-black/80"
                        />
                      {:else}
                        <div class="h-5 w-5 rounded-full border border-purple-500/20 bg-purple-950/40"></div>
                      {/if}
                      {#if match.secondary_style_id}
                        <img
                          src={runeStyleIconUrl(match.secondary_style_id) || getRuneIconUrl(match.secondary_style_id, runesMap)}
                          alt="Secondary Style"
                          class="h-5 w-5 rounded-full border border-purple-500/30 object-contain bg-black/80"
                        />
                      {:else}
                        <div class="h-5 w-5 rounded-full border border-purple-500/20 bg-purple-950/40"></div>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- 3. KDA & Kill Participation -->
                <div class="w-24 sm:w-28 text-center shrink-0">
                  <div class="text-sm sm:text-base font-black tracking-wide text-white">
                    <span>{match.kills}</span>
                    <span class="text-slate-500">/</span>
                    <span class="text-rose-400">{match.deaths}</span>
                    <span class="text-slate-500">/</span>
                    <span>{match.assists}</span>
                  </div>
                  <div class="text-xs font-bold {getKdaColor(match.kda)} mt-0.5">
                    {match.kda.toFixed(2)}:1 KDA
                  </div>
                  {#if match.kill_participation != null && match.kill_participation > 0}
                    <div class="text-[11px] font-semibold text-purple-300/80 mt-0.5">
                      P/Kill {formatPct(match.kill_participation)}
                    </div>
                  {/if}
                </div>

                <!-- 4. CS, Damage & Vision -->
                <div class="w-24 sm:w-28 text-right shrink-0">
                  <div class="text-xs sm:text-sm font-bold text-slate-200">
                    {match.cs} <span class="text-[11px] text-slate-400 font-normal">({match.cs_per_min} CS/m)</span>
                  </div>
                  <div class="text-xs font-semibold text-rose-300/90 mt-0.5">
                    {match.total_damage.toLocaleString()} DMG
                  </div>
                  {#if match.vision_score}
                    <div class="text-[11px] text-slate-400 mt-0.5">
                      {match.vision_score} Vision
                    </div>
                  {/if}
                </div>

                <!-- 5. Items Grid (6 items + Trinket) -->
                <div class="flex items-center gap-1.5 shrink-0">
                  <div class="grid grid-cols-3 gap-1">
                    {#each match.items.slice(0, 6) as itId, i}
                      {#if itId && itId > 0}
                        <img
                          src={itemIconUrl(itId, $ddragonVersion)}
                          alt="Item"
                          class="h-6 w-6 rounded-md border border-purple-500/30 object-cover bg-black"
                        />
                      {:else}
                        <div class="h-6 w-6 rounded-md border border-purple-500/15 bg-purple-950/30"></div>
                      {/if}
                    {/each}
                  </div>
                  <!-- Trinket Slot (Slot 6) -->
                  <div class="ml-1 pl-1.5 border-l border-purple-500/20">
                    {#if match.items[6] && match.items[6] > 0}
                      <img
                        src={itemIconUrl(match.items[6], $ddragonVersion)}
                        alt="Trinket"
                        class="h-6 w-6 rounded-full border border-purple-500/30 object-cover bg-black"
                      />
                    {:else}
                      <div class="h-6 w-6 rounded-full border border-purple-500/15 bg-purple-950/30"></div>
                    {/if}
                  </div>
                </div>

                <!-- 6. Expand Button -->
                <button
                  type="button"
                  on:click={() => toggleMatchDetails(match)}
                  class="rounded-lg border border-purple-500/20 bg-purple-950/30 p-1.5 text-purple-300/70 transition hover:bg-purple-900/40 hover:text-white"
                  title={isExpanded ? "Collapse Match Details" : "Expand Scoreboard"}
                >
                  <svg
                    class="h-4 w-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>

              <!-- EXPANDED SCOREBOARD / 10-PLAYER BREAKDOWN -->
              {#if isExpanded}
                {#if loadingMatchDetailIds.has(match.id)}
                  <div class="flex h-20 items-center justify-center gap-2 border-t border-purple-500/20 bg-void-950/40 p-4">
                    <div class="h-4 w-4 animate-spin rounded-full border-2 border-purple-400 border-t-transparent"></div>
                    <span class="text-xs font-semibold text-purple-300">Loading full match scoreboard…</span>
                  </div>
                {:else if match.participants && match.participants.length > 1}
                  {@const blueParticipants = match.participants.filter((p) => p.team_id === 100 || p.team_id === 1)}
                  {@const redParticipants = match.participants.filter((p) => p.team_id === 200 || p.team_id === 2)}
                  {@const blueTeam = blueParticipants.length > 0 || redParticipants.length > 0 ? blueParticipants : match.participants.slice(0, Math.ceil(match.participants.length / 2))}
                  {@const redTeam = blueParticipants.length > 0 || redParticipants.length > 0 ? redParticipants : match.participants.slice(Math.ceil(match.participants.length / 2))}
                  <div class="border-t border-purple-500/20 bg-void-950/40 p-4 transition-all">
                  <div class="grid grid-cols-1 min-[1180px]:grid-cols-2 gap-4">
                    <!-- Blue Team (100) -->
                    <div class="flex flex-col gap-1.5">
                      <div class="flex items-center justify-between px-2 pb-1 border-b border-cyan-500/20 text-[11px] font-black uppercase text-cyan-300">
                        <span class="flex items-center gap-1.5">
                          <span>Blue Team</span>
                          {#if blueTeam.length > 0 && blueTeam[0].win !== undefined}
                            <span class="text-[9px] px-1.5 py-0.2 rounded font-bold {blueTeam[0].win ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'}">
                              {blueTeam[0].win ? 'Victory' : 'Defeat'}
                            </span>
                          {/if}
                        </span>
                        <span>KDA · DMG · Items</span>
                      </div>
                      {#each blueTeam as p}
                        {@const pChamp = getChampInfo(p.champion_id)}
                        <div
                          role="button"
                          tabindex="0"
                          on:click={() => openPlayerProfile(p)}
                          on:keydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openPlayerProfile(p);
                            }
                          }}
                          class="flex items-center justify-between rounded-lg py-1.5 px-2 transition border {p.is_local
                            ? 'bg-purple-900/30 border-purple-500/30 hover:bg-purple-900/50 hover:border-purple-400/50'
                            : 'border-transparent hover:border-purple-500/40 hover:bg-purple-950/40'} cursor-pointer overflow-hidden text-left"
                          title="Profil von {p.summoner_name} aufrufen"
                        >
                          <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
                            <!-- Champion Avatar with Level Badge -->
                            <div class="relative shrink-0">
                              <img
                                src={squareIconUrl(pChamp.key, $ddragonVersion)}
                                alt={pChamp.name}
                                class="h-8.5 w-8.5 rounded-lg border border-purple-500/30 object-cover bg-black shrink-0"
                              />
                              <span class="absolute -bottom-1 -right-1 rounded bg-void-950/90 border border-purple-400/40 px-1 text-[8px] font-black text-purple-200 leading-tight">
                                {p.champion_level}
                              </span>
                            </div>
                            <!-- Summoners & Runes -->
                            <div class="flex items-center gap-0.5 shrink-0">
                              {#if p.spells && p.spells.length >= 2}
                                <div class="flex flex-col gap-0.5">
                                  <img
                                    src={summonerSpellIconUrl(p.spells[0], $ddragonVersion)}
                                    alt="Spell"
                                    class="h-4 w-4 rounded border border-purple-500/25 object-cover bg-black shrink-0"
                                  />
                                  <img
                                    src={summonerSpellIconUrl(p.spells[1], $ddragonVersion)}
                                    alt="Spell"
                                    class="h-4 w-4 rounded border border-purple-500/25 object-cover bg-black shrink-0"
                                  />
                                </div>
                              {/if}
                              <div class="flex flex-col gap-0.5">
                                {#if p.primary_rune_id}
                                  <img
                                    src={getRuneIconUrl(p.primary_rune_id, runesMap)}
                                    alt="Keystone"
                                    class="h-4 w-4 rounded-full border border-purple-500/30 object-contain bg-black/80 shrink-0"
                                  />
                                {:else}
                                  <div class="h-4 w-4 rounded-full border border-purple-500/15 bg-purple-950/40 shrink-0"></div>
                                {/if}
                                {#if p.secondary_style_id}
                                  <img
                                    src={runeStyleIconUrl(p.secondary_style_id) || getRuneIconUrl(p.secondary_style_id, runesMap)}
                                    alt="Secondary Style"
                                    class="h-4 w-4 rounded-full border border-purple-500/30 object-contain bg-black/80 shrink-0"
                                  />
                                {:else}
                                  <div class="h-4 w-4 rounded-full border border-purple-500/15 bg-purple-950/40 shrink-0"></div>
                                {/if}
                              </div>
                            </div>
                            <div class="min-w-0 flex-1">
                              <span
                                class="text-xs font-bold truncate block {p.is_local ? 'text-amber-300 font-extrabold' : 'text-white'}"
                                title="{p.summoner_name} (Lv. {p.champion_level})"
                              >
                                {p.summoner_name}
                              </span>
                              <span class="text-[10px] font-medium text-slate-400 block truncate">
                                Lv. {p.champion_level}
                              </span>
                            </div>
                          </div>
                          <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
                            <span class="text-xs font-bold text-slate-100 w-14 sm:w-16 text-center shrink-0">
                              {p.kills}/{p.deaths}/{p.assists}
                            </span>
                            <span class="text-xs font-semibold text-rose-300/90 w-11 sm:w-12 text-right shrink-0">
                              {p.total_damage > 0 ? (p.total_damage / 1000).toFixed(1) + "k" : "–"}
                            </span>
                            <div class="flex items-center gap-0.5 sm:gap-1 shrink-0">
                              {#each p.items.slice(0, 6) as itId}
                                {#if itId > 0}
                                  <img src={itemIconUrl(itId, $ddragonVersion)} alt="Item" class="h-5 w-5 sm:h-5.5 sm:w-5.5 rounded-md border border-purple-500/25 bg-black" />
                                {:else}
                                  <div class="h-5 w-5 sm:h-5.5 sm:w-5.5 rounded-md border border-purple-500/15 bg-purple-950/30"></div>
                                {/if}
                              {/each}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>

                    <!-- Red Team (200) -->
                    <div class="flex flex-col gap-1.5">
                      <div class="flex items-center justify-between px-2 pb-1 border-b border-rose-500/20 text-[11px] font-black uppercase text-rose-300">
                        <span class="flex items-center gap-1.5">
                          <span>Red Team</span>
                          {#if redTeam.length > 0 && redTeam[0].win !== undefined}
                            <span class="text-[9px] px-1.5 py-0.2 rounded font-bold {redTeam[0].win ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-400'}">
                              {redTeam[0].win ? 'Victory' : 'Defeat'}
                            </span>
                          {/if}
                        </span>
                        <span>KDA · DMG · Items</span>
                      </div>
                      {#each redTeam as p}
                        {@const pChamp = getChampInfo(p.champion_id)}
                        <div
                          role="button"
                          tabindex="0"
                          on:click={() => openPlayerProfile(p)}
                          on:keydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openPlayerProfile(p);
                            }
                          }}
                          class="flex items-center justify-between rounded-lg py-1.5 px-2 transition border {p.is_local
                            ? 'bg-purple-900/30 border-purple-500/30 hover:bg-purple-900/50 hover:border-purple-400/50'
                            : 'border-transparent hover:border-purple-500/40 hover:bg-purple-950/40'} cursor-pointer overflow-hidden text-left"
                          title="Profil von {p.summoner_name} aufrufen"
                        >
                          <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
                            <!-- Champion Avatar with Level Badge -->
                            <div class="relative shrink-0">
                              <img
                                src={squareIconUrl(pChamp.key, $ddragonVersion)}
                                alt={pChamp.name}
                                class="h-8.5 w-8.5 rounded-lg border border-purple-500/30 object-cover bg-black shrink-0"
                              />
                              <span class="absolute -bottom-1 -right-1 rounded bg-void-950/90 border border-purple-400/40 px-1 text-[8px] font-black text-purple-200 leading-tight">
                                {p.champion_level}
                              </span>
                            </div>
                            <!-- Summoners & Runes -->
                            <div class="flex items-center gap-0.5 shrink-0">
                              {#if p.spells && p.spells.length >= 2}
                                <div class="flex flex-col gap-0.5">
                                  <img
                                    src={summonerSpellIconUrl(p.spells[0], $ddragonVersion)}
                                    alt="Spell"
                                    class="h-4 w-4 rounded border border-purple-500/25 object-cover bg-black shrink-0"
                                  />
                                  <img
                                    src={summonerSpellIconUrl(p.spells[1], $ddragonVersion)}
                                    alt="Spell"
                                    class="h-4 w-4 rounded border border-purple-500/25 object-cover bg-black shrink-0"
                                  />
                                </div>
                              {/if}
                              <div class="flex flex-col gap-0.5">
                                {#if p.primary_rune_id}
                                  <img
                                    src={getRuneIconUrl(p.primary_rune_id, runesMap)}
                                    alt="Keystone"
                                    class="h-4 w-4 rounded-full border border-purple-500/30 object-contain bg-black/80 shrink-0"
                                  />
                                {:else}
                                  <div class="h-4 w-4 rounded-full border border-purple-500/15 bg-purple-950/40 shrink-0"></div>
                                {/if}
                                {#if p.secondary_style_id}
                                  <img
                                    src={runeStyleIconUrl(p.secondary_style_id) || getRuneIconUrl(p.secondary_style_id, runesMap)}
                                    alt="Secondary Style"
                                    class="h-4 w-4 rounded-full border border-purple-500/30 object-contain bg-black/80 shrink-0"
                                  />
                                {:else}
                                  <div class="h-4 w-4 rounded-full border border-purple-500/15 bg-purple-950/40 shrink-0"></div>
                                {/if}
                              </div>
                            </div>
                            <div class="min-w-0 flex-1">
                              <span
                                class="text-xs font-bold truncate block {p.is_local ? 'text-amber-300 font-extrabold' : 'text-white'}"
                                title="{p.summoner_name} (Lv. {p.champion_level})"
                              >
                                {p.summoner_name}
                              </span>
                              <span class="text-[10px] font-medium text-slate-400 block truncate">
                                Lv. {p.champion_level}
                              </span>
                            </div>
                          </div>
                          <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
                            <span class="text-xs font-bold text-slate-100 w-14 sm:w-16 text-center shrink-0">
                              {p.kills}/{p.deaths}/{p.assists}
                            </span>
                            <span class="text-xs font-semibold text-rose-300/90 w-11 sm:w-12 text-right shrink-0">
                              {p.total_damage > 0 ? (p.total_damage / 1000).toFixed(1) + "k" : "–"}
                            </span>
                            <div class="flex items-center gap-0.5 sm:gap-1 shrink-0">
                              {#each p.items.slice(0, 6) as itId}
                                {#if itId > 0}
                                  <img src={itemIconUrl(itId, $ddragonVersion)} alt="Item" class="h-5 w-5 sm:h-5.5 sm:w-5.5 rounded-md border border-purple-500/25 bg-black" />
                                {:else}
                                  <div class="h-5 w-5 sm:h-5.5 sm:w-5.5 rounded-md border border-purple-500/15 bg-purple-950/30"></div>
                                {/if}
                              {/each}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
                {:else}
                  <div class="flex h-16 items-center justify-center gap-3 border-t border-purple-500/20 bg-void-950/40 p-4 text-xs text-slate-400">
                    <span>Detailed scoreboard unavailable for this match.</span>
                    <button
                      type="button"
                      on:click|stopPropagation={() => {
                        loadingMatchDetailIds.add(match.id);
                        loadingMatchDetailIds = new Set(loadingMatchDetailIds);
                        loadMatchDetail(
                          match.id,
                          selectedRegion,
                          match.raw_created_at || match.game_creation,
                          $viewedProfile?.display_name
                        ).finally(() => {
                          loadingMatchDetailIds.delete(match.id);
                          loadingMatchDetailIds = new Set(loadingMatchDetailIds);
                        });
                      }}
                      class="rounded border border-purple-500/30 bg-purple-950/40 px-2.5 py-1 text-[11px] font-semibold text-purple-200 transition hover:bg-purple-900/40 hover:text-white"
                    >
                      ↻ Retry
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="glass flex h-64 flex-col items-center justify-center rounded-2xl p-6 text-center">
          <span class="text-3xl">⚔️</span>
          <h3 class="mt-2 text-sm font-bold text-white">No Match History Found</h3>
          <p class="mt-1 text-xs text-slate-400 max-w-sm">
            No matches matching the selected filter were recorded for this summoner.
          </p>
        </div>
      {/if}
    </div>
  </div>
  {:else}
    <div class="glass flex min-h-[400px] flex-col items-center justify-center rounded-2xl p-8 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-950/40 text-3xl shadow-md">
        🔍
      </div>
      <h2 class="mt-4 text-xl font-black tracking-wide text-white">Search Player Profile</h2>
      <p class="mt-2 max-w-md text-xs text-purple-300/70">
        Enter a summoner name or Riot ID (<span class="font-mono text-purple-200">Name#Tag</span>) in the search bar above to look up their rank, top champions, and match history.
      </p>
      <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
        <span class="text-[10px] font-bold uppercase tracking-wider text-purple-400/60">Try searching:</span>
        {#each [
          { name: "Agurin#EUW", reg: "EUW" },
          { name: "Noway#EUW", reg: "EUW" },
          { name: "Hide on bush#KR1", reg: "KR" },
          { name: "Caps#EUW", reg: "EUW" },
          { name: "Rekkles#1996", reg: "EUW" }
        ] as demo}
          <button
            type="button"
            on:click={() => {
              searchQuery = demo.name;
              selectedRegion = demo.reg;
              handleSearch(false);
            }}
            class="rounded-lg border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 text-xs font-semibold text-purple-200 transition hover:border-purple-400/50 hover:bg-purple-900/50 hover:text-white"
          >
            {demo.name}
          </button>
        {/each}
      </div>
      {#if $profile}
        <div class="mt-6">
          <button
            type="button"
            on:click={returnToMyAccount}
            class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-900/40 active:scale-95"
          >
            <span>★</span>
            <span>Load My Account ({$profile.display_name})</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
</div>
