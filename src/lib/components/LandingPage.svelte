<script lang="ts">
  import { onMount } from "svelte";
  import { ddragonVersion, championCatalog, type ChampionInfo } from "../stores/champions";
  import {
    profile,
    loadPlayerProfile,
    activeSearchQuery,
    isExplicitSearch,
    recentSearches,
    type RecentSearchItem,
  } from "../stores/profile";
  import { activeTab, navigateToChampion } from "../stores/navigation";
  import { squareIconUrl, tierMedalUrl, profileIconUrl } from "../utils/ddragon";
  import { openInBrowser, getLatestPatchInfo, type PatchInfo } from "../ipc/tauri";
  import { inferRegionFromTag } from "../utils/profileNormalizer";
  import { activeTheme, customWallpaper, hasCustomWallpaper } from "../stores/theme";
  import PatchNotesModal from "./PatchNotesModal.svelte";
  import { updateAvailable, updateVersion, showUpdateModal } from "../stores/updater";
  import { loadLivePatchNotes } from "../stores/patchNotes";
  import { settings } from "../stores/settings";

  let searchQuery = "";
  let showDropdown = false;
  let showPatchNotesModal = false;
  let selectedSuggestionIndex = -1;

  $: hasCustom = $hasCustomWallpaper || Boolean($customWallpaper);
  $: effectiveBg = $customWallpaper || (hasCustom ? "" : "/landing-bg.jpg");
  $: bgFilter = hasCustom ? "none" : $activeTheme.bgFilter;

  interface LandingHistoryItem {
    id: string;
    type: "champion" | "player";
    label: string;
    region?: string;
    championId?: number;
    champKey?: string;
    tier?: string;
  }

  const LANDING_HISTORY_KEY = "rift_landing_recent_searches";

  function getStoredLandingHistory(): LandingHistoryItem[] {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(LANDING_HISTORY_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  let landingHistory: LandingHistoryItem[] = getStoredLandingHistory();

  function saveToLandingHistory(item: LandingHistoryItem) {
    landingHistory = [
      item,
      ...landingHistory.filter(
        (x) => x.id !== item.id && x.label.toLowerCase() !== item.label.toLowerCase()
      ),
    ].slice(0, 8);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(LANDING_HISTORY_KEY, JSON.stringify(landingHistory));
      }
    } catch {}
  }

  // Convert Data Dragon internal version (16.17.1) to public patch notes format (26.17)
  function computePatch(ver: string): PatchInfo {
    const parts = (ver || "16.17.1").split(".");
    let major = parseInt(parts[0], 10) || 16;
    const minor = parts[1] || "17";
    // Season 2026 starts with internal major 16, which maps to year 26
    if (major >= 16 && major <= 25) {
      major += 10;
    }
    const slug = `${major}-${minor}`;
    return {
      display: `${major}.${minor}`,
      slug,
      url: `https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-${slug}-notes/`,
    };
  }

  $: defaultPatch = computePatch($ddragonVersion);
  let livePatch: PatchInfo | null = null;
  $: currentPatch = livePatch ?? defaultPatch;

  onMount(async () => {
    try {
      livePatch = await getLatestPatchInfo($ddragonVersion);
    } catch (e) {
      console.warn("Failed to load live patch info", e);
    }
    void loadLivePatchNotes($settings.server_url, $settings.api_key);
  });

  // Matching champions for live suggestions (top 3)
  $: matchingChampions = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];

    const catalog = Array.from($championCatalog.values());
    return catalog
      .filter((c) => c.name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aExact = aName === q || a.key.toLowerCase() === q;
        const bExact = bName === q || b.key.toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = aName.startsWith(q);
        const bStarts = bName.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return aName.localeCompare(bName);
      })
      .slice(0, 3);
  })();

  // Matching summoners for live suggestions (own profile, recent searches, landing history, known summoners)
  $: matchingPlayers = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];

    const candidates: Array<RecentSearchItem & { isSelf?: boolean }> = [];
    const seenIds = new Set<string>();

    // 1. Current user's own profile (from live client or cached profile)
    if ($profile?.display_name) {
      const idKey = $profile.display_name.toLowerCase();
      seenIds.add(idKey);
      const tag = $profile.tag_line || ($profile.display_name.includes("#") ? $profile.display_name.split("#")[1] : "EUW");
      const region = inferRegionFromTag(tag) || "EUW";
      candidates.push({
        riot_id: $profile.display_name,
        region,
        level: $profile.level,
        profile_icon_id: $profile.profile_icon_id,
        isSelf: true,
      });
    }

    // 2. Recent searches from the profile search history
    for (const s of $recentSearches) {
      const idKey = s.riot_id.toLowerCase();
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        candidates.push(s);
      }
    }

    // 3. Any players in Startseite landing history
    for (const item of landingHistory) {
      if (item.type === "player" && item.label) {
        const idKey = item.label.toLowerCase();
        if (!seenIds.has(idKey)) {
          seenIds.add(idKey);
          candidates.push({
            riot_id: item.label,
            region: item.region || "EUW",
            tier: item.tier,
          });
        }
      }
    }

    // 4. Known popular summoners (Agurin, Faker, Caps, Noway, Rekkles, Chovy)
    const known: RecentSearchItem[] = [
      { riot_id: "Agurin#EUW", region: "EUW", tier: "CHALLENGER" },
      { riot_id: "Faker#KR1", region: "KR", tier: "CHALLENGER" },
      { riot_id: "Caps#EUW", region: "EUW", tier: "CHALLENGER" },
      { riot_id: "Noway#EUW", region: "EUW", tier: "CHALLENGER" },
      { riot_id: "Chovy#KR1", region: "KR", tier: "CHALLENGER" },
      { riot_id: "Rekkles#1996", region: "EUW", tier: "CHALLENGER" },
    ];
    for (const k of known) {
      const idKey = k.riot_id.toLowerCase();
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        candidates.push(k);
      }
    }

    // Filter and score candidates
    return candidates
      .filter((p) => {
        const name = p.riot_id.toLowerCase();
        const baseName = name.split("#")[0];
        return name.includes(q) || baseName.includes(q);
      })
      .sort((a, b) => {
        const aName = a.riot_id.toLowerCase();
        const bName = b.riot_id.toLowerCase();
        const aBase = aName.split("#")[0];
        const bBase = bName.split("#")[0];

        // Exact match with base name or full riot id
        const aExact = aName === q || aBase === q;
        const bExact = bName === q || bBase === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Starts with query
        const aStarts = aName.startsWith(q) || aBase.startsWith(q);
        const bStarts = bName.startsWith(q) || bBase.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // User's own profile prioritized
        if (a.isSelf && !b.isSelf) return -1;
        if (!a.isSelf && b.isSelf) return 1;

        return aName.localeCompare(bName);
      })
      .slice(0, 3);
  })();

  $: allSuggestions = [
    ...matchingChampions.map((c) => ({ type: "champion" as const, champ: c })),
    ...matchingPlayers.map((p) => ({ type: "player" as const, player: p })),
  ];

  $: if (searchQuery) {
    selectedSuggestionIndex = -1;
  }

  // Quick suggestions: top 3 items from Startseite history, backfilled with recent searches or default champions
  $: quickSuggestions = (() => {
    const result: LandingHistoryItem[] = [];
    const seenIds = new Set<string>();

    // 1. First add from landingHistory
    for (const item of landingHistory) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        result.push(item);
        if (result.length >= 3) return result;
      }
    }

    // 2. Next backfill from recentSearches (recent players)
    for (const s of $recentSearches) {
      const id = `player_${s.riot_id.toLowerCase()}_${s.region.toLowerCase()}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({
          id,
          type: "player",
          label: s.riot_id,
          region: s.region,
          tier: s.tier,
        });
        if (result.length >= 3) return result;
      }
    }

    // 3. Fallback to popular champions (e.g. Ahri, Jinx)
    const popularNames = ["Ahri", "Jinx"];
    for (const name of popularNames) {
      const c = Array.from($championCatalog.values()).find(
        (champ) => champ.name.toLowerCase() === name.toLowerCase()
      );
      if (c) {
        const id = `champ_${c.id}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          result.push({
            id,
            type: "champion",
            label: c.name,
            championId: c.id,
            champKey: c.key,
          });
          if (result.length >= 3) return result;
        }
      }
    }

    return result;
  })();

  function selectChampion(champ: ChampionInfo) {
    saveToLandingHistory({
      id: `champ_${champ.id}`,
      type: "champion",
      label: champ.name,
      championId: champ.id,
      champKey: champ.key,
    });
    showDropdown = false;
    searchQuery = "";
    navigateToChampion(champ.id);
  }

  function selectPlayer(p: RecentSearchItem | { riot_id: string; region: string; tier?: string }) {
    saveToLandingHistory({
      id: `player_${p.riot_id.toLowerCase()}_${p.region.toLowerCase()}`,
      type: "player",
      label: p.riot_id,
      region: p.region,
      tier: p.tier,
    });
    showDropdown = false;
    searchQuery = "";
    isExplicitSearch.set(true);
    activeSearchQuery.set(p.riot_id);
    let gn = p.riot_id;
    let tl = p.region || "EUW";
    if (p.riot_id.includes("#")) {
      const parts = p.riot_id.split("#");
      gn = parts[0].trim();
      tl = parts[1].trim() || p.region || "EUW";
    }
    loadPlayerProfile(gn, tl, p.region || "EUW", false);
    activeTab.set("profil");
  }

  function selectQuickSuggestion(item: LandingHistoryItem) {
    if (item.type === "champion" && item.championId != null) {
      saveToLandingHistory(item);
      navigateToChampion(item.championId);
    } else if (item.type === "player") {
      selectPlayer({
        riot_id: item.label,
        region: item.region || "EUW",
        tier: item.tier,
      });
    }
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      if (allSuggestions.length > 0) {
        e.preventDefault();
        showDropdown = true;
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % allSuggestions.length;
      }
    } else if (e.key === "ArrowUp") {
      if (allSuggestions.length > 0) {
        e.preventDefault();
        showDropdown = true;
        selectedSuggestionIndex =
          (selectedSuggestionIndex - 1 + allSuggestions.length) % allSuggestions.length;
      }
    } else if (e.key === "Escape") {
      showDropdown = false;
      selectedSuggestionIndex = -1;
    }
  }

  function handleSearchSubmit() {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    // 1. If user highlighted a suggestion with arrow keys
    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < allSuggestions.length) {
      const suggestion = allSuggestions[selectedSuggestionIndex];
      if (suggestion.type === "champion") {
        selectChampion(suggestion.champ);
        return;
      } else {
        selectPlayer(suggestion.player);
        return;
      }
    }

    // 2. Check if query directly matches a champion
    const champMatch = Array.from($championCatalog.values()).find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase() || c.key.toLowerCase() === trimmed.toLowerCase()
    );
    if (champMatch) {
      selectChampion(champMatch);
      return;
    }

    // 3. Otherwise treat as summoner lookup and navigate to profile
    let gn = trimmed;
    let tl = "EUW";
    let detectedRegion = "EUW";

    if (trimmed.includes("#")) {
      const parts = trimmed.split("#");
      gn = parts[0].trim();
      tl = parts[1].trim() || "EUW";
      const inferred = inferRegionFromTag(tl);
      if (inferred) {
        detectedRegion = inferred;
      }
    }

    saveToLandingHistory({
      id: `player_${trimmed.toLowerCase()}_${detectedRegion.toLowerCase()}`,
      type: "player",
      label: trimmed,
      region: detectedRegion,
    });

    showDropdown = false;
    searchQuery = "";
    isExplicitSearch.set(true);
    activeSearchQuery.set(trimmed);
    loadPlayerProfile(gn, tl, detectedRegion, false);
    activeTab.set("profil");
  }

  function openPatchNotes() {
    openInBrowser(currentPatch.url);
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 select-none">
  <!-- Atmospheric background map with glowing runes (clean artwork from mockup) -->
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <!-- Base Map -->
    <div
      class="absolute inset-0 bg-center bg-no-repeat bg-cover opacity-90 transition-all duration-700"
      style="background-image: {effectiveBg ? `url('${effectiveBg}')` : 'none'}; filter: {bgFilter};"
    ></div>

    <!-- Theme Color Wash / Duotone Tint (only when using theme preset) -->
    {#if !hasCustom}
      <div
        class="absolute inset-0 transition-all duration-700 pointer-events-none"
        style="background: {$activeTheme.tintGradient}; mix-blend-mode: {$activeTheme.tintBlendMode}; opacity: 0.9;"
      ></div>
    {/if}

    <!-- Vignette gradients blending into deep dark theme edges -->
    <div class="absolute inset-0 bg-radial-gradient from-transparent via-[var(--theme-bg-base)]/50 to-[var(--theme-bg-base)] transition-colors duration-500"></div>
    <div class="absolute inset-0 bg-gradient-to-t from-[var(--theme-bg-base)] via-transparent to-[var(--theme-bg-base)]/80 transition-colors duration-500"></div>
  </div>

  <!-- Central Hero Content -->
  <div class="relative z-10 flex w-full max-w-2xl flex-col items-center text-center -mt-6">
    <!-- Main Title (clean, no colored glow) -->
    <h1 class="text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase tracking-[0.22em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] transition-all duration-500">
      Rift Companion
    </h1>

    <!-- Search Bar Container with relative positioning for floating dropdown -->
    <div class="relative mt-8 w-full max-w-xl">
      <form
        on:submit|preventDefault={handleSearchSubmit}
        class="relative flex items-center rounded-2xl border border-purple-500/35 bg-void-950/60 shadow-xl backdrop-blur-xl transition-all duration-200 focus-within:border-purple-400 focus-within:ring-1 focus-within:ring-purple-400/30 hover:border-purple-400/60"
      >
        <span class="pointer-events-none absolute left-4 text-purple-300/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          bind:value={searchQuery}
          on:focus={() => (showDropdown = true)}
          on:blur={() => (showDropdown = false)}
          on:keydown={handleInputKeydown}
          placeholder="Search specific player or champion..."
          class="w-full rounded-2xl bg-transparent py-3.5 pl-12 pr-4 text-sm text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
        />
        {#if searchQuery}
          <button
            type="button"
            aria-label="Clear search query"
            on:click={() => {
              searchQuery = "";
              showDropdown = false;
            }}
            class="mr-3 text-slate-400 hover:text-white transition"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </form>

      <!-- Autocomplete Dropdown Menu -->
      {#if showDropdown && (matchingChampions.length > 0 || matchingPlayers.length > 0)}
        <div
          role="listbox"
          tabindex="-1"
          aria-label="Search suggestions"
          class="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-2xl border border-purple-500/30 bg-void-950/95 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl ring-1 ring-purple-500/20 text-left"
          on:mousedown|preventDefault
        >
          <!-- CHAMPIONS SECTION -->
          {#if matchingChampions.length > 0}
            <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-purple-300/60">
              Champions
            </div>
            {#each matchingChampions as champ, i}
              {@const isSelected = selectedSuggestionIndex === i}
              <button
                type="button"
                on:click={() => selectChampion(champ)}
                class="group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition {isSelected
                  ? 'bg-purple-600/40 text-white'
                  : 'text-slate-200 hover:bg-purple-900/35 hover:text-white'}"
              >
                <div class="flex items-center gap-2.5">
                  <img
                    src={squareIconUrl(champ.key, $ddragonVersion)}
                    alt={champ.name}
                    class="h-7 w-7 rounded-lg border border-purple-400/30 object-cover shadow-sm"
                  />
                  <span class="text-xs font-semibold text-slate-100 group-hover:text-purple-200 transition">
                    {champ.name}
                  </span>
                </div>
              </button>
            {/each}
          {/if}

          <!-- SUMMONERS SECTION -->
          {#if matchingPlayers.length > 0}
            <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-purple-300/60 {matchingChampions.length > 0 ? 'border-t border-purple-500/15 mt-1' : ''}">
              Summoners
            </div>
            {#each matchingPlayers as p, i}
              {@const isSelected = selectedSuggestionIndex === matchingChampions.length + i}
              <button
                type="button"
                on:click={() => selectPlayer(p)}
                class="group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition {isSelected
                  ? 'bg-purple-600/40 text-white'
                  : 'text-slate-200 hover:bg-purple-900/35 hover:text-white'}"
              >
                <div class="flex items-center gap-2.5">
                  {#if p.profile_icon_id}
                    <img
                      src={profileIconUrl(p.profile_icon_id, $ddragonVersion)}
                      alt="Avatar"
                      class="h-6 w-6 rounded-md object-cover border border-purple-500/30"
                    />
                  {:else if p.tier}
                    <img src={tierMedalUrl(p.tier)} alt="Rank" class="h-6 w-6 object-contain" />
                  {:else}
                    <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-950/60 text-purple-300 border border-purple-500/30">
                      <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="7" r="4" />
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      </svg>
                    </div>
                  {/if}
                  <span class="text-xs font-semibold text-slate-100 group-hover:text-purple-200 transition">
                    {p.riot_id}
                  </span>
                  {#if (p as any).isSelf}
                    <span class="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300 border border-emerald-500/30">
                      You
                    </span>
                  {/if}
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="rounded bg-purple-900/50 px-1.5 py-0.5 text-[9px] font-bold text-purple-300/80">
                    {p.region}
                  </span>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      {/if}

      <!-- Quick suggestions row (3 most recently searched items from Startseite) -->
      <div class="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span class="text-purple-300/60 font-medium">Quick suggest:</span>

        {#each quickSuggestions as item (item.id)}
          <button
            type="button"
            on:click={() => selectQuickSuggestion(item)}
            class="group flex items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white"
          >
            {#if item.type === "champion"}
              <div class="relative h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-purple-400/50">
                <img
                  src={squareIconUrl(item.champKey || item.label, $ddragonVersion)}
                  alt={item.label}
                  class="h-full w-full object-cover scale-[1.18]"
                />
              </div>
            {:else if item.tier}
              <img
                src={tierMedalUrl(item.tier)}
                alt="Rank"
                class="h-4 w-4 object-contain"
              />
            {:else}
              <svg class="h-3.5 w-3.5 text-purple-300/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            {/if}
            <span>{item.label}</span>
            {#if item.type === "player" && item.region}
              <span class="rounded bg-purple-900/60 px-1 text-[9px] text-purple-300/70 font-semibold">{item.region}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Action buttons row -->
    <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
      {#if $updateAvailable}
        <!-- App Update Ready button -->
        <button
          type="button"
          on:click={() => showUpdateModal.set(true)}
          class="group flex items-center gap-3 rounded-xl border border-emerald-400/50 bg-gradient-to-r from-emerald-900/80 via-teal-900/70 to-emerald-950/85 px-4 py-2 text-left shadow-lg shadow-emerald-950/50 backdrop-blur-lg transition-all duration-200 hover:scale-[1.03] hover:border-emerald-300 hover:from-emerald-800/90 hover:to-teal-900/90 active:scale-[0.98]"
          title="Install Rift Companion Update"
        >
          <div class="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-950/60 text-emerald-300 shadow-inner">
            <svg class="h-4 w-4 text-emerald-300 transition-transform group-hover:translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div class="flex flex-col">
            <span class="text-[11px] font-semibold tracking-wide text-emerald-300 flex items-center gap-1">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Update Ready
            </span>
            <span class="text-sm font-bold text-white leading-none">v{$updateVersion} • Install</span>
          </div>
        </button>
      {/if}

      <!-- Latest Changes Button (in-app Patch Notes Highlights) -->
      <button
        type="button"
        on:click={() => (showPatchNotesModal = true)}
        class="group flex items-center gap-3 rounded-xl border border-purple-400/30 bg-gradient-to-r from-purple-900/75 via-purple-800/65 to-purple-950/80 px-4 py-2 text-left shadow-md backdrop-blur-lg transition-all duration-200 hover:scale-[1.02] hover:border-purple-300 hover:from-purple-800/85 hover:to-purple-900/85 hover:shadow-lg active:scale-[0.98]"
        title="View Latest Changes & Patch Highlights"
      >
        <div class="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-400/30 bg-purple-950/50 text-purple-200 shadow-inner">
          <svg class="h-4 w-4 text-purple-300 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div class="flex flex-col">
          <span class="text-[11px] font-semibold tracking-wide text-purple-200">Patch Notes</span>
          <span class="text-sm font-bold text-white leading-none">Latest Changes</span>
        </div>
      </button>

      <!-- Latest Patch button (Full Riot Patch Notes in Browser) -->
      <button
        type="button"
        on:click={openPatchNotes}
        class="group flex items-center gap-3 rounded-xl border border-purple-400/30 bg-gradient-to-r from-purple-900/75 via-purple-800/65 to-purple-950/80 px-4 py-2 text-left shadow-md backdrop-blur-lg transition-all duration-200 hover:scale-[1.02] hover:border-purple-300 hover:from-purple-800/85 hover:to-purple-900/85 hover:shadow-lg active:scale-[0.98]"
        title="Open official patch notes in default browser"
      >
        <!-- Patch/Book icon box -->
        <div class="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-400/30 bg-purple-950/50 text-purple-200 shadow-inner">
          <svg class="h-4 w-4 text-purple-300 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
          </svg>
        </div>

        <!-- Text details -->
        <div class="flex flex-col">
          <span class="text-[11px] font-semibold tracking-wide text-purple-200">Official Web</span>
          <span class="text-sm font-bold text-white leading-none">Patch v{currentPatch.display} <span class="text-xs font-normal text-purple-200/80">(Browser)</span></span>
        </div>

        <!-- External link icon -->
        <div class="ml-1 text-purple-200/80 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-purple-100">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      </button>
    </div>
  </div>
</div>

{#if showPatchNotesModal}
  <PatchNotesModal
    isOpen={showPatchNotesModal}
    {currentPatch}
    onClose={() => (showPatchNotesModal = false)}
  />
{/if}
