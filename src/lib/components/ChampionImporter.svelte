<script lang="ts">
  import { onMount } from "svelte";
  import type { Role, ChampionBuildStats, RunePageStats, SummonerSpellStats } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import {
    getChampionBuild,
    importRunePage,
    importSummonerSpells,
    importItemSet,
    isTauri,
  } from "../ipc/tauri";
  import {
    loadFullRuneStyles,
    type RuneTreeStyle,
    statModIconUrl,
    itemIconUrl,
    summonerSpellIconUrl,
    runeStyleIconUrl,
    splashArtUrl,
    squareIconUrl,
    getRuneIconUrl,
    roleIconUrl,
    STAT_SHARD_ROWS,
  } from "../utils/ddragon";

  export let championId: number;
  export let role: Role | null = null;

  let loading = true;
  let build: ChampionBuildStats | null = null;
  let runeStyles: RuneTreeStyle[] = [];

  let activeRunePageIndex = 0;
  let activeSpellIndex = 0;

  $: isSupport = role === "support";
  $: supportItems = isSupport && build?.support_items && build.support_items.length > 0 ? build.support_items : null;
  $: displayedStarterItemRow = supportItems?.[0] || build?.starter_items?.[0] || null;

  // Persisted Auto-Import Toggles
  let autoImportRunes = localStorage.getItem("rift_auto_import_runes") !== "false";
  let autoImportSpells = localStorage.getItem("rift_auto_import_spells") !== "false";
  let autoImportItems = localStorage.getItem("rift_auto_import_items") !== "false";

  // Flash Key Preference ("D" or "F", default "F")
  let flashKey: "D" | "F" = (localStorage.getItem("rift_flash_key") as "D" | "F") || "F";

  function setFlashKey(key: "D" | "F") {
    flashKey = key;
    localStorage.setItem("rift_flash_key", key);
    showFeedback(`✓ Flash preference: key ${key}`);
    if (autoImportSpells && build?.summoner_spells?.[activeSpellIndex]) {
      void executeImportSpells(activeSpellIndex);
    }
  }

  function getOrderedSpells(pairIds: number[], currentKey: "D" | "F"): number[] {
    if (!pairIds || pairIds.length < 2) return pairIds;
    const hasFlash = pairIds.includes(4);
    if (!hasFlash) {
      // If neither spell is Flash (e.g. Yuumi, Shaco), preserve original order
      return [...pairIds];
    }
    const other = pairIds.find((id) => id !== 4) ?? pairIds[0];
    if (currentKey === "D") {
      return [4, other];
    } else {
      return [other, 4];
    }
  }

  let feedbackMessage: string | null = null;
  let feedbackTimeout: number | null = null;

  function showFeedback(msg: string) {
    feedbackMessage = msg;
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackTimeout = window.setTimeout(() => {
      feedbackMessage = null;
    }, 2400);
  }

  function toggleRunes() {
    autoImportRunes = !autoImportRunes;
    localStorage.setItem("rift_auto_import_runes", String(autoImportRunes));
    if (autoImportRunes && build?.runes?.[activeRunePageIndex]) {
      void executeImportRunePage(activeRunePageIndex);
    }
  }

  function toggleSpells() {
    autoImportSpells = !autoImportSpells;
    localStorage.setItem("rift_auto_import_spells", String(autoImportSpells));
    if (autoImportSpells && build?.summoner_spells?.[activeSpellIndex]) {
      void executeImportSpells(activeSpellIndex);
    }
  }

  function toggleItems() {
    autoImportItems = !autoImportItems;
    localStorage.setItem("rift_auto_import_items", String(autoImportItems));
    if (autoImportItems && build) {
      void executeImportItems();
    }
  }

  $: champInfo = $championCatalog.get(championId);
  $: champName = champInfo?.name ?? `Champion ${championId}`;

  let lastImportedChampId: number | null = null;

  async function loadData() {
    if (!championId) return;
    loading = true;
    try {
      const [buildData, styles] = await Promise.all([
        getChampionBuild(championId, role || undefined),
        loadFullRuneStyles($ddragonVersion),
      ]);
      build = buildData;
      runeStyles = styles;
      loading = false;

      // On initial lock-in of this champion, auto-import if toggles are enabled
      if (lastImportedChampId !== championId) {
        lastImportedChampId = championId;
        if (autoImportRunes && build?.runes && build.runes.length > 0) {
          void executeImportRunePage(0);
        }
        if (autoImportSpells && build?.summoner_spells && build.summoner_spells.length > 0) {
          void executeImportSpells(0);
        }
        if (autoImportItems && build) {
          void executeImportItems();
        }
      }
    } catch (err) {
      console.error("Failed to load champion build for importer", err);
      loading = false;
    }
  }

  $: if (championId) {
    void loadData();
  }

  $: activeRunePage = build?.runes?.[activeRunePageIndex] || build?.runes?.[0] || null;

  $: primaryStyle = activeRunePage?.primary_style?.id
    ? runeStyles.find((s) => s.id === activeRunePage.primary_style?.id)
    : null;

  $: secondaryStyle = activeRunePage?.secondary_style?.id
    ? runeStyles.find((s) => s.id === activeRunePage.secondary_style?.id)
    : null;

  $: primarySelectedSet = new Set((activeRunePage?.primary_runes || []).map((r) => r.id));
  $: secondarySelectedSet = new Set((activeRunePage?.secondary_runes || []).map((r) => r.id));
  $: shardsSelectedList = (activeRunePage?.shards || []).map((s) => s.id);

  async function executeImportRunePage(pageIdx: number) {
    activeRunePageIndex = pageIdx;
    const page = build?.runes?.[pageIdx];
    const primaryStyleId = page?.primary_style?.id;
    const secondaryStyleId = page?.secondary_style?.id;
    if (!page || !primaryStyleId || !secondaryStyleId) return;

    if (!autoImportRunes) {
      // Toggle is OFF -> Only viewing/switching page, no import
      return;
    }

    try {
      const perkIds = [
        ...page.primary_runes.map((r) => r.id),
        ...page.secondary_runes.map((r) => r.id),
        ...page.shards.map((r) => r.id),
      ].filter((id): id is number => typeof id === "number");
      await importRunePage(
        `Rift: ${champName}`,
        primaryStyleId,
        secondaryStyleId,
        perkIds,
      );
      showFeedback(`✓ Runes imported: Page ${pageIdx + 1}`);
    } catch (err) {
      console.warn("Failed to import rune page", err);
      showFeedback("⚠️ Runes import failed (LCU)");
    }
  }

  async function executeImportSpells(spellIdx: number) {
    activeSpellIndex = spellIdx;
    const pair = build?.summoner_spells?.[spellIdx];
    if (!pair || pair.ids.length < 2) return;

    if (!autoImportSpells) {
      // Toggle is OFF -> Only viewing/switching spells, no import
      return;
    }

    const ordered = getOrderedSpells(pair.ids, flashKey);
    try {
      await importSummonerSpells(ordered[0], ordered[1]);
      showFeedback(`✓ Spells imported (Flash on ${flashKey})`);
    } catch (err) {
      console.warn("Failed to import summoner spells", err);
      showFeedback("⚠️ Spells import failed (LCU)");
    }
  }

  async function executeImportItems() {
    if (!build) return;
    const starterIds = (isSupport && build.support_items?.[0]?.ids?.length)
      ? [3865, ...build.support_items[0].ids]
      : (build.starter_items?.[0]?.ids || []);
    const coreIds = build.core_items?.[0]?.ids || [];
    const situationalIds = (build.fourth_items || []).slice(0, 6).map((it) => it.id);

    if (starterIds.length === 0 && coreIds.length === 0 && situationalIds.length === 0) {
      showFeedback("⚠️ No item data available to import");
      return;
    }

    try {
      await importItemSet(championId, champName, starterIds, coreIds, situationalIds);
      showFeedback(`✓ Item Set created for ${champName}`);
    } catch (err) {
      console.warn("Failed to import item set", err);
      showFeedback("⚠️ Item Set import failed (LCU)");
    }
  }

  function getCdnImgUrl(path: string): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
  }

  // Format winrate
  function formatWr(val?: number): string {
    if (val == null) return "50.0%";
    const pct = val > 1 ? val : val * 100;
    return `${pct.toFixed(1)}%`;
  }

  // Format games
  function formatGames(val?: number): string {
    if (val == null) return "";
    return `${val.toLocaleString()} GAMES`;
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-purple-500/20 bg-void-950/40 backdrop-blur-md">
  <!-- Subtle Champion Splash Art Background -->
  {#if champInfo?.key}
    <div
      class="pointer-events-none absolute inset-0 bg-cover bg-right-top opacity-10 filter blur-[1px]"
      style="background-image: url('{splashArtUrl(champInfo.key)}');"
    ></div>
  {/if}

  <!-- Toast Notification Badge -->
  {#if feedbackMessage}
    <div class="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-950/90 px-3 py-1 text-xs font-bold text-purple-200 shadow-xl backdrop-blur-md animate-fade-in">
      <span>{feedbackMessage}</span>
    </div>
  {/if}

  <!-- Header Bar: Champion Info & Role Icon -->
  <div class="relative z-10 flex items-center px-3 py-1.5 border-b border-purple-500/15 bg-void-950/60 shrink-0">
    <div class="flex items-center gap-2">
      {#if champInfo?.key}
        <img
          src={squareIconUrl(champInfo.key, $ddragonVersion)}
          alt={champName}
          class="h-6 w-6 rounded-md object-cover ring-1 ring-purple-400/40 shadow-sm"
        />
      {/if}
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-black text-white">{champName}</span>
        {#if role}
          <img
            src={roleIconUrl(role)}
            alt={role}
            class="h-4 w-4 object-contain filter brightness-125 ml-0.5"
            title={role.toUpperCase()}
          />
        {/if}
      </div>
    </div>
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-2 text-xs text-purple-300">
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-purple-400 border-t-transparent"></span>
        <span>Loading build recommendations…</span>
      </div>
    </div>
  {:else}
    <div class="relative z-10 flex min-h-0 flex-1 divide-x divide-purple-500/15 overflow-hidden">
      <!-- ==================== LEFT COLUMN: RUNES ==================== -->
      <div class="flex min-h-0 flex-1 flex-col p-3 overflow-y-auto">
        <!-- Runes Header with Toggle -->
        <div class="mb-2 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black tracking-wide text-purple-200 uppercase">Runes</span>
          </div>

          <!-- Runes Auto-Import Toggle -->
          <button
            type="button"
            on:click={toggleRunes}
            class="group inline-flex items-center gap-1.5 text-xs cursor-pointer select-none"
            title={autoImportRunes ? "Auto-import is ON (Click to disable)" : "Auto-import is OFF (Click to enable)"}
          >
            <span class="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300">
              {autoImportRunes ? "Auto-Import" : "View Only"}
            </span>
            <div class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 {autoImportRunes ? 'bg-emerald-500' : 'bg-slate-700'}">
              <span class="inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 {autoImportRunes ? 'translate-x-3.5' : 'translate-x-0.5'}"></span>
            </div>
          </button>
        </div>

        <!-- 2 Clickable Rune Page Cards -->
        {#if build?.runes && build.runes.length > 0}
          <div class="mb-2.5 grid grid-cols-2 gap-2 shrink-0">
            {#each build.runes.slice(0, 2) as page, idx}
              {@const keystone = page.primary_runes?.[0]}
              {@const isSelected = activeRunePageIndex === idx}
              <button
                type="button"
                on:click={() => executeImportRunePage(idx)}
                class="flex items-center justify-between rounded-xl p-2 transition-all border text-left cursor-pointer {isSelected
                  ? 'border-purple-400/80 bg-purple-900/40 ring-1 ring-purple-400 shadow-md'
                  : 'border-purple-500/20 bg-void-950/30 hover:border-purple-400/40 hover:bg-purple-950/20'}"
              >
                <div class="flex items-center gap-2">
                  <div class="relative flex h-10 w-10 items-center justify-center rounded-full bg-void-950/70 p-0.5 ring-1 {isSelected ? 'ring-purple-400' : 'ring-purple-500/30'} shrink-0">
                    {#if keystone}
                      <img
                        src={getRuneIconUrl(keystone.id)}
                        alt={keystone.name || "Keystone"}
                        class="h-full w-full object-contain"
                      />
                    {/if}
                    <img
                      src={runeStyleIconUrl(page.secondary_style?.id)}
                      alt="Substyle"
                      class="absolute -bottom-1 -right-1 h-4 w-4 object-contain rounded-full bg-void-950 ring-1 ring-purple-500/40"
                    />
                  </div>
                </div>

                <div class="flex flex-col items-end leading-tight shrink-0">
                  <span class="text-xs font-black text-emerald-400">
                    {formatWr(page.win_rate)}
                  </span>
                  {#if page.play}
                    <span class="text-[9px] font-semibold text-slate-400 tracking-wider">
                      {formatGames(page.play)}
                    </span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}

        <!-- Interactive Full Rune Tree Display -->
        {#if activeRunePage && primaryStyle}
          <div class="flex flex-1 items-start justify-center gap-7 overflow-y-auto py-1">
            <!-- Primary Tree -->
            <div class="flex flex-col items-center gap-2">
              <!-- Primary 5 Styles Bar -->
              <div class="flex items-center gap-2 pb-1.5 border-b border-purple-500/15">
                {#each runeStyles as s (s.id)}
                  {@const isActiveStyle = s.id === primaryStyle.id}
                  <img
                    src={runeStyleIconUrl(s.id)}
                    alt={s.name}
                    class="h-5.5 w-5.5 object-contain transition-all {isActiveStyle
                      ? 'scale-110 filter brightness-125 opacity-100 ring-1 ring-purple-400/60 rounded-full'
                      : 'opacity-25 grayscale'}"
                    title={s.name}
                  />
                {/each}
              </div>

              <!-- Primary Slots (Keystone + 3 Minor Rows) -->
              {#each primaryStyle.slots as slot, slotIdx}
                <div class="flex items-center gap-2">
                  {#each slot.runes as rune (rune.id)}
                    {@const isRuneSelected = primarySelectedSet.has(rune.id)}
                    <div
                      class="relative flex items-center justify-center rounded-full transition-all {slotIdx === 0
                        ? 'h-11 w-11'
                        : 'h-8 w-8'} {isRuneSelected
                        ? (slotIdx === 0
                            ? 'ring-2 ring-purple-400 bg-purple-950/70 shadow-md scale-110'
                            : 'ring-1 ring-purple-400 bg-purple-900/60 shadow-sm scale-105')
                        : 'opacity-25 grayscale hover:opacity-50'}"
                      title={rune.name}
                    >
                      <img
                        src={getCdnImgUrl(rune.icon)}
                        alt={rune.name}
                        class="h-full w-full object-contain rounded-full"
                      />
                    </div>
                  {/each}
                </div>
              {/each}
            </div>

            <!-- Secondary Tree & Shards -->
            <div class="flex flex-col items-center gap-2">
              {#if secondaryStyle}
                <!-- Secondary 5 Styles Bar -->
                <div class="flex items-center gap-2 pb-1.5 border-b border-purple-500/15">
                  {#each runeStyles as s (s.id)}
                    {@const isActiveStyle = s.id === secondaryStyle.id}
                    <img
                      src={runeStyleIconUrl(s.id)}
                      alt={s.name}
                      class="h-5.5 w-5.5 object-contain transition-all {isActiveStyle
                        ? 'scale-110 filter brightness-125 opacity-100 ring-1 ring-purple-400/60 rounded-full'
                        : 'opacity-25 grayscale'}"
                      title={s.name}
                    />
                  {/each}
                </div>

                <!-- Secondary Slots (Slots 1, 2, 3 - without keystone) -->
                {#each secondaryStyle.slots.slice(1) as slot}
                  <div class="flex items-center gap-2">
                    {#each slot.runes as rune (rune.id)}
                      {@const isRuneSelected = secondarySelectedSet.has(rune.id)}
                      <div
                        class="relative flex h-8 w-8 items-center justify-center rounded-full transition-all {isRuneSelected
                          ? 'ring-1 ring-purple-400 bg-purple-900/60 shadow-sm scale-105'
                          : 'opacity-25 grayscale hover:opacity-50'}"
                        title={rune.name}
                      >
                        <img
                          src={getCdnImgUrl(rune.icon)}
                          alt={rune.name}
                          class="h-full w-full object-contain rounded-full"
                        />
                      </div>
                    {/each}
                  </div>
                {/each}
              {/if}

              <!-- Shards Divider -->
              <div class="w-full border-t border-purple-500/15 my-0.5"></div>

              <!-- 3 Rows of Stat Shards -->
              {#each STAT_SHARD_ROWS as row, rowIdx}
                <div class="flex items-center gap-2">
                  {#each row as shard}
                    {@const isShardSelected = shardsSelectedList[rowIdx] === shard.id}
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-full p-0.5 transition-all {isShardSelected
                        ? 'border border-amber-400/80 bg-amber-500/20 ring-1 ring-amber-400/60 scale-110'
                        : 'opacity-25 grayscale hover:opacity-50'}"
                      title={shard.name}
                    >
                      <img
                        src={statModIconUrl(shard.id)}
                        alt={shard.name}
                        class="h-4 w-4 object-contain"
                      />
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- ==================== RIGHT COLUMN: SUMMONER SPELLS & ITEMS ==================== -->
      <div class="flex min-h-0 flex-1 flex-col p-3 overflow-y-auto gap-3">
        <!-- SUMMONER SPELLS SECTION -->
        <div class="flex flex-col gap-2 shrink-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-black tracking-wide text-purple-200 uppercase">Summoner Spells</span>

              <!-- Flash Key Selector (D or F) -->
              <div class="inline-flex items-center gap-0.5 rounded-lg border border-purple-500/25 bg-void-950/60 p-0.5 text-[10px]">
                <span class="text-[9px] text-slate-400 font-semibold px-1">Flash:</span>
                <button
                  type="button"
                  on:click={() => setFlashKey("D")}
                  class="rounded px-1.5 py-0.5 font-black text-[10px] transition-colors cursor-pointer {flashKey === 'D'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'}"
                  title="Place Flash on key D"
                >
                  D
                </button>
                <button
                  type="button"
                  on:click={() => setFlashKey("F")}
                  class="rounded px-1.5 py-0.5 font-black text-[10px] transition-colors cursor-pointer {flashKey === 'F'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'}"
                  title="Place Flash on key F"
                >
                  F
                </button>
              </div>
            </div>

            <!-- Spells Auto-Import Toggle -->
            <button
              type="button"
              on:click={toggleSpells}
              class="group inline-flex items-center gap-1.5 text-xs cursor-pointer select-none"
              title={autoImportSpells ? "Auto-import is ON (Click to disable)" : "Auto-import is OFF (Click to enable)"}
            >
              <span class="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300">
                {autoImportSpells ? "Auto-Import" : "View Only"}
              </span>
              <div class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 {autoImportSpells ? 'bg-emerald-500' : 'bg-slate-700'}">
                <span class="inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 {autoImportSpells ? 'translate-x-3.5' : 'translate-x-0.5'}"></span>
              </div>
            </button>
          </div>

          <!-- 2 Spell Combo Rows -->
          {#if build?.summoner_spells && build.summoner_spells.length > 0}
            <div class="flex flex-col gap-1.5">
              {#each build.summoner_spells.slice(0, 2) as pair, sIdx (`${pair.ids.join('-')}-${flashKey}`)}
                {@const isSelected = activeSpellIndex === sIdx}
                {@const ordered = getOrderedSpells(pair.ids, flashKey)}
                <button
                  type="button"
                  on:click={() => executeImportSpells(sIdx)}
                  class="flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-all border text-left cursor-pointer {isSelected
                    ? 'border-purple-400/80 bg-purple-900/40 ring-1 ring-purple-400 shadow-sm'
                    : 'border-purple-500/20 bg-void-950/30 hover:border-purple-400/40 hover:bg-purple-950/20'}"
                >
                  <div class="flex items-center gap-2">
                    <!-- Slot 1 (D) -->
                    <div class="relative">
                      <img
                        src={summonerSpellIconUrl(ordered[0], $ddragonVersion)}
                        alt="Spell D"
                        class="h-7 w-7 rounded-md object-cover ring-1 {isSelected ? 'ring-purple-400/80' : 'ring-white/10'}"
                      />
                      <span class="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded bg-void-950/90 text-[8px] font-black text-purple-300 ring-1 ring-purple-500/40">
                        D
                      </span>
                    </div>

                    <!-- Slot 2 (F) -->
                    <div class="relative">
                      <img
                        src={summonerSpellIconUrl(ordered[1], $ddragonVersion)}
                        alt="Spell F"
                        class="h-7 w-7 rounded-md object-cover ring-1 {isSelected ? 'ring-purple-400/80' : 'ring-white/10'}"
                      />
                      <span class="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded bg-void-950/90 text-[8px] font-black text-purple-300 ring-1 ring-purple-500/40">
                        F
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-emerald-400">
                      {formatWr(pair.win_rate)}
                    </span>
                    {#if pair.play}
                      <span class="text-[9px] font-semibold text-slate-400">
                        {formatGames(pair.play)}
                      </span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- ITEMS SECTION -->
        <div class="flex flex-col gap-2 shrink-0 border-t border-purple-500/15 pt-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black tracking-wide text-purple-200 uppercase">Items</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                on:click={executeImportItems}
                class="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-600/30 px-2 py-0.5 text-[10px] font-bold text-purple-200 transition-all hover:bg-purple-600/50 hover:text-white active:scale-95 cursor-pointer shadow-sm"
                title="Create or update custom in-game Item Set for {champName}"
              >
                <span>Import Set</span>
              </button>
              <button
                type="button"
                on:click={toggleItems}
                title={autoImportItems ? "Auto-import is ON (Click to disable)" : "Auto-import is OFF (Click to enable)"}
                aria-label="Toggle auto-import items"
                class="group inline-flex items-center gap-1.5 text-xs cursor-pointer select-none"
              >
                <span class="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300">
                  {autoImportItems ? "Auto-Import" : "View Only"}
                </span>
                <div class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 {autoImportItems ? 'bg-emerald-500' : 'bg-slate-700'}">
                  <span class="inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 {autoImportItems ? 'translate-x-3.5' : 'translate-x-0.5'}"></span>
                </div>
              </button>
            </div>
          </div>

          <!-- Starting Items / Support Items -->
          {#if displayedStarterItemRow}
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {isSupport ? "Support Items" : "Starting Items"}
              </span>
              <div class="flex items-center gap-1.5">
                {#each displayedStarterItemRow.ids as itId, i}
                  <img
                    src={itemIconUrl(itId, $ddragonVersion)}
                    alt={isSupport ? "Support Item" : "Starter"}
                    class="h-6 w-6 rounded-md object-cover bg-black ring-1 ring-purple-500/30"
                    title={displayedStarterItemRow.names?.[i] || ""}
                  />
                {/each}
              </div>
            </div>
          {/if}

          <!-- Build Order (Core Items) -->
          {#if build?.core_items?.[0]}
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Build Order</span>
              <div class="flex items-center gap-1 flex-wrap">
                {#each build.core_items[0].ids as itId, i}
                  <img
                    src={itemIconUrl(itId, $ddragonVersion)}
                    alt="Core"
                    class="h-6 w-6 rounded-md object-cover bg-black ring-1 ring-purple-500/30"
                    title={build.core_items[0].names?.[i] || ""}
                  />
                  {#if i < build.core_items[0].ids.length - 1}
                    <span class="text-[9px] text-purple-400/60 font-bold">&gt;</span>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}

          <!-- Completed / Situational Items -->
          {#if build?.fourth_items && build.fourth_items.length > 0}
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Situational Items</span>
              <div class="flex items-center gap-1.5 flex-wrap">
                {#each build.fourth_items.slice(0, 5) as item}
                  <img
                    src={itemIconUrl(item.id, $ddragonVersion)}
                    alt={item.name}
                    class="h-6 w-6 rounded-md object-cover bg-black ring-1 ring-purple-500/30"
                    title={item.name}
                  />
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
