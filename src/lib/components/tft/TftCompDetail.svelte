<script lang="ts">
  import type { TftMetaDeck } from "../../types";
  import { selectTftDeck } from "../../stores/tft";
  import {
    getTftChampionIcon,
    getTftChampionFallback,
    getTftTraitIcon,
    getTftItemIcon,
  } from "../../utils/tftAssets";
  import TftHexBoard from "./TftHexBoard.svelte";

  export let deck: TftMetaDeck;

  function getTierBadgeClass(tier: string): string {
    switch (tier.toUpperCase()) {
      case "OP":
        return "border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300";
      case "S":
        return "border-purple-400/50 bg-purple-500/20 text-purple-200";
      case "A":
        return "border-blue-400/50 bg-blue-500/20 text-blue-200";
      case "B":
        return "border-slate-400/40 bg-slate-500/20 text-slate-300";
      default:
        return "border-purple-500/30 bg-purple-500/10 text-purple-300";
    }
  }

  $: carryUnits = deck.units.filter((u) => u.is_carry || (u.items && u.items.length > 0));
</script>

<div class="flex flex-col gap-6 w-full animate-fade-in">
  <!-- Top Navigation Bar / Breadcrumb -->
  <div class="flex items-center justify-between border-b border-purple-500/15 pb-4">
    <button
      type="button"
      on:click={() => selectTftDeck(null)}
      class="group flex items-center gap-2 rounded-lg border border-purple-500/20 bg-void-950/70 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-purple-400/50 hover:bg-purple-900/30 hover:text-white"
    >
      <svg class="h-4 w-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>Back to Comps</span>
    </button>

    <div class="flex items-center gap-3">
      <span class="rounded-md border px-2.5 py-0.5 text-xs font-black tracking-wider uppercase {getTierBadgeClass(deck.tier)}">
        Tier {deck.tier}
      </span>
      {#if deck.play_style}
        <span class="rounded-md border border-purple-500/20 bg-purple-950/40 px-2 py-0.5 text-[11px] font-semibold text-purple-300">
          {deck.play_style}
        </span>
      {/if}
    </div>
  </div>

  <!-- Header Info Banner -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-purple-500/20 bg-void-950/80 p-5 backdrop-blur-md shadow-lg">
    <div>
      <h2 class="text-xl font-black tracking-wide text-white mb-2">{deck.name}</h2>
      
      <!-- Trait Badges -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#each deck.traits as trait}
          <div class="flex items-center gap-1.5 rounded-md bg-purple-900/40 border border-purple-400/30 px-2 py-1 text-[11px] font-bold text-purple-200">
            <img
              src={getTftTraitIcon(trait.name)}
              alt={trait.name}
              class="h-3.5 w-3.5 object-contain"
              on:error={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            <span class="text-amber-300 tabular-nums">{trait.count}</span>
            <span>{trait.name}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Stats Pill Box -->
    <div class="flex items-center gap-4 rounded-lg border border-purple-500/15 bg-void-900/60 p-3 text-center">
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70">Avg Place</div>
        <div class="text-sm font-black text-emerald-400 tabular-nums">#{deck.avg_placement.toFixed(2)}</div>
      </div>
      <div class="h-6 w-px bg-purple-500/20"></div>
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70">Top 4 Rate</div>
        <div class="text-sm font-black text-white tabular-nums">{deck.top4_rate.toFixed(1)}%</div>
      </div>
      {#if deck.pick_rate}
        <div class="h-6 w-px bg-purple-500/20"></div>
        <div>
          <div class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70">Pick Rate</div>
          <div class="text-sm font-black text-purple-300 tabular-nums">{(deck.pick_rate * 100).toFixed(0)}%</div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Main Detail Grid -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Left 2 Cols: 4x7 Hexagon Board Positioning -->
    <div class="lg:col-span-2 flex flex-col rounded-xl border border-purple-500/20 bg-void-950/70 p-5 backdrop-blur-md shadow-md">
      <div class="flex items-center justify-between mb-4 border-b border-purple-500/15 pb-2">
        <h3 class="text-xs font-bold uppercase tracking-widest text-purple-200">
          Board Positioning Grid (4 × 7)
        </h3>
        <span class="text-[10px] text-purple-300/60 font-medium">Optimal Endgame Formation</span>
      </div>

      <div class="flex-1 flex items-center justify-center">
        {#key deck.id}
          <TftHexBoard units={deck.units} />
        {/key}
      </div>
    </div>

    <!-- Right Col: Leveling & Economy Roadmap -->
    <div class="flex flex-col rounded-xl border border-purple-500/20 bg-void-950/70 p-5 backdrop-blur-md shadow-md">
      <div class="flex items-center justify-between mb-4 border-b border-purple-500/15 pb-2">
        <h3 class="text-xs font-bold uppercase tracking-widest text-purple-200">
          Leveling & Economy
        </h3>
        <span class="text-[10px] text-purple-300/60 font-medium">Tempo Guide</span>
      </div>

      <div class="space-y-3">
        {#each deck.leveling_guide as step}
          <div class="flex items-start gap-3 rounded-lg border border-purple-500/10 bg-white/[0.02] p-3">
            <div class="flex flex-col items-center">
              <span class="rounded bg-purple-600/30 border border-purple-400/40 px-1.5 py-0.5 text-[10px] font-bold text-purple-200 uppercase">
                {step.stage}
              </span>
              <span class="text-[10px] text-purple-300/70 mt-1 font-semibold">Lvl {step.level}</span>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">
              {step.description}
            </p>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Bottom Section: Core Carries & BiS Items -->
  <div class="rounded-xl border border-purple-500/20 bg-void-950/70 p-5 backdrop-blur-md shadow-md">
    <div class="flex items-center justify-between mb-4 border-b border-purple-500/15 pb-2">
      <h3 class="text-xs font-bold uppercase tracking-widest text-purple-200">
        Best in Slot (BiS) Item Recommendations
      </h3>
      <span class="text-[10px] text-purple-300/60 font-medium">Key Champions & Priorities</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each carryUnits as unit}
        <div class="flex items-center gap-3.5 rounded-lg border border-purple-500/15 bg-white/[0.02] p-3.5">
          <!-- Unit Avatar / Cost -->
          <div class="relative h-12 w-12 shrink-0 rounded-lg border-2 border-purple-400/60 bg-void-900 overflow-hidden shadow">
            <img
              src={getTftChampionIcon(unit.id || unit.name)}
              alt={unit.name}
              class="h-full w-full object-cover object-top"
              on:error={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.src = getTftChampionFallback(unit.name);
              }}
            />
            <span class="absolute bottom-0 right-0 rounded bg-black/80 px-1 text-[8px] font-bold text-amber-300">
              {unit.cost}g
            </span>
          </div>

          <!-- Items Row -->
          <div class="flex-1">
            <div class="text-[11px] font-bold text-slate-200 mb-1.5">
              {unit.name} {unit.is_carry ? "• Main Carry" : "• Tank"}
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              {#each unit.items as it}
                <div class="flex items-center gap-1 rounded border border-purple-500/20 bg-void-900/80 px-1.5 py-0.5 shadow-sm" title={it.name}>
                  <img
                    src={getTftItemIcon(it.id)}
                    alt={it.name}
                    class="h-4 w-4 rounded object-cover shadow"
                    on:error={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = it.image_url;
                    }}
                  />
                  <span class="text-[10px] font-semibold text-slate-300">{it.name}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
