<script lang="ts">
  import { draft } from "../stores/draft";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { referenceChampionId } from "../stores/preselect";
  import TeamColumn from "./TeamColumn.svelte";

  $: referenceName = $referenceChampionId !== null ? $championCatalog.get($referenceChampionId)?.name : undefined;
</script>

<section class="glass flex min-h-0 flex-col rounded-2xl p-5">
  <div class="mb-4 flex items-center justify-between">
    <h2 class="text-sm uppercase tracking-widest text-slate-400">Live Draft</h2>
    <div class="flex items-center gap-2">
      {#if referenceName}
        <span class="text-xs text-slate-400">
          Previewing <span class="text-hextech-cyan">{referenceName}</span> — hover a pick
        </span>
      {/if}
      {#if $draft?.local_role}
        <span
          class="rounded-md bg-hextech-cyan/15 px-2 py-1 text-xs font-medium uppercase text-hextech-cyan"
        >
          Your role: {$draft.local_role}
        </span>
      {/if}
    </div>
  </div>

  {#if $draft}
    <div class="grid min-h-0 flex-1 grid-cols-2 gap-5">
      <TeamColumn title="Your team" picks={$draft.allies} accent="cyan" />
      <TeamColumn title="Enemy team" picks={$draft.enemies} accent="rose" editable />
    </div>

    {#if $draft.bans.length}
      <div class="mt-4 border-t border-white/10 pt-4">
        <p class="mb-2 text-xs text-slate-400">Bans</p>
        <div class="flex flex-wrap gap-1.5">
          {#each $draft.bans as id (id)}
            {@const info = $championCatalog.get(id)}
            {#if info}
              <img
                src={squareIconUrl(info.key, $ddragonVersion)}
                alt={info.name}
                title={info.name}
                class="h-7 w-7 rounded object-cover opacity-50 grayscale ring-1 ring-white/10"
              />
            {:else}
              <span class="rounded bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                #{id}
              </span>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="grid flex-1 place-items-center px-6 text-center text-sm text-slate-500">
      Enter champion select and the live draft will appear here.
    </div>
  {/if}
</section>
