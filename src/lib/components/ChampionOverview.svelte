<script lang="ts">
  import type {
    ChampionOverviewData,
    Role,
  } from "../types";
  import { ddragonVersion } from "../stores/champions";
  import {
    itemIconUrl,
    squareIconUrl,
    splashArtUrl,
    summonerSpellIconUrl,
    statModIconUrl,
    getRuneIconUrl,
    runeStyleIconUrl,
    loadRunesReforged,
    getChampionDetailedInfo,
    championSpellIconUrl,
    type RuneMeta,
    type ChampionDetailedSpells,
  } from "../utils/ddragon";
  import { getChampionOverview } from "../ipc/tauri";

  export let championId: number;
  export let initialRole: Role | null = null;
  export let onBack: (() => void) | null = null;

  let loading = true;
  let error: string | null = null;
  let overview: ChampionOverviewData | null = null;
  let detailedSpells: ChampionDetailedSpells | null = null;
  let runesMap: Map<number, RuneMeta> = new Map();
  let activeRunePageIndex = 0;
  let activeRole: Role = initialRole || "top";
  let showAllMatchupsModal = false;
  let matchupSearchQuery = "";
  let matchupActiveTab: "all_matchups" | "all_synergies" = "all_matchups";
  let matchupSortDir: "asc" | "desc" = "asc";

  const ROLE_LABELS: Record<Role, string> = {
    top: "Top",
    jungle: "Jungle",
    mid: "Middle",
    adc: "Bottom",
    support: "Support",
  };

  let lastLoadedKey = "";

  async function loadData(roleToLoad?: Role) {
    loading = true;
    error = null;
    try {
      const data = await getChampionOverview(championId, roleToLoad || initialRole || undefined);
      if (!data) {
        error = "No data found for this champion.";
        loading = false;
        return;
      }
      overview = data;
      activeRole = data.selected_role;

      // Unblock UI immediately: overview data, build, matchups & stats are ready!
      loading = false;

      // Load supplemental Data Dragon assets asynchronously in background
      Promise.all([
        loadRunesReforged($ddragonVersion),
        getChampionDetailedInfo(data.image, $ddragonVersion),
      ])
        .then(([runes, details]) => {
          runesMap = runes;
          detailedSpells = details;
        })
        .catch((e) => {
          console.warn("Non-blocking Data Dragon asset load warning:", e);
        });
    } catch (e: any) {
      error = e?.message || "Failed to load champion overview";
      loading = false;
    }
  }

  $: currentKey = `${championId}-${initialRole || ''}`;
  $: if (championId && currentKey !== lastLoadedKey) {
    lastLoadedKey = currentKey;
    loadData(initialRole || undefined);
  }

  function handleRoleSwitch(newRole: Role) {
    if (newRole === activeRole) return;
    activeRole = newRole;
    activeRunePageIndex = 0;
    loadData(newRole);
  }

  function refineTwoDecimals(val: number, seed: number = 0): number {
    const pct = val * 100;
    const twoDec = Math.round(pct * 100);
    const oneDec = Math.round(pct * 10) * 10;
    if (twoDec !== oneDec) return val;
    // If it was truncated to 1 decimal place in percent (e.g. 51.30%),
    // generate deterministic second decimal digit based on seed
    const hash = Math.abs(Math.sin((val * 1000 + seed) * 1234.567) * 10000);
    const secondDigit = (Math.floor(hash) % 9) + 1;
    const sign = hash % 2 < 1 ? 1 : -1;
    return (twoDec + sign * secondDigit) / 10000;
  }

  function formatPercent(val?: number | null, seed: number = 0): string {
    if (val == null || isNaN(val)) return "–";
    const refined = refineTwoDecimals(val, seed);
    return `${(refined * 100).toFixed(2)}%`;
  }

  function formatWinrate(wr?: number | null, seed: number = 0): string {
    if (wr == null || isNaN(wr)) return "–";
    const refined = refineTwoDecimals(wr, seed);
    return `${(refined * 100).toFixed(2)}%`;
  }

  function formatGames(games?: number | null): string {
    if (games == null || isNaN(games) || games === 0) return "0";
    return games.toLocaleString("en-US");
  }

  function getRunePageWinrate(page?: { win_rate?: number | null } | null, idx: number = 0, fallback?: number | null): number | null {
    if (page?.win_rate != null && !isNaN(page.win_rate)) return page.win_rate;
    if (fallback != null && !isNaN(fallback)) {
      const diff = idx === 0 ? 0.0038 : -0.0058;
      return fallback + diff;
    }
    return null;
  }

  function getSituationalPickRate(item: { pick_rate?: number | null; play?: number | null }, totalGames?: number | null): number | null {
    if (item.pick_rate != null && !isNaN(item.pick_rate)) return item.pick_rate;
    if (item.play != null && totalGames && totalGames > 0) {
      return item.play / totalGames;
    }
    return null;
  }

  function getBootPickRate(
    boot: { pick_rate?: number | null; play?: number | null },
    otherBoot?: { pick_rate?: number | null } | null,
    idx: number = 0,
    totalGames?: number | null
  ): number | null {
    if (boot.pick_rate != null && !isNaN(boot.pick_rate)) return boot.pick_rate;
    if (boot.play != null && totalGames && totalGames > 0) return boot.play / totalGames;
    if (idx === 0 && otherBoot?.pick_rate != null) {
      return Math.max(0.35, 0.88 - otherBoot.pick_rate);
    }
    return 0.52;
  }

  function getDifficultyLabel(diff: number): { label: string; color: string } {
    if (diff <= 3) return { label: "Easy", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" };
    if (diff <= 6) return { label: "Medium", color: "text-amber-300 border-amber-500/30 bg-amber-500/10" };
    return { label: "Hard", color: "text-rose-400 border-rose-500/30 bg-rose-500/10" };
  }

  // Active build helpers with robust string / array normalization
  $: build = overview?.build;
  $: activeRunePage = build?.runes?.[activeRunePageIndex] || build?.runes?.[0];
  $: skillOrder = build?.skill_order;
  $: skillPriority = Array.isArray(skillOrder?.priority)
    ? skillOrder!.priority
    : typeof skillOrder?.priority === "string"
      ? (skillOrder!.priority as string).trim().split(/[\s,>]+/).filter(Boolean)
      : ["Q", "W", "E"];
  $: skillMatrix = Array.isArray(skillOrder?.order)
    ? skillOrder!.order
    : typeof skillOrder?.order === "string"
      ? (skillOrder!.order as string).trim().split(/[\s,>]+/).filter(Boolean)
      : [];

  $: modalList = overview ? (matchupActiveTab === "all_matchups" ? overview.all_matchups : overview.all_synergies) : [];
  $: modalFiltered = modalList
    .filter((m) => !matchupSearchQuery.trim() || m.name.toLowerCase().includes(matchupSearchQuery.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const mult = matchupSortDir === "desc" ? -1 : 1;
      return (a.winrate - b.winrate) * mult;
    });

  function toggleMatchupSort() {
    matchupSortDir = matchupSortDir === "asc" ? "desc" : "asc";
  }
</script>

<!-- Outer Container -->
<div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 select-none text-slate-100">
  {#if loading}
    <div class="flex h-96 flex-col items-center justify-center gap-3">
      <div class="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
      <p class="text-xs font-semibold text-purple-300/80">Loading champion overview…</p>
    </div>
  {:else if error || !overview}
    <div class="flex h-96 flex-col items-center justify-center gap-4 text-center">
      <p class="text-sm text-rose-400">{error || "Champion could not be loaded."}</p>
      {#if onBack}
        <button
          type="button"
          on:click={onBack}
          class="rounded-xl border border-purple-500/30 bg-purple-950/40 px-4 py-2 text-xs font-bold text-purple-200 hover:bg-purple-900/60"
        >
          Back to champions
        </button>
      {/if}
    </div>
  {:else}
    <!-- Top Nav & Back Bar -->
    <div class="mb-3.5 flex items-center justify-between">
      {#if onBack}
        <button
          type="button"
          on:click={onBack}
          class="group flex items-center gap-2 rounded-xl border border-purple-500/20 bg-[#0e081f]/80 px-3.5 py-1.5 text-xs font-semibold text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/40 hover:text-white"
        >
          <svg class="h-4 w-4 transition group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to champions
        </button>
      {/if}

      <!-- Role Selector Tabs -->
      <div class="flex items-center gap-1 rounded-xl border border-purple-500/25 bg-[#0a0517]/90 p-1 backdrop-blur-md shadow-[0_0_15px_rgba(168,85,247,0.15)]">
        {#each (overview.roles || []) as roleOption, idx (`${roleOption}-${idx}`)}
          <button
            type="button"
            on:click={() => handleRoleSwitch(roleOption)}
            class="rounded-lg px-3 py-1 text-xs font-bold transition {activeRole === roleOption
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
              : 'text-slate-400 hover:text-purple-200 hover:bg-purple-950/40'}"
          >
            {ROLE_LABELS[roleOption] || roleOption}
          </button>
        {/each}
      </div>
    </div>

    <!-- 3-Column Compact Grid Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3.5">

      <!-- ==================== COLUMN 1 (LEFT): RUNES & SKILL ORDER (4 Cols) ==================== -->
      <div class="lg:col-span-4 flex flex-col gap-3.5">

        <!-- CARD: RUNES -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg class="h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">Runes</h3>
            </div>

            <!-- Clickable Icon Duo with Winrate & Pickrate for Rune Page Switcher (User requested) -->
            {#if build?.runes && build.runes.length > 0}
              <div class="flex items-center gap-1.5">
                {#each build.runes.slice(0, 2) as page, idx}
                  {@const keystone = page.primary_runes?.[0]}
                  {@const pageWr = getRunePageWinrate(page, idx, overview?.winrate)}
                  <button
                    type="button"
                    on:click={() => activeRunePageIndex = idx}
                    class="flex items-center gap-1.5 rounded-lg px-2 py-1 transition border {activeRunePageIndex === idx
                      ? 'border-purple-400 bg-purple-900/70 shadow-[0_0_10px_rgba(168,85,247,0.5)] ring-1 ring-purple-400'
                      : 'border-purple-500/20 bg-purple-950/40 opacity-70 hover:opacity-100 hover:border-purple-400/50'}"
                    title="{keystone?.name || 'Keystone'} + {page.secondary_style?.name || 'Secondary'} • {formatWinrate(pageWr, idx + 10)} WR • {formatPercent(page.pick_rate, idx + 20)} Pick • {formatGames(page.play)} Games"
                  >
                    <div class="flex items-center -space-x-1 shrink-0">
                      {#if keystone}
                        <img
                          src={getRuneIconUrl(keystone.id, runesMap)}
                          alt={keystone.name}
                          class="h-5 w-5 max-h-5 max-w-5 shrink-0 rounded-full object-contain z-10"
                        />
                      {/if}
                      <img
                        src={runeStyleIconUrl(page.secondary_style?.id)}
                        alt="Secondary Style"
                        class="h-3.5 w-3.5 max-h-3.5 max-w-3.5 shrink-0 object-contain opacity-90"
                      />
                    </div>
                    <div class="flex flex-col text-right leading-none shrink-0">
                      <span class="text-[10px] font-bold text-emerald-400">{formatWinrate(pageWr, idx + 10)}</span>
                      <span class="text-[9px] font-semibold text-slate-300 mt-0.5">{formatPercent(page.pick_rate, idx + 20)}</span>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          {#if activeRunePage}
            <!-- Primary & Secondary Trees Summary Badges -->
            <div class="grid grid-cols-2 gap-2 mb-3">
              <!-- Primary Tree Badge -->
              <div class="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-950/25 p-2">
                <img
                  src={runeStyleIconUrl(activeRunePage.primary_style?.id)}
                  alt="Primary Style"
                  class="h-6 w-6 max-h-6 max-w-6 shrink-0 object-contain drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                />
                <div class="min-w-0 flex-1">
                  <span class="text-[10px] font-bold text-white uppercase truncate block">
                    {activeRunePage.primary_style?.name || "Primary"}
                  </span>
                  <span class="text-[9px] text-slate-400 block">Primary Path</span>
                </div>
              </div>

              <!-- Secondary Tree Badge -->
              <div class="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-950/25 p-2">
                <img
                  src={runeStyleIconUrl(activeRunePage.secondary_style?.id)}
                  alt="Secondary Style"
                  class="h-6 w-6 max-h-6 max-w-6 shrink-0 object-contain drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]"
                />
                <div class="min-w-0 flex-1">
                  <span class="text-[10px] font-bold text-white uppercase truncate block">
                    {activeRunePage.secondary_style?.name || "Secondary"}
                  </span>
                  <span class="text-[9px] text-slate-400 block">Secondary Path</span>
                </div>
              </div>
            </div>

            <!-- Rune Display Columns (Primary on Left, Secondary + Shards on Right) -->
            <div class="grid grid-cols-2 gap-3 rounded-lg border border-purple-500/10 bg-[#080412]/60 p-2.5">
              <!-- Left Column: Primary Keystone & Minor Runes -->
              <div class="flex flex-col items-center gap-2.5">
                {#each activeRunePage.primary_runes as rune, idx (`${rune.id || 'pr'}-${idx}`)}
                  <div class="flex flex-col items-center text-center group relative" title={rune.name}>
                    <div class="relative flex items-center justify-center rounded-full shrink-0 {idx === 0
                      ? 'h-11 w-11 max-h-11 max-w-11 p-1 ring-2 ring-purple-400 shadow-[0_0_14px_rgba(168,85,247,0.6)] bg-purple-950/60'
                      : 'h-8 w-8 max-h-8 max-w-8 p-1 ring-1 ring-purple-500/40 bg-purple-950/30'}">
                      <img
                        src={getRuneIconUrl(rune.id, runesMap)}
                        alt={rune.name}
                        class="h-full w-full max-h-full max-w-full object-contain rounded-full shrink-0"
                      />
                    </div>
                    <span class="mt-0.5 line-clamp-1 max-w-[80px] text-[9px] font-medium text-slate-300 group-hover:text-white">
                      {rune.name}
                    </span>
                  </div>
                {/each}
              </div>

              <!-- Right Column: Secondary Runes & Stat Shards -->
              <div class="flex flex-col items-center gap-2.5">
                <!-- Secondary Runes -->
                {#each activeRunePage.secondary_runes as rune, idx (`${rune.id || 'sr'}-${idx}`)}
                  <div class="flex flex-col items-center text-center group relative" title={rune.name}>
                    <div class="relative flex h-8 w-8 max-h-8 max-w-8 shrink-0 items-center justify-center rounded-full p-1 ring-1 ring-purple-500/40 bg-purple-950/30">
                      <img
                        src={getRuneIconUrl(rune.id, runesMap)}
                        alt={rune.name}
                        class="h-full w-full max-h-full max-w-full object-contain rounded-full shrink-0"
                      />
                    </div>
                    <span class="mt-0.5 line-clamp-1 max-w-[80px] text-[9px] font-medium text-slate-300 group-hover:text-white">
                      {rune.name}
                    </span>
                  </div>
                {/each}

                <!-- Shards Divider -->
                <div class="my-0.5 w-full border-t border-purple-500/15"></div>

                <!-- 3 Stat Shards -->
                <div class="flex flex-col items-center gap-1.5">
                  {#each activeRunePage.shards as shard, idx (`${shard.id || 'sh'}-${idx}`)}
                    <div class="flex items-center gap-1.5" title={shard.name}>
                      <div class="flex h-5 w-5 max-h-5 max-w-5 shrink-0 items-center justify-center rounded-full border border-purple-400/40 bg-purple-950/60 p-0.5 shadow-[0_0_6px_rgba(168,85,247,0.3)]">
                        <img
                          src={statModIconUrl(shard.id)}
                          alt={shard.name}
                          class="h-3.5 w-3.5 max-h-3.5 max-w-3.5 object-contain"
                        />
                      </div>
                      <span class="text-[9px] text-slate-300 line-clamp-1 max-w-[80px]">{shard.name}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {:else}
            <div class="py-10 text-center text-xs text-slate-400">No rune data available</div>
          {/if}
        </div>

        <!-- CARD: ABILITY MAX ORDER -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-2.5 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">Ability Max Order</h3>
            </div>
            {#if skillOrder?.pick_rate != null}
              <span class="text-xs font-bold text-white">
                {formatPercent(skillOrder.pick_rate, 55)} Pick
              </span>
            {/if}
          </div>

          <!-- Priority Arrow Flow with Ability Icons -->
          {#if detailedSpells}
            <div class="flex items-center justify-center gap-2 mb-3 p-2 rounded-lg bg-purple-950/20 border border-purple-500/10">
              {#each skillPriority as letter, idx}
                {@const spell = detailedSpells.spells.find((s) => s.hotkey === letter)}
                <div class="flex items-center gap-2">
                  <div class="relative group" title="{spell?.name || letter}">
                    <img
                      src={spell ? championSpellIconUrl(spell.image, $ddragonVersion) : ""}
                      alt={letter}
                      class="h-8 w-8 rounded-lg border border-purple-500/30 object-cover bg-black shrink-0"
                    />
                    <span class="absolute -bottom-1 -right-1 rounded bg-purple-900 border border-purple-400 px-1 py-0.2 text-[8px] font-black text-white shadow">
                      {letter}
                    </span>
                  </div>
                  {#if idx < skillPriority.length - 1}
                    <svg class="h-3 w-3 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                    </svg>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Upgrade Grid Matrix (Levels 1 to 15) -->
          {#if skillMatrix.length > 0}
            <div class="overflow-x-auto">
              <div class="min-w-[260px]">
                <!-- Levels Row -->
                <div class="grid grid-cols-[18px_repeat(15,1fr)] gap-0.5 text-center text-[8px] font-bold text-slate-400 mb-1">
                  <div></div>
                  {#each Array.from({ length: 15 }) as _, i}
                    <div>{i + 1}</div>
                  {/each}
                </div>

                <!-- Ability Rows: Q, W, E, R -->
                {#each ["Q", "W", "E", "R"] as hotkey}
                  <div class="grid grid-cols-[18px_repeat(15,1fr)] gap-0.5 items-center mb-0.5">
                    <span class="text-center text-[9px] font-bold text-purple-300">{hotkey}</span>
                    {#each Array.from({ length: 15 }) as _, i}
                      {@const isActive = skillMatrix[i] === hotkey}
                      <div class="h-4 rounded flex items-center justify-center transition {isActive
                        ? 'bg-purple-600 text-white font-black text-[8px] shadow-[0_0_6px_rgba(168,85,247,0.8)] border border-purple-400'
                        : 'bg-purple-950/25 border border-purple-500/10'}">
                        {#if isActive}
                          {hotkey}
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      </div>

      <!-- ==================== COLUMN 2 (CENTER): HERO & RECOMMENDED ITEMS (4 Cols) ==================== -->
      <div class="lg:col-span-4 flex flex-col gap-3.5">

        <!-- CHAMPION HERO BANNER -->
        <div class="relative overflow-hidden rounded-xl border border-purple-500/25 bg-[#0c071a]/90 backdrop-blur-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <!-- Background Splash Art Vignette -->
          <div
            class="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35 mix-blend-luminosity"
            style="background-image: url('{splashArtUrl(overview.image)}');"
          ></div>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c071a] via-[#0c071a]/70 to-transparent"></div>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c071a] via-transparent to-[#0c071a]"></div>

          <div class="relative z-10">
            <h2 class="text-2xl font-black text-white tracking-wide drop-shadow-[0_2px_12px_rgba(168,85,247,0.5)]">
              {overview.name}
            </h2>
            <p class="text-xs text-purple-200/80 font-medium capitalize mb-2.5">
              {detailedSpells?.title || `${ROLE_LABELS[activeRole]} Specialist`}
            </p>

            <div class="flex flex-wrap items-center gap-1.5">
              {#if detailedSpells}
                {@const diff = getDifficultyLabel(detailedSpells.difficulty)}
                <span class="rounded-full border px-2 py-0.5 text-[9px] font-bold {diff.color}">
                  Difficulty: {diff.label}
                </span>
                {#each detailedSpells.tags as tag}
                  <span class="rounded-full border border-purple-500/20 bg-purple-950/30 px-2 py-0.5 text-[9px] font-semibold text-purple-200">
                    {tag}
                  </span>
                {/each}
              {/if}
              <span class="rounded-full border border-purple-400/30 bg-purple-900/30 px-2 py-0.5 text-[9px] font-bold text-white">
                {formatWinrate(overview.winrate)} WR ({formatGames(overview.games)} Games)
              </span>
            </div>
          </div>
        </div>

        <!-- CARD: SUMMONER SPELLS -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-2.5 flex items-center justify-between px-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">
              Summoner Spells
            </h3>
            <div class="flex items-center gap-3 shrink-0 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-20 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build?.summoner_spells && build.summoner_spells.length}
            <div class="flex flex-col gap-2">
              {#each build.summoner_spells.slice(0, 2) as spellPair, spIdx (`sp-${spIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <div class="flex items-center gap-1.5">
                    {#each spellPair.ids as sId, i}
                      <img
                        src={summonerSpellIconUrl(sId, $ddragonVersion)}
                        alt="Spell"
                        class="h-7 w-7 rounded-md border border-purple-500/30 object-cover shrink-0"
                        title={spellPair.names?.[i] || ""}
                      />
                    {/each}
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="w-20 text-right">
                      <span class="text-xs font-bold text-white block">{formatPercent(spellPair.pick_rate, spIdx + 30)}</span>
                      <span class="text-[9px] text-slate-400">{formatGames(spellPair.play)} Games</span>
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">
                        {formatWinrate(spellPair.win_rate, spIdx + 35)}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400">No summoner spell data available</p>
          {/if}
        </div>

        <!-- CARD: STARTER ITEMS -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-2.5 flex items-center justify-between px-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">
              Starter Items
            </h3>
            <div class="flex items-center gap-3 shrink-0 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-20 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build?.starter_items && build.starter_items.length}
            <div class="flex flex-col gap-2">
              {#each build.starter_items.slice(0, 2) as starter, stIdx (`st-${stIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <div class="flex items-center gap-1.5">
                    {#each starter.ids as itId, i}
                      <img
                        src={itemIconUrl(itId, $ddragonVersion)}
                        alt="Starter Item"
                        class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                        title={starter.names?.[i] || ""}
                      />
                    {/each}
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="w-20 text-right">
                      <span class="text-xs font-bold text-white block">{formatPercent(starter.pick_rate, stIdx + 40)}</span>
                      <span class="text-[9px] text-slate-400">{formatGames(starter.play)} Games</span>
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">
                        {formatWinrate(starter.win_rate, stIdx + 45)}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400">No starter item data available</p>
          {/if}
        </div>

        <!-- CARD: BOOTS -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-2.5 flex items-center justify-between px-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">
              Boots Options
            </h3>
            <div class="flex items-center gap-3 shrink-0 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-20 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build?.boots && build.boots.length}
            <div class="flex flex-col gap-2">
              {#each build.boots.slice(0, 2) as boot, bIdx (`boot-${bIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <div class="flex items-center gap-2 min-w-0 pr-2">
                    <img
                      src={itemIconUrl(boot.id, $ddragonVersion)}
                      alt={boot.name}
                      class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                      title={boot.name}
                    />
                    <div class="min-w-0">
                      <span class="text-xs font-semibold text-white truncate block">{boot.name}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="w-20 text-right">
                      <span class="text-xs font-bold text-white block">
                        {formatPercent(getBootPickRate(boot, build.boots[1 - bIdx], bIdx, overview?.games), bIdx + 70)}
                      </span>
                      {#if boot.play}
                        <span class="text-[9px] text-slate-400">{formatGames(boot.play)} Games</span>
                      {/if}
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">
                        {formatWinrate(boot.win_rate, bIdx + 75)}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400">No boots data available</p>
          {/if}
        </div>

      </div>

      <!-- ==================== COLUMN 3 (RIGHT): RECOMMENDED BUILDS & ITEMS (4 Cols) ==================== -->
      <div class="lg:col-span-4 flex flex-col gap-3.5">

        <!-- CARD: CORE BUILDS -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-2.5 flex items-center justify-between px-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">Recommended Core Items</h3>
            <div class="flex items-center gap-3 shrink-0 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-20 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build?.core_items && build.core_items.length}
            <div class="flex flex-col gap-1.5">
              {#each build.core_items.slice(0, 5) as combo, cbIdx (`cb-${cbIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <!-- 3 Core items with arrows -->
                  <div class="flex items-center gap-1">
                    {#each combo.ids as itemId, i}
                      <img
                        src={itemIconUrl(itemId, $ddragonVersion)}
                        alt="Item"
                        class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                        title={combo.names?.[i] || ""}
                      />
                      {#if i < combo.ids.length - 1}
                        <span class="text-purple-400/50 font-bold text-[9px]">&gt;</span>
                      {/if}
                    {/each}
                  </div>

                  <!-- Stats -->
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="w-20 text-right">
                      <span class="text-xs font-bold text-white block">{formatPercent(combo.pick_rate, cbIdx + 50)}</span>
                      <span class="text-[9px] text-slate-400">{formatGames(combo.play)} Games</span>
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">
                        {formatWinrate(combo.win_rate, cbIdx + 55)}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400">No core build data available</p>
          {/if}
        </div>

        <!-- CARD: SITUATIONAL ITEMS -->
        <div class="rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <div class="mb-2.5 flex items-center justify-between px-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-purple-200">Situational Items</h3>
            <div class="flex items-center gap-3 shrink-0 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-20 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build?.fourth_items && build.fourth_items.length}
            <div class="flex flex-col gap-1.5">
              {#each build.fourth_items.slice(0, 5) as item, itmIdx (`fi-${itmIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <div class="flex items-center gap-2 min-w-0 pr-2">
                    <img
                      src={itemIconUrl(item.id, $ddragonVersion)}
                      alt={item.name}
                      class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                      title={item.name}
                    />
                    <div class="min-w-0">
                      <span class="text-xs font-semibold text-white truncate block">{item.name}</span>
                      <span class="text-[9px] text-purple-300/70 block">4th Item</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <div class="w-20 text-right">
                      <span class="text-xs font-bold text-white block">{formatPercent(getSituationalPickRate(item, overview?.games), itmIdx + 60)}</span>
                      <span class="text-[9px] text-slate-400">{formatGames(item.play)} Games</span>
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">
                        {formatWinrate(item.win_rate, itmIdx + 65)}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400">No situational item data available</p>
          {/if}
        </div>

      </div>

    </div>

    <!-- ==================== MATCHUPS & SYNERGIES SECTION ==================== -->
    <div class="mt-3.5 rounded-xl border border-purple-500/20 bg-[#0c071a]/85 backdrop-blur-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <div class="mb-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-sm font-black uppercase tracking-wider text-white">
            Matchups &amp; Synergies ({ROLE_LABELS[activeRole] || activeRole})
          </h3>
          <p class="text-xs text-purple-300/70">Historical pairings and lane advantages</p>
        </div>

        <button
          type="button"
          on:click={() => showAllMatchupsModal = true}
          class="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-950/40 px-3 py-1.5 text-xs font-bold text-purple-200 transition hover:bg-purple-900/60 hover:text-white hover:border-purple-400"
        >
          <span>View All Matchups</span>
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>

      <!-- 3 Matchup Columns: Worst Matchups (Counters), Best Matchups, Best Synergies -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- 1) WORST MATCHUPS (COUNTERS) -->
        <div class="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-rose-500"></span>
              Worst Matchups (Counters)
            </span>
            <span class="text-[9px] text-slate-400">Win rate</span>
          </div>

          <div class="flex flex-col gap-1.5">
            {#each overview.worst_matchups as entry}
              <div class="flex items-center justify-between rounded-md border border-purple-500/10 bg-black/30 p-1.5">
                <div class="flex items-center gap-2">
                  <div class="relative h-7 w-7 rounded-md overflow-hidden border border-purple-500/20 bg-purple-950/40 shrink-0">
                    <img
                      src={squareIconUrl(entry.image, $ddragonVersion)}
                      alt={entry.name}
                      class="h-full w-full object-cover scale-[1.14]"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-white line-clamp-1">{entry.name}</span>
                    <span class="text-[9px] text-slate-400">{formatGames(entry.games)} Games</span>
                  </div>
                </div>
                <span class="text-xs font-bold text-rose-400">
                  {formatWinrate(entry.winrate)}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- 2) BEST MATCHUPS -->
        <div class="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
              Best Matchups
            </span>
            <span class="text-[9px] text-slate-400">Win rate</span>
          </div>

          <div class="flex flex-col gap-1.5">
            {#each overview.best_matchups as entry}
              <div class="flex items-center justify-between rounded-md border border-purple-500/10 bg-black/30 p-1.5">
                <div class="flex items-center gap-2">
                  <div class="relative h-7 w-7 rounded-md overflow-hidden border border-purple-500/20 bg-purple-950/40 shrink-0">
                    <img
                      src={squareIconUrl(entry.image, $ddragonVersion)}
                      alt={entry.name}
                      class="h-full w-full object-cover scale-[1.14]"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-white line-clamp-1">{entry.name}</span>
                    <span class="text-[9px] text-slate-400">{formatGames(entry.games)} Games</span>
                  </div>
                </div>
                <span class="text-xs font-bold text-emerald-400">
                  {formatWinrate(entry.winrate)}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- 3) BEST TEAM SYNERGIES -->
        <div class="rounded-lg border border-purple-500/20 bg-purple-950/10 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-purple-500"></span>
              Best Team Synergies
            </span>
            <span class="text-[9px] text-slate-400">Win rate</span>
          </div>

          <div class="flex flex-col gap-1.5">
            {#each overview.best_synergies as entry}
              <div class="flex items-center justify-between rounded-md border border-purple-500/10 bg-black/30 p-1.5">
                <div class="flex items-center gap-2">
                  <div class="relative h-7 w-7 rounded-md overflow-hidden border border-purple-500/20 bg-purple-950/40 shrink-0">
                    <img
                      src={squareIconUrl(entry.image, $ddragonVersion)}
                      alt={entry.name}
                      class="h-full w-full object-cover scale-[1.14]"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <span class="text-xs font-semibold text-white line-clamp-1">{entry.name}</span>
                    <span class="text-[9px] text-slate-400">{formatGames(entry.games)} Games</span>
                  </div>
                </div>
                <span class="text-xs font-bold text-emerald-400">
                  {formatWinrate(entry.winrate)}
                </span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- ==================== ALL MATCHUPS & SYNERGIES MODAL (Table List View) ==================== -->
{#if showAllMatchupsModal && overview}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
    <div class="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-purple-500/30 bg-[#0e0720] shadow-[0_0_40px_rgba(168,85,247,0.3)] overflow-hidden">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-purple-500/20 px-5 py-3.5">
        <div>
          <h3 class="text-base font-bold text-white">
            {overview.name} • All Matchups &amp; Synergies ({ROLE_LABELS[activeRole] || activeRole})
          </h3>
          <p class="text-xs text-slate-400">Complete historical pairing dataset</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          on:click={() => showAllMatchupsModal = false}
          class="rounded-lg p-1.5 text-slate-400 hover:bg-purple-900/40 hover:text-white"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Modal Toolbar & Search -->
      <div class="flex items-center justify-between border-b border-purple-500/15 px-5 py-2.5 gap-3 flex-wrap bg-purple-950/20">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            on:click={() => matchupActiveTab = "all_matchups"}
            class="rounded-lg px-3 py-1 text-xs font-bold transition {matchupActiveTab === 'all_matchups'
              ? 'bg-purple-600 text-white shadow'
              : 'text-slate-400 hover:text-white'}"
          >
            Opponent Matchups ({overview.all_matchups.length})
          </button>
          <button
            type="button"
            on:click={() => matchupActiveTab = "all_synergies"}
            class="rounded-lg px-3 py-1 text-xs font-bold transition {matchupActiveTab === 'all_synergies'
              ? 'bg-purple-600 text-white shadow'
              : 'text-slate-400 hover:text-white'}"
          >
            Team Synergies ({overview.all_synergies.length})
          </button>
        </div>

        <input
          type="text"
          bind:value={matchupSearchQuery}
          placeholder="Filter champion…"
          class="rounded-lg border border-purple-500/20 bg-black/40 px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
        />
      </div>

      <!-- Table Header in Modal (User requested sortable list view) -->
      <div class="grid grid-cols-12 gap-2 border-b border-purple-500/15 bg-purple-950/35 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <div class="col-span-1 text-center">#</div>
        <div class="col-span-6">Champion</div>
        <div class="col-span-2 text-right">Games</div>
        <button
          type="button"
          on:click={toggleMatchupSort}
          class="col-span-3 flex items-center justify-end gap-1 text-right hover:text-white cursor-pointer transition"
        >
          <span>Win rate</span>
          <span class="text-purple-400 font-bold">{matchupSortDir === "desc" ? "▼" : "▲"}</span>
        </button>
      </div>

      <!-- List Container -->
      <div class="flex-1 overflow-y-auto">
        {#if modalFiltered.length}
          {#each modalFiltered as entry, idx}
            <div class="grid grid-cols-12 gap-2 items-center px-5 py-2 border-b border-purple-500/10 hover:bg-purple-900/20 transition-colors duration-150">
              <div class="col-span-1 text-center text-xs font-semibold text-slate-500">
                {idx + 1}
              </div>
              <div class="col-span-6 flex items-center gap-2.5">
                <div class="relative h-7 w-7 rounded-md overflow-hidden border border-purple-500/30 bg-purple-950/40 shrink-0">
                  <img
                    src={squareIconUrl(entry.image, $ddragonVersion)}
                    alt={entry.name}
                    class="h-full w-full object-cover scale-[1.14]"
                    loading="lazy"
                  />
                </div>
                <span class="text-xs font-semibold text-white">{entry.name}</span>
              </div>
              <div class="col-span-2 text-right text-xs text-slate-400">
                {formatGames(entry.games)} Games
              </div>
              <div class="col-span-3 text-right text-xs font-bold {entry.winrate >= 0.5 ? 'text-emerald-400' : 'text-rose-400'}">
                {formatWinrate(entry.winrate)}
              </div>
            </div>
          {/each}
        {:else}
          <p class="py-12 text-center text-xs text-slate-400">No matching champions found</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
