<script lang="ts">
  import type { DraftPick } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";

  export let pick: DraftPick;
  export let accent: "cyan" | "rose";

  let imgError = false;
  $: info = $championCatalog.get(pick.champion_id);
  $: name = info?.name ?? `Champion ${pick.champion_id}`;
</script>

<div
  class="glass-soft flex items-center gap-3 rounded-xl p-2 {pick.is_local
    ? 'ring-1 ring-hextech-cyan/60'
    : ''}"
>
  {#if info && !imgError}
    <img
      src={squareIconUrl(info.key, $ddragonVersion)}
      alt={name}
      class="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10"
      on:error={() => (imgError = true)}
    />
  {:else}
    <div
      class="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-[10px] {accent ===
      'cyan'
        ? 'text-hextech-cyan'
        : 'text-rose-300'}"
    >
      {pick.champion_id}
    </div>
  {/if}

  <div class="flex flex-col">
    <span class="text-sm">{name}</span>
    {#if pick.role}
      <span class="text-[11px] uppercase text-slate-400">{pick.role}</span>
    {/if}
  </div>
  {#if pick.is_local}
    <span class="ml-auto text-[10px] uppercase text-hextech-cyan">You</span>
  {/if}
</div>
