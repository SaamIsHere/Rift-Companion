<script lang="ts">
  import { rankTier, rankRefreshing, rankRefreshProgress } from "../stores/rank";
  import { settings } from "../stores/settings";
  import { setRankTier } from "../ipc/tauri";
  import type { RankTier } from "../types";

  const tiers: { id: RankTier; label: string; desc: string }[] = [
    { id: "iron_plus", label: "Iron+ (All Ranks)", desc: "Aggregated statistics across all matches (~865k games)." },
    { id: "bronze_plus", label: "Bronze+", desc: "Synthesized baseline starting from Bronze upwards." },
    { id: "silver_plus", label: "Silver+", desc: "Synthesized baseline starting from Silver upwards." },
    { id: "gold_plus", label: "Gold+", desc: "Statistics from Gold through Challenger." },
    { id: "platinum_plus", label: "Platinum+", desc: "Statistics from Platinum through Challenger." },
    { id: "emerald_plus", label: "Emerald+ (Default)", desc: "Recommended standard for highest precision and meta win-rate trends." },
    { id: "diamond_plus", label: "Diamond+", desc: "High-Elo matchup and synergy statistics." },
  ];

  function handleSelect(tier: RankTier) {
    if ($rankRefreshing) return;
    setRankTier(tier);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col p-6 overflow-y-auto max-w-4xl mx-auto w-full select-none">
  <div class="mb-6">
    <h2 class="text-xl font-bold tracking-wide text-white">Rankings & Tier Dataset</h2>
    <p class="text-xs text-purple-300/70">
      Select the rank tier driving the OP.GG matchup and recommendation dataset.
    </p>
  </div>

  <!-- Rank Tiers List -->
  <div class="grid gap-3">
    {#each tiers as tier (tier.id)}
      {@const isSelected = $rankTier === tier.id}
      <button
        type="button"
        on:click={() => handleSelect(tier.id)}
        disabled={$rankRefreshing}
        class="glass-soft flex items-center justify-between rounded-xl border p-4 text-left transition-all duration-200 {isSelected
          ? 'border-purple-400 bg-purple-900/40 ring-1 ring-purple-400/50 shadow-md'
          : 'border-purple-500/15 hover:border-purple-400/40 hover:bg-purple-900/20'}"
      >
        <div>
          <div class="flex items-center gap-2.5">
            <span class="text-sm font-bold {isSelected ? 'text-white' : 'text-slate-200'}">
              {tier.label}
            </span>
            {#if isSelected}
              <span class="rounded-full bg-purple-500/20 border border-purple-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-200">
                Active
              </span>
            {/if}
          </div>
          <p class="mt-1 text-xs text-purple-200/60">{tier.desc}</p>
        </div>

        <div class="flex items-center">
          <div class="h-5 w-5 rounded-full border-2 flex items-center justify-center {isSelected ? 'border-purple-400 bg-purple-600' : 'border-slate-600'}">
            {#if isSelected}
              <div class="h-2 w-2 rounded-full bg-white"></div>
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>

  {#if $rankRefreshing}
    <div class="mt-6 glass-soft rounded-xl p-4 flex items-center gap-3">
      <div class="h-4 w-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin"></div>
      <div class="text-xs text-purple-200">
        {#if $settings.server_url.trim()}
          Loading updated dataset from Rift Server ({$settings.server_url})...
        {:else if $rankRefreshProgress}
          OP.GG crawl in progress: {$rankRefreshProgress.done} of {$rankRefreshProgress.total} champions completed...
        {:else}
          Preparing OP.GG data refresh...
        {/if}
      </div>
    </div>
  {/if}
</div>
