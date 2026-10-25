<script lang="ts">
  import type { TftAugment } from "../../types";
  import { tftAugments, tftSearchQuery } from "../../stores/tft";
  import { getTftAugmentIcon } from "../../utils/tftAssets";

  let selectedTier: string = "ALL";

  function getAugmentBadgeClass(tier: string): string {
    switch (tier.toLowerCase()) {
      case "silver":
        return "border-slate-400/50 bg-slate-500/20 text-slate-200";
      case "gold":
        return "border-amber-400/50 bg-amber-500/20 text-amber-300";
      case "prismatic":
        return "border-purple-400/50 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-indigo-500/20 text-purple-200";
      default:
        return "border-purple-500/30 bg-purple-500/10 text-purple-300";
    }
  }

  $: filteredAugments = $tftAugments.filter((aug) => {
    if (selectedTier !== "ALL" && aug.tier.toUpperCase() !== selectedTier) {
      return false;
    }
    const q = $tftSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      aug.name.toLowerCase().includes(q) ||
      aug.description.toLowerCase().includes(q)
    );
  });
</script>

<div class="flex flex-col gap-5 w-full animate-fade-in">
  <!-- Tier Filters -->
  <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
    {#each ["ALL", "SILVER", "GOLD", "PRISMATIC"] as tier}
      <button
        type="button"
        on:click={() => (selectedTier = tier)}
        class="rounded-lg px-3 py-1.5 text-xs font-bold transition duration-150 {selectedTier === tier
          ? 'bg-purple-600 text-white'
          : 'border border-purple-500/15 bg-void-950/60 text-slate-400 hover:border-purple-400/40 hover:text-slate-200'}"
      >
        {tier === "ALL" ? "All Augments" : tier.charAt(0) + tier.slice(1).toLowerCase()}
      </button>
    {/each}
  </div>

  <!-- Augments Grid -->
  {#if filteredAugments.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-purple-500/20 bg-void-950/40 p-12 text-center">
      <p class="text-sm font-semibold text-slate-400">No augments matching your filter.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each filteredAugments as aug (aug.id)}
        <div class="flex flex-col justify-between rounded-xl border border-purple-500/20 bg-void-950/80 p-4 backdrop-blur-md transition hover:border-purple-400/40 hover:bg-void-900/90 shadow-md">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div class="flex items-center gap-2.5">
                <img
                  src={getTftAugmentIcon(aug.id, aug.image_url)}
                  alt={aug.name}
                  class="h-8 w-8 rounded-lg object-cover ring-1 ring-purple-400/30 shadow"
                  on:error={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                <h4 class="text-xs font-bold text-white">{aug.name}</h4>
              </div>

              <span class="rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border {getAugmentBadgeClass(aug.tier)}">
                {aug.tier}
              </span>
            </div>

            <p class="text-xs text-slate-300 leading-relaxed">
              {aug.description}
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
