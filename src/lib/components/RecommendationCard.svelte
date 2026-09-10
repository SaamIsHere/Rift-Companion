<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Recommendation } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { preselectedChampionId } from "../stores/preselect";

  export let rec: Recommendation;
  export let rank: number;
  export let compact = false;

  const dispatch = createEventDispatcher<{
    moreInfo: number;
  }>();

  let iconError = false;

  $: info = $championCatalog.get(rec.champion_id);
  $: primaryTag = info?.tags?.[0] || "Flex";

  import { hoverChampion } from "../ipc/tauri";

  // Preselect toggling for draft hover preview and League client hover sync
  $: isPreselected = $preselectedChampionId === rec.champion_id;
  async function togglePreselect() {
    const next = isPreselected ? null : rec.champion_id;
    preselectedChampionId.set(next);
    if (next) {
      void hoverChampion(next);
    }
  }

  function handleMoreInfo(e: MouseEvent) {
    e.stopPropagation();
    dispatch("moreInfo", rec.champion_id);
  }
</script>

<div
  role="button"
  tabindex="0"
  on:click={togglePreselect}
  on:keydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), togglePreselect())}
  class="group relative flex items-center justify-between gap-3 px-3.5 {compact ? 'py-2' : 'py-2.5'} transition-colors duration-150 cursor-pointer select-none {isPreselected
    ? 'bg-purple-900/40 ring-1 ring-inset ring-purple-400/60'
    : 'hover:bg-purple-900/20 active:bg-purple-900/30'}"
>
  <!-- Left: Rank + Avatar + Name & Class (Fixed width ensures straight vertical alignment across all rows) -->
  <div class="flex items-center gap-2.5 w-48 shrink-0">
    <span class="w-5 text-center text-xs font-bold text-slate-400 shrink-0">#{rank}</span>

    {#if iconError}
      <div
        class="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-xs text-slate-300 font-bold ring-1 ring-purple-500/30 shrink-0"
      >
        {rec.image.slice(0, 2)}
      </div>
    {:else}
      <div
        class="relative h-9 w-9 rounded-full overflow-hidden ring-1 ring-purple-500/30 group-hover:ring-purple-400/60 transition-all bg-[#120924] shrink-0"
      >
        <img
          src={squareIconUrl(rec.image, $ddragonVersion)}
          alt={rec.name}
          class="h-full w-full object-cover scale-[1.12]"
          on:error={() => (iconError = true)}
        />
      </div>
    {/if}

    <div class="min-w-0 flex-1 flex flex-col justify-center overflow-hidden">
      <h3 class="truncate text-sm font-bold text-white tracking-wide" title={rec.name}>{rec.name}</h3>
      <span class="truncate text-[10px] text-purple-300/80 font-medium flex items-center gap-1">
        <span class="text-[8px] text-purple-400">✦</span>
        {primaryTag}
      </span>
    </div>
  </div>

  <!-- Winrate Display (Fixed width and border-l aligns perfectly across all rows) -->
  <div class="flex flex-col items-center justify-center shrink-0 w-20 text-center border-l border-purple-500/15 pl-2">
    <span
      class="text-sm font-black tracking-tight {rec.score >= 53
        ? 'text-emerald-400'
        : rec.score >= 50
          ? 'text-purple-300'
          : 'text-amber-400'}"
    >
      {rec.score.toFixed(1)}%
    </span>
    <span class="text-[9px] uppercase font-semibold text-slate-400/80 tracking-wider">Winrate</span>
  </div>

  <!-- Center: Conditional Matchups & Synergies in Primary Colors -->
  <div class="hidden sm:flex flex-1 flex-wrap items-center gap-1.5 min-w-0 px-2">
    <!-- Good Matchup: only when enemies in draft actually match -->
    {#if rec.good_matchups && rec.good_matchups.length > 0}
      <div
        class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-950/40 px-2 py-0.5 text-xs shadow-sm"
        title="Favorable matchup against {rec.good_matchups.join(', ')}"
      >
        <svg class="h-3 w-3 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span class="font-bold text-emerald-400 shrink-0">Good Matchup:</span>
        <span class="truncate max-w-[140px] text-emerald-200/90 font-medium">
          {rec.good_matchups.join(", ")}
        </span>
      </div>
    {/if}

    <!-- Bad Matchup: only when enemies in draft actually match -->
    {#if rec.bad_matchups && rec.bad_matchups.length > 0}
      <div
        class="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-950/40 px-2 py-0.5 text-xs shadow-sm"
        title="Unfavorable matchup against {rec.bad_matchups.join(', ')}"
      >
        <svg class="h-3 w-3 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <span class="font-bold text-rose-400 shrink-0">Bad Matchup:</span>
        <span class="truncate max-w-[140px] text-rose-200/90 font-medium">
          {rec.bad_matchups.join(", ")}
        </span>
      </div>
    {/if}

    <!-- Strong Synergy: only when allies in draft actually match -->
    {#if rec.synergies && rec.synergies.length > 0}
      <div
        class="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/35 bg-purple-950/40 px-2 py-0.5 text-xs shadow-sm"
        title="Strong team synergy with {rec.synergies.join(', ')}"
      >
        <svg class="h-3 w-3 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
        </svg>
        <span class="font-bold text-purple-300 shrink-0">Strong Synergy:</span>
        <span class="truncate max-w-[140px] text-purple-200/90 font-medium">
          {rec.synergies.join(", ")}
        </span>
      </div>
    {/if}
  </div>

  <!-- Right: Compact More Info Button -->
  <div class="shrink-0 pl-1">
    <button
      type="button"
      on:click={handleMoreInfo}
      class="group/btn inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-600/20 px-2.5 py-1.5 text-xs font-semibold text-purple-200 transition-all hover:border-purple-400 hover:bg-purple-600/40 hover:text-white active:scale-95"
      title="View in-game build &amp; matchup details"
    >
      <span>More Info</span>
      <svg
        class="h-3 w-3 text-purple-300 group-hover/btn:translate-x-0.5 transition-transform"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  </div>
</div>

