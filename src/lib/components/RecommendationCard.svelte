<script lang="ts">
  import type { Recommendation } from "../types";
  import { ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { preselectedChampionId } from "../stores/preselect";
  import ScoreBar from "./ScoreBar.svelte";
  import ReasonBadge from "./ReasonBadge.svelte";

  export let rec: Recommendation;
  export let rank: number;
  export let compact = false;

  let iconError = false;

  // Click to "preselect" this champion (Issue #7): pins it as the reference
  // pick for the draft-board hover preview, so its matchup/synergy against
  // any ally/enemy slot shows on hover even before it's actually locked in.
  // Clicking the already-preselected card again clears it.
  $: isPreselected = $preselectedChampionId === rec.champion_id;
  function togglePreselect() {
    preselectedChampionId.set(isPreselected ? null : rec.champion_id);
  }
</script>

<div
  role="button"
  tabindex="0"
  on:click={togglePreselect}
  on:keydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), togglePreselect())}
  class="glass-soft flex animate-fade-in cursor-pointer flex-col rounded-xl transition hover:bg-white/[0.08] {compact
    ? 'gap-1 p-2'
    : 'gap-2 p-3'} {isPreselected ? 'ring-1 ring-purple-400/80 shadow-[0_0_14px_rgba(168,85,247,0.35)]' : ''}"
>
  <div class="flex items-center gap-3">
    <span class="w-4 text-center text-xs text-slate-500">{rank}</span>

    {#if iconError}
      <div
        class="grid place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 text-[10px] text-slate-400 {compact
          ? 'h-7 w-7'
          : 'h-10 w-10'}"
      >
        {rec.image.slice(0, 2)}
      </div>
    {:else}
      <div class="relative rounded-lg overflow-hidden ring-1 ring-white/10 bg-[#120924] shrink-0 {compact ? 'h-7 w-7' : 'h-10 w-10'}">
        <img
          src={squareIconUrl(rec.image, $ddragonVersion)}
          alt={rec.name}
          class="h-full w-full object-cover scale-[1.14]"
          on:error={() => (iconError = true)}
        />
      </div>
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between">
        <span class="truncate font-medium text-slate-200">{rec.name}</span>
        <span class="text-sm font-bold text-purple-300">
          {Math.round(rec.score)}%
        </span>
      </div>
      {#if !compact}
        <ScoreBar value={rec.score} />
      {/if}
    </div>
  </div>

  {#if rec.badges.length && !compact}
    <div class="flex flex-wrap gap-1.5 pl-7">
      {#each rec.badges as badge, bIdx (`${badge.text}-${bIdx}`)}
        <ReasonBadge text={badge.text} kind={badge.kind} />
      {/each}
    </div>
  {/if}
</div>
