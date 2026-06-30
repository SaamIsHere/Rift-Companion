<script lang="ts">
  import { recommendations } from "../stores/recommendations";
  import RecommendationCard from "./RecommendationCard.svelte";
</script>

<aside class="glass flex min-h-0 flex-col rounded-2xl p-5">
  <h2 class="mb-4 text-sm uppercase tracking-widest text-slate-400">
    Top picks for you
  </h2>

  {#if $recommendations.length}
    <div class="flex flex-col gap-3 overflow-y-auto pr-1">
      {#each $recommendations as rec, i (rec.champion_id)}
        <RecommendationCard {rec} rank={i + 1} />
      {/each}
    </div>
  {:else}
    <div
      class="grid flex-1 place-items-center px-4 text-center text-sm text-slate-500"
    >
      Recommendations appear once your role and the enemy laner are known.
    </div>
  {/if}
</aside>
