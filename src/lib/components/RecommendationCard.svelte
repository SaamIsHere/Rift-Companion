<script lang="ts">
  import type { Recommendation } from "../types";
  import { ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import ScoreBar from "./ScoreBar.svelte";
  import ReasonBadge from "./ReasonBadge.svelte";

  export let rec: Recommendation;
  export let rank: number;

  let iconError = false;
</script>

<div
  class="glass-soft flex animate-fade-in flex-col gap-2 rounded-xl p-3 transition hover:bg-white/[0.08]"
>
  <div class="flex items-center gap-3">
    <span class="w-4 text-center text-xs text-slate-500">{rank}</span>

    {#if iconError}
      <div
        class="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 text-[10px] text-slate-400"
      >
        {rec.image.slice(0, 2)}
      </div>
    {:else}
      <img
        src={squareIconUrl(rec.image, $ddragonVersion)}
        alt={rec.name}
        class="h-10 w-10 rounded-lg object-cover ring-1 ring-white/10"
        on:error={() => (iconError = true)}
      />
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between">
        <span class="truncate font-medium">{rec.name}</span>
        <span class="text-sm font-semibold text-hextech-cyan">
          {Math.round(rec.score)}%
        </span>
      </div>
      <ScoreBar value={rec.score} />
    </div>
  </div>

  {#if rec.reasons.length}
    <div class="flex flex-wrap gap-1.5 pl-7">
      {#each rec.reasons as reason (reason)}
        <ReasonBadge text={reason} />
      {/each}
    </div>
  {/if}
</div>
