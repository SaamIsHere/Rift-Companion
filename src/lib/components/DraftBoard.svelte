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
    <h2 class="text-sm uppercase tracking-widest text-purple-300/70 font-semibold">Live Draft</h2>
    <div class="flex items-center gap-2">
      {#if referenceName}
        <span class="text-xs text-slate-400">
          Previewing <span class="text-purple-300 font-semibold">{referenceName}</span> — hover a pick
        </span>
      {/if}
      {#if $draft?.local_role}
        <span
          class="rounded-md bg-purple-500/20 border border-purple-400/40 px-2 py-1 text-xs font-bold uppercase tracking-wider text-purple-200"
        >
          Your role: {$draft.local_role}
        </span>
      {/if}
    </div>
  </div>

  {#if $draft}
    <div class="grid min-h-0 flex-1 grid-cols-2 gap-5">
      <TeamColumn title="Your team" picks={$draft.allies} accent="purple" />
      <TeamColumn title="Enemy team" picks={$draft.enemies} accent="rose" editable />
    </div>

    {#if $draft.bans.length}
      <div class="mt-4 border-t border-purple-500/20 pt-4">
        <p class="mb-2 text-xs uppercase tracking-wider text-purple-300/70 font-medium">Bans</p>
        <div class="flex flex-wrap gap-1.5">
          {#each $draft.bans as id, idx (`${id}-${idx}`)}
            {@const info = $championCatalog.get(id)}
            {#if info}
              <img
                src={squareIconUrl(info.key, $ddragonVersion)}
                alt={info.name}
                title={info.name}
                class="h-7 w-7 rounded object-cover opacity-50 grayscale ring-1 ring-purple-500/20"
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
    <div class="grid flex-1 place-items-center px-6 text-center text-sm text-slate-400">
      <div class="flex flex-col items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
        <p>Enter champion select in League of Legends to view the live draft here.</p>
      </div>
    </div>
  {/if}
</section>
