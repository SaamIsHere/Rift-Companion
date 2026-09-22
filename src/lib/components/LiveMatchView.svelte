<script lang="ts">
  import { draft, gameflowPhase } from "../stores/draft";
  import { championCatalog } from "../stores/champions";
  import DraftBoard from "./DraftBoard.svelte";
  import RecommendationList from "./RecommendationList.svelte";
  import ChampionOverview from "./ChampionOverview.svelte";
  import InGameDashboard from "./InGameDashboard.svelte";

  let viewMode: "dashboard" | "draft" | "overview" = "draft";
  let previewChampionId: number | null = null;
  let userExplicitMode = false;

  $: localChampId = $draft?.local_champion_id || null;
  $: localRole = $draft?.local_role || null;
  $: localChampName = localChampId ? $championCatalog.get(localChampId)?.name : null;

  $: isInGame = ["GameStart", "InProgress", "Reconnect"].includes($gameflowPhase);

  // Auto-transition to in-game live dashboard when match starts or if already in game
  $: if (isInGame && !userExplicitMode && viewMode === "draft") {
    viewMode = "dashboard";
  } else if (!isInGame && !userExplicitMode && $draft && viewMode === "dashboard") {
    // If returning to draft/champ select, default back to draft
    viewMode = "draft";
  }

  // If player previews a champion from recommendations or locks in, target that champion for overview
  $: targetChampId = previewChampionId || localChampId;
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Top Switcher Bar only when game is in progress (GameStart / Loading Screen / InProgress) -->
  {#if isInGame}
    <div class="flex items-center justify-between border-b border-purple-500/15 bg-void-950/60 px-6 py-2 backdrop-blur-md shrink-0">
      <div class="flex items-center gap-3">
        <span class="text-xs text-slate-400 flex items-center gap-1.5">
          <span class="flex h-2 w-2 relative">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <strong class="text-emerald-400 font-bold uppercase tracking-wider text-[11px]">In-Game:</strong>
          <strong class="text-purple-300 ml-0.5">{localChampName || (localChampId ? `ID ${localChampId}` : "Your Champion")}</strong>
          {#if localRole}
            <span class="text-purple-400/80 uppercase text-[10px]">({localRole})</span>
          {/if}
        </span>
      </div>

      <!-- Mode Toggle Buttons: Only In-Game Dashboard and Full Overview in-game -->
      <div class="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-purple-950/40 p-1">
        <button
          type="button"
          on:click={() => { viewMode = "dashboard"; userExplicitMode = true; }}
          class="rounded-lg px-3 py-1 text-xs font-bold transition {viewMode === 'dashboard'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-white'}"
        >
          🎮 In-Game Dashboard
        </button>
        <button
          type="button"
          on:click={() => { viewMode = "overview"; userExplicitMode = true; }}
          class="rounded-lg px-3 py-1 text-xs font-bold transition {viewMode === 'overview'
            ? 'bg-purple-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-white'}"
        >
          ⚡ Full Overview
        </button>
      </div>
    </div>
  {/if}

  <!-- Active View Mode Rendering -->
  {#if viewMode === "dashboard"}
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <InGameDashboard />
    </div>
  {:else if viewMode === "overview" && targetChampId}
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChampionOverview
        championId={targetChampId}
        initialRole={localRole}
        onBack={() => { viewMode = isInGame ? "dashboard" : "draft"; previewChampionId = null; }}
      />
    </div>
  {:else}
    <main class="grid min-h-0 flex-1 grid-cols-[390px_1fr] gap-5 px-6 pb-6 pt-4">
      <DraftBoard />
      <RecommendationList
        on:selectOverview={(e) => {
          previewChampionId = e.detail;
          viewMode = "overview";
        }}
      />
    </main>
  {/if}
</div>
