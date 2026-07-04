<script lang="ts">
  import { recommendations } from "../stores/recommendations";
  import { settings } from "../stores/settings";
  import RecommendationCard from "./RecommendationCard.svelte";

  let query = "";

  $: ranks = new Map($recommendations.map((rec, i) => [rec.champion_id, i + 1]));

  $: filtered = query.trim()
    ? $recommendations.filter((rec) =>
        rec.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : $recommendations;
</script>

<aside class="glass flex min-h-0 flex-col rounded-2xl p-5">
  <h2 class="mb-4 text-sm uppercase tracking-widest text-slate-400">
    Picks for you
  </h2>

  {#if $recommendations.length}
    <div class="relative mb-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" stroke-linecap="round" />
      </svg>
      <input
        type="text"
        bind:value={query}
        placeholder="Search champions…"
        class="glass-soft w-full rounded-lg py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-hextech-cyan/50"
      />
    </div>

    {#if filtered.length}
      <div class="flex flex-col overflow-y-auto pr-1 {$settings.compact_density ? 'gap-1.5' : 'gap-3'}">
        {#each filtered as rec (rec.champion_id)}
          <RecommendationCard {rec} rank={ranks.get(rec.champion_id) ?? 0} compact={$settings.compact_density} />
        {/each}
      </div>
    {:else}
      <div
        class="grid flex-1 place-items-center px-4 text-center text-sm text-slate-500"
      >
        No champions match "{query}".
      </div>
    {/if}
  {:else}
    <div
      class="grid flex-1 place-items-center px-4 text-center text-sm text-slate-500"
    >
      Recommendations appear once your role and the enemy laner are known.
    </div>
  {/if}
</aside>
