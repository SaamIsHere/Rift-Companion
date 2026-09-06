<script lang="ts">
  import { draft } from "../stores/draft";
  import { championCatalog } from "../stores/champions";
  import DraftBoard from "./DraftBoard.svelte";
  import RecommendationList from "./RecommendationList.svelte";
  import ChampionOverview from "./ChampionOverview.svelte";

  let viewMode: "draft" | "overview" = "draft";
  let previewChampionId: number | null = null;

  $: localChampId = $draft?.local_champion_id || null;
  $: localRole = $draft?.local_role || null;
  $: localChampName = localChampId ? $championCatalog.get(localChampId)?.name : null;

  // If player locks in a champion and switches to overview, target that champion
  $: targetChampId = previewChampionId || localChampId;
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Top Switcher Bar when player has locked in or selected a champion -->
  {#if localChampId}
    <div class="flex items-center justify-between border-b border-purple-500/15 bg-[#0a0517]/90 px-6 py-2 backdrop-blur-md">
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400">
          Gesperrter Champion:
          <strong class="text-purple-300 ml-1">{localChampName || `ID ${localChampId}`}</strong>
          {#if localRole}
            <span class="text-purple-400/80 uppercase text-[10px] ml-1">({localRole})</span>
          {/if}
        </span>
      </div>

      <!-- Mode Toggle Buttons -->
      <div class="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-purple-950/40 p-1">
        <button
          type="button"
          on:click={() => { viewMode = "draft"; previewChampionId = null; }}
          class="rounded-lg px-3 py-1 text-xs font-bold transition {viewMode === 'draft'
            ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
            : 'text-slate-400 hover:text-white'}"
        >
          Draft Board &amp; Picks
        </button>
        <button
          type="button"
          on:click={() => { viewMode = "overview"; }}
          class="rounded-lg px-3 py-1 text-xs font-bold transition {viewMode === 'overview'
            ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
            : 'text-slate-400 hover:text-white'}"
        >
          ⚡ In-Game Build &amp; Overview
        </button>
      </div>
    </div>
  {/if}

  <!-- Active View Mode -->
  {#if viewMode === "overview" && targetChampId}
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChampionOverview
        championId={targetChampId}
        initialRole={localRole}
        onBack={() => { viewMode = "draft"; previewChampionId = null; }}
      />
    </div>
  {:else}
    <main class="grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-5 px-6 pb-6 pt-4 animate-fade-in">
      <DraftBoard />
      <RecommendationList />
    </main>
  {/if}
</div>
