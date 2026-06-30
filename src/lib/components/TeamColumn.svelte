<script lang="ts">
  import type { DraftPick } from "../types";
  import ChampSlot from "./ChampSlot.svelte";

  export let title: string;
  export let picks: DraftPick[];
  export let accent: "cyan" | "rose";
</script>

<div class="flex min-h-0 flex-col gap-2">
  <p class="text-xs {accent === 'cyan' ? 'text-hextech-cyan' : 'text-rose-300'}">
    {title}
  </p>
  <div class="flex flex-col gap-2 overflow-y-auto pr-1">
    {#each picks as pick (pick.champion_id)}
      <ChampSlot {pick} {accent} />
    {/each}
    {#if picks.length === 0}
      <p class="text-xs italic text-slate-600">No picks yet</p>
    {/if}
  </div>
</div>
