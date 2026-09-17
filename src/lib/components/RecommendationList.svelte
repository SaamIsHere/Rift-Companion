<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { Recommendation, Role, ScoringMode } from "../types";
  import { recommendations } from "../stores/recommendations";
  import { draft } from "../stores/draft";
  import { settings } from "../stores/settings";
  import { scoringMode } from "../stores/scoring";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { roleIconUrl, squareIconUrl } from "../utils/ddragon";
  import { getChampionRecommendation, setScoringMode } from "../ipc/tauri";
  import { preselectedChampionId, referenceChampionId } from "../stores/preselect";
  import RecommendationCard from "./RecommendationCard.svelte";

  const dispatch = createEventDispatcher<{
    selectOverview: number;
  }>();

  let query = "";
  let dropdownOpen = false;

  $: inChampSelect = $draft !== null;

  // When player hovers a champion in League, highlight it in recommendations if present
  $: hoveredId = inChampSelect ? ($draft?.hovered_champion_id ?? null) : null;
  $: if (hoveredId) {
    const exists = $recommendations.some((r) => r.champion_id === hoveredId);
    if (exists) {
      preselectedChampionId.set(hoveredId);
    }
  }

  // Actively hovered / previewed champion recommendation data (for top banner display)
  $: activePreviewId = inChampSelect ? $referenceChampionId : null;
  $: activeChampInfo = activePreviewId ? $championCatalog.get(activePreviewId) : null;

  let asyncHoveredRec: Recommendation | null = null;
  let fetchingId: number | null = null;

  $: if (activePreviewId) {
    const found = $recommendations.find((r) => r.champion_id === activePreviewId);
    if (found) {
      asyncHoveredRec = found;
    } else if (fetchingId !== activePreviewId) {
      fetchingId = activePreviewId;
      void getChampionRecommendation(activePreviewId).then((res) => {
        if (activePreviewId === fetchingId) {
          asyncHoveredRec = res;
        }
      });
    }
  } else {
    asyncHoveredRec = null;
    fetchingId = null;
  }

  $: displayRec = asyncHoveredRec;
  $: displayName = displayRec?.name || activeChampInfo?.name || "Champion";
  $: displayImage = displayRec?.image || activeChampInfo?.key || "";
  $: displayScore = displayRec?.score;
  $: displayRoleTag = activeChampInfo?.tags?.[0] || "Flex";

  const SCORING_OPTIONS: { id: ScoringMode; label: string; subtitle: string }[] = [
    {
      id: "default",
      label: "Balanced",
      subtitle: "(Balanced rating)",
    },
    {
      id: "counterpick",
      label: "Counterpick",
      subtitle: "(Direct matchup strength)",
    },
    {
      id: "teamplayer",
      label: "Team Player",
      subtitle: "(Team combo & playstyle)",
    },
  ];

  $: activeOption = SCORING_OPTIONS.find((o) => o.id === $scoringMode) || SCORING_OPTIONS[0];

  async function selectMode(mode: ScoringMode) {
    dropdownOpen = false;
    try {
      await setScoringMode(mode);
    } catch (err) {
      console.error("Failed to set scoring mode", err);
    }
  }

  function handleDocumentClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (dropdownOpen && !target?.closest(".scoring-dropdown-container")) {
      dropdownOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener("click", handleDocumentClick);
  });

  onDestroy(() => {
    window.removeEventListener("click", handleDocumentClick);
  });

  $: localRole = ($draft?.local_role as Role) || null;

  const ROLE_NAMES: Record<Role, string> = {
    top: "Top",
    jungle: "Jungle",
    mid: "Mid",
    adc: "ADC",
    support: "Support",
  };

  $: ranks = new Map($recommendations.map((rec, i) => [rec.champion_id, i + 1]));

  $: filtered = query.trim()
    ? $recommendations.filter((rec) =>
        rec.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : $recommendations;
</script>

<aside class="glass flex min-h-0 flex-1 flex-col rounded-2xl p-5 overflow-hidden">
  <!-- Top Header with Title and Rating Focus Dropdown -->
  <div class="mb-4 flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="grid h-8 w-8 place-items-center rounded-xl bg-purple-600/20 text-purple-300 ring-1 ring-purple-500/30">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
        </svg>
      </div>
      <div>
        <h2 class="text-sm font-bold text-white tracking-wide">Champion Suggestions</h2>
        <p class="text-[11px] text-slate-400">Based on your role, enemy picks, and the current meta.</p>
      </div>
    </div>

    <!-- Rating Focus Dropdown -->
    <div class="scoring-dropdown-container relative shrink-0">
      <span class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1 text-right">
        Rating Focus
      </span>

      <button
        type="button"
        on:click={() => (dropdownOpen = !dropdownOpen)}
        class="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-[#140a2b] px-3 py-1.5 text-xs font-semibold text-purple-200 shadow-sm transition hover:border-purple-400 hover:bg-[#1a0d38] focus:outline-none focus:ring-1 focus:ring-purple-400"
      >
        <span>{activeOption.label}</span>
        <svg
          class="h-3.5 w-3.5 text-purple-400 transition-transform {dropdownOpen ? 'rotate-180' : ''}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <!-- Dropdown Menu -->
      {#if dropdownOpen}
        <div
          class="absolute right-0 top-full z-40 mt-1.5 w-60 rounded-xl border border-purple-500/30 bg-[#120826] p-1.5 shadow-2xl backdrop-blur-xl animate-fade-in"
        >
          {#each SCORING_OPTIONS as opt (opt.id)}
            <button
              type="button"
              on:click={() => selectMode(opt.id)}
              class="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition {$scoringMode === opt.id
                ? 'bg-purple-600/30 text-white font-bold'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'}"
            >
              <div class="flex flex-col">
                <span class="leading-tight">{opt.label}</span>
                <span class="text-[10px] text-slate-400 font-normal">{opt.subtitle}</span>
              </div>
              {#if $scoringMode === opt.id}
                <svg class="h-4 w-4 text-purple-400 shrink-0 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Hovered Champion Card or Role Indicator Banner -->
  {#if inChampSelect}
    {#if activePreviewId}
      <!-- Hovered / Preselected Champion Banner -->
      <div class="mb-3 flex flex-col rounded-xl border border-purple-500/35 bg-[#120826]/90 p-3 shadow-lg shadow-purple-950/40 animate-fade-in relative overflow-hidden shrink-0">
        <div class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent"></div>

        <div class="flex items-center gap-2 mb-2">
          <span class="inline-flex items-center gap-1.5 rounded-md bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-200">
            <span class="h-1.5 w-1.5 rounded-full bg-purple-400 animate-ping"></span>
            Hovered Pick
          </span>
          {#if localRole}
            <span class="text-[11px] font-semibold text-slate-400">
              for <span class="text-purple-300 font-bold">{ROLE_NAMES[localRole] || localRole}</span>
            </span>
          {/if}
        </div>

        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden ring-2 ring-purple-500/50 bg-[#120924] shadow-md">
              {#if displayImage}
                <img
                  src={squareIconUrl(displayImage, $ddragonVersion)}
                  alt={displayName}
                  class="h-full w-full object-cover scale-[1.12]"
                />
              {/if}
            </div>

            <div class="min-w-0 flex flex-col justify-center">
              <h3 class="truncate text-sm font-extrabold text-white tracking-wide">
                {displayName}
              </h3>
              <span class="truncate text-[10px] text-purple-300/80 font-medium flex items-center gap-1">
                <span class="text-[8px] text-purple-400">✦</span>
                {displayRoleTag}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2.5 shrink-0">
            {#if displayScore !== undefined && displayScore !== null}
              <div class="flex flex-col items-end border-l border-purple-500/20 pl-3">
                <span
                  class="text-base font-black tracking-tight leading-none {displayScore >= 53
                    ? 'text-emerald-400'
                    : displayScore >= 50
                      ? 'text-purple-300'
                      : 'text-amber-400'}"
                >
                  {displayScore.toFixed(1)}%
                </span>
                <span class="text-[9px] uppercase font-semibold text-slate-400 tracking-wider mt-0.5">
                  Winrate
                </span>
              </div>
            {:else}
              <div class="flex flex-col items-end border-l border-purple-500/20 pl-3">
                <span class="text-xs text-purple-300/70 font-semibold animate-pulse">
                  Calculating...
                </span>
              </div>
            {/if}

            <button
              type="button"
              on:click={() => dispatch("selectOverview", activePreviewId)}
              class="inline-flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-600/30 px-2.5 py-1.5 text-xs font-bold text-purple-100 transition-all hover:border-purple-400 hover:bg-purple-600/50 hover:text-white active:scale-95 shadow-sm"
              title="View in-game build &amp; matchup details"
            >
              <span>Details</span>
              <svg class="h-3 w-3 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Matchup & Synergy Modifiers Badges -->
        {#if displayRec}
          {@const goods = displayRec.good_matchups ?? []}
          {@const bads = displayRec.bad_matchups ?? []}
          {@const syns = displayRec.synergies ?? []}
          {#if goods.length > 0 || bads.length > 0 || syns.length > 0}
            <div class="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-purple-500/15">
              {#if goods.length > 0}
                <div
                  class="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-950/40 px-2 py-0.5 text-xs shadow-sm"
                  title="Favorable matchup against {goods.join(', ')}"
                >
                  <svg class="h-3 w-3 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span class="font-bold text-emerald-400 shrink-0">Good Matchup:</span>
                  <span class="text-emerald-200/90 font-medium truncate max-w-[180px]">
                    {goods.join(", ")}
                  </span>
                </div>
              {/if}

              {#if bads.length > 0}
                <div
                  class="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-950/40 px-2 py-0.5 text-xs shadow-sm"
                  title="Unfavorable matchup against {bads.join(', ')}"
                >
                  <svg class="h-3 w-3 text-rose-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  <span class="font-bold text-rose-400 shrink-0">Bad Matchup:</span>
                  <span class="text-rose-200/90 font-medium truncate max-w-[180px]">
                    {bads.join(", ")}
                  </span>
                </div>
              {/if}

              {#if syns.length > 0}
                <div
                  class="inline-flex items-center gap-1 rounded-lg border border-purple-500/35 bg-purple-950/40 px-2 py-0.5 text-xs shadow-sm"
                  title="Strong team synergy with {syns.join(', ')}"
                >
                  <svg class="h-3 w-3 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
                  </svg>
                  <span class="font-bold text-purple-300 shrink-0">Strong Synergy:</span>
                  <span class="text-purple-200/90 font-medium truncate max-w-[180px]">
                    {syns.join(", ")}
                  </span>
                </div>
              {/if}
            </div>
          {:else}
            <div class="mt-2 flex items-center gap-1.5 pt-1.5 border-t border-purple-500/10 text-[11px] text-slate-400">
              <span>Balanced matchup against selected draft champions.</span>
            </div>
          {/if}
        {/if}
      </div>
    {:else if localRole}
      <!-- Role Indicator Banner (Shown when draft is active and no champion is hovered) -->
      <div class="mb-3 flex items-center gap-3 rounded-xl border border-purple-500/20 bg-purple-950/20 px-3.5 py-2.5 animate-fade-in shrink-0">
        <div class="grid h-8 w-8 place-items-center rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 shrink-0">
          <img
            src={roleIconUrl(localRole)}
            alt={localRole}
            class="h-5 w-5 object-contain filter brightness-125"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-white">
              Your Role: <span class="text-purple-300">{ROLE_NAMES[localRole] || localRole}</span>
            </span>
          </div>
          <p class="text-[11px] text-slate-400 leading-tight">
            The best options for your current role based on picked champions.
          </p>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Recommendations Content or Waiting State -->
  {#if inChampSelect && $recommendations.length}
    <!-- Search Input -->
    <div class="relative mb-3 shrink-0">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-300/60"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" stroke-linecap="round" />
      </svg>
      <input
        type="text"
        bind:value={query}
        placeholder="Search champions…"
        class="glass-soft w-full rounded-xl py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-400/60 focus:outline-none focus:ring-1 focus:ring-purple-400/50 focus:border-purple-400/40"
      />
    </div>

    <!-- Recommendations List -->
    {#if filtered.length}
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto py-1 pl-0.5 pr-3.5">
        <div class="flex flex-col rounded-xl border border-purple-500/20 bg-[#0e061e]/70 overflow-hidden shadow-inner divide-y divide-purple-500/10 shrink-0">
          {#each filtered as rec (rec.champion_id)}
            <RecommendationCard
              {rec}
              rank={ranks.get(rec.champion_id) ?? 0}
              compact={$settings.compact_density}
              on:moreInfo={(e) => dispatch("selectOverview", e.detail)}
            />
          {/each}
        </div>
      </div>
    {:else}
      <div class="grid flex-1 place-items-center px-4 text-center text-sm text-slate-500">
        No champions match "{query}".
      </div>
    {/if}
  {:else}
    <div class="grid flex-1 place-items-center px-6 text-center text-sm text-slate-400">
      <div class="flex flex-col items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
        <p>Recommendations appear once you enter champion select in League of Legends.</p>
      </div>
    </div>
  {/if}
</aside>

