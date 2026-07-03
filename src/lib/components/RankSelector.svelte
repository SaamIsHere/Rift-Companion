<script lang="ts">
  import { rankTier, rankRefreshing, rankRefreshProgress } from "../stores/rank";
  import { setRankTier } from "../ipc/tauri";
  import type { RankTier } from "../types";

  const RANKS: { value: RankTier; label: string }[] = [
    { value: "iron", label: "Iron" },
    { value: "bronze", label: "Bronze" },
    { value: "silver", label: "Silver" },
    { value: "gold", label: "Gold" },
    { value: "platinum", label: "Platinum" },
    { value: "emerald_plus", label: "Emerald+" },
    { value: "diamond_plus", label: "Diamond+" },
  ];

  function onChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value as RankTier;
    rankTier.set(value);
    void setRankTier(value);
  }
</script>

<div class="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
  <select
    class="cursor-pointer bg-transparent text-slate-300 focus:outline-none"
    value={$rankTier}
    on:change={onChange}
  >
    {#each RANKS as r}
      <option value={r.value} class="bg-slate-900 text-slate-100">{r.label}</option>
    {/each}
  </select>
  {#if $rankRefreshing}
    {#if $rankRefreshProgress}
      <span class="text-[10px] tabular-nums text-hextech-cyan" title="Fetching matchup/synergy data from OP.GG…">
        {$rankRefreshProgress.done}/{$rankRefreshProgress.total}
      </span>
    {:else}
      <span
        class="h-2 w-2 animate-pulse rounded-full bg-hextech-cyan shadow-[0_0_8px] shadow-hextech-cyan/60"
        title="Refreshing stats…"
      ></span>
    {/if}
  {/if}
</div>
