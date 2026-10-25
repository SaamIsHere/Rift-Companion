<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { rankTier, rankRefreshing, rankRefreshProgress } from "../stores/rank";
  import { setRankTier } from "../ipc/tauri";
  import type { RankTier } from "../types";

  let isOpen = false;
  let containerEl: HTMLElement | null = null;

  interface TierOption {
    id: RankTier;
    label: string;
    dotColor: string;
  }

  const tiers: TierOption[] = [
    { id: "iron_plus", label: "Iron+", dotColor: "bg-slate-400" },
    { id: "bronze_plus", label: "Bronze+", dotColor: "bg-amber-700" },
    { id: "silver_plus", label: "Silver+", dotColor: "bg-slate-300" },
    { id: "gold_plus", label: "Gold+", dotColor: "bg-amber-400" },
    { id: "platinum_plus", label: "Platinum+", dotColor: "bg-teal-400" },
    { id: "emerald_plus", label: "Emerald+", dotColor: "bg-emerald-400" },
    { id: "diamond_plus", label: "Diamond+", dotColor: "bg-sky-400" },
  ];

  function formatRank(tier: string): string {
    return tier
      .replace("_plus", "+")
      .replace("_", " ")
      .toUpperCase();
  }

  $: currentTier = tiers.find((t) => t.id === $rankTier) || {
    id: $rankTier,
    label: formatRank($rankTier),
    dotColor: "bg-purple-400",
  };

  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
  }

  function handleSelect(tierId: RankTier, e: MouseEvent) {
    e.stopPropagation();
    if ($rankRefreshing) return;
    rankTier.set(tierId);
    void setRankTier(tierId);
    isOpen = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (isOpen && containerEl && !containerEl.contains(e.target as Node)) {
      isOpen = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener("click", handleWindowClick);
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("click", handleWindowClick);
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

<div class="relative inline-flex items-center text-left leading-none" bind:this={containerEl}>
  <!-- Compact trigger button sitting directly under summoner name -->
  <button
    type="button"
    on:click={toggleDropdown}
    class="group flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300/80 transition-colors duration-150 hover:text-purple-100 focus:outline-none leading-none p-0"
    title="Change rank dataset (currently: {currentTier.label})"
  >
    <span>{currentTier.label}</span>
    
    <svg
      class="h-2.5 w-2.5 text-purple-400/70 transition-transform duration-200 group-hover:text-purple-200 {isOpen ? 'rotate-180 text-purple-200' : ''}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>

    {#if $rankRefreshing}
      {#if $rankRefreshProgress}
        <span class="text-[9px] font-mono tabular-nums text-hextech-cyan">
          {$rankRefreshProgress.done}/{$rankRefreshProgress.total}
        </span>
      {:else}
        <span class="h-1.5 w-1.5 animate-spin rounded-full border border-purple-400 border-t-transparent"></span>
      {/if}
    {/if}
  </button>

  <!-- Floating dropdown popover: aligned flush to the left edge of the rank trigger -->
  {#if isOpen}
    <div
      class="absolute left-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-purple-500/25 bg-void-950/95 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-purple-500/20"
      role="menu"
      tabindex="-1"
    >
      <div class="flex items-center justify-between border-b border-purple-500/15 px-2.5 py-1.5 mb-1">
        <span class="text-[9px] font-bold uppercase tracking-widest text-purple-300/70">Rank Dataset</span>
        {#if $rankRefreshing}
          <span class="text-[9px] font-medium text-hextech-cyan animate-pulse">Updating…</span>
        {/if}
      </div>

      <div class="space-y-0.5">
        {#each tiers as tier (tier.id)}
          {@const isSelected = $rankTier === tier.id}
          <button
            type="button"
            on:click={(e) => handleSelect(tier.id, e)}
            disabled={$rankRefreshing}
            class="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition duration-150 {isSelected
              ? 'bg-purple-600/25 font-bold text-white border border-purple-400/30 shadow-sm'
              : 'text-slate-300 hover:bg-purple-900/30 hover:text-white'} {($rankRefreshing && !isSelected) ? 'opacity-50 cursor-not-allowed' : ''}"
            role="menuitem"
          >
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full {tier.dotColor}"></span>
              <span class="text-xs">{tier.label}</span>
            </div>

            {#if isSelected}
              <svg class="h-3.5 w-3.5 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>

      {#if $rankRefreshing && $rankRefreshProgress}
        <div class="mt-2 border-t border-purple-500/15 px-2.5 pt-1.5 text-[10px] text-purple-300/70">
          OP.GG Crawl: {$rankRefreshProgress.done} of {$rankRefreshProgress.total} champions
        </div>
      {/if}
    </div>
  {/if}
</div>
