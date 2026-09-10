<script lang="ts">
  import type { DraftPick } from "../types";
  import ChampSlot from "./ChampSlot.svelte";

  export let title: string;
  export let picks: DraftPick[];
  export let accent: "cyan" | "rose" | "purple";
  export let editable = false;
</script>

<div class="flex min-h-0 flex-col gap-2">
  <p class="text-xs font-semibold uppercase tracking-wider {accent === 'cyan' || accent === 'purple' ? 'text-purple-300' : 'text-rose-300'}">
    {title}
  </p>
  <div class="flex flex-col gap-2 overflow-y-auto pr-1">
    {#each picks as pick (pick.champion_id)}
      <ChampSlot {pick} role={pick.role || "mid"} roleLabel={pick.role || "Mitte"} {accent} {editable} />
    {/each}
    {#if picks.length === 0}
      <p class="text-xs italic text-slate-500">No picks yet</p>
    {/if}
  </div>
</div>
