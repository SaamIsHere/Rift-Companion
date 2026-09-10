<script lang="ts">
  import type { ChampionOverviewData, Role } from "../types";
  import { ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";

  export let overview: ChampionOverviewData | null = null;
  export let activeRole: Role = "top";
  export let championName: string = "";
  export let loading: boolean = false;
  export let onClose: () => void;

  let matchupSearchQuery = "";
  let matchupActiveTab: "all_matchups" | "all_synergies" = "all_matchups";
  let matchupSortDir: "asc" | "desc" = "asc";

  const ROLE_LABELS: Record<Role, string> = {
    top: "Top",
    jungle: "Jungle",
    mid: "Middle",
    adc: "Bottom",
    support: "Support",
  };

  $: modalList = overview
    ? matchupActiveTab === "all_matchups"
      ? overview.all_matchups
      : overview.all_synergies
    : [];

  $: modalFiltered = modalList
    .filter(
      (m) =>
        !matchupSearchQuery.trim() ||
        m.name.toLowerCase().includes(matchupSearchQuery.toLowerCase())
    )
    .slice()
    .sort((a, b) => {
      const mult = matchupSortDir === "desc" ? -1 : 1;
      return (a.winrate - b.winrate) * mult;
    });

  function toggleMatchupSort() {
    matchupSortDir = matchupSortDir === "asc" ? "desc" : "asc";
  }

  function formatWinrate(wr?: number | null): string {
    if (wr == null) return "–";
    return `${(wr * 100).toFixed(1)}%`;
  }

  function formatGames(count?: number | null): string {
    if (!count) return "–";
    return count.toLocaleString();
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === "Escape") onClose(); }} />

<div
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm select-none"
  on:click|self={onClose}
  on:keydown|self={(e) => { if (e.key === "Escape") onClose(); }}
>
  <div
    class="relative flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-purple-500/20 bg-[#0c071d] shadow-2xl overflow-hidden"
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between border-b border-purple-500/20 px-5 py-3.5 bg-[#090417]">
      <div>
        <h3 class="text-base font-bold text-white">
          {overview?.name || championName} • All Matchups &amp; Synergies ({ROLE_LABELS[activeRole] || activeRole})
        </h3>
        <p class="text-xs text-slate-400">Complete historical pairing dataset</p>
      </div>
      <button
        type="button"
        aria-label="Close"
        on:click={onClose}
        class="rounded-lg p-1.5 text-slate-400 hover:bg-purple-900/40 hover:text-white transition"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    {#if loading || !overview}
      <div class="flex flex-1 flex-col items-center justify-center gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
        <p class="text-xs text-purple-300/80">Loading matchups data…</p>
      </div>
    {:else}
      <!-- Modal Toolbar & Search -->
      <div class="flex items-center justify-between border-b border-purple-500/15 px-5 py-2.5 gap-3 flex-wrap bg-purple-950/20">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            on:click={() => (matchupActiveTab = "all_matchups")}
            class="rounded-lg px-3 py-1 text-xs font-bold transition {matchupActiveTab === 'all_matchups'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-purple-900/30'}"
          >
            Opponent Matchups ({overview.all_matchups.length})
          </button>
          <button
            type="button"
            on:click={() => (matchupActiveTab = "all_synergies")}
            class="rounded-lg px-3 py-1 text-xs font-bold transition {matchupActiveTab === 'all_synergies'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-purple-900/30'}"
          >
            Team Synergies ({overview.all_synergies.length})
          </button>
        </div>

        <input
          type="text"
          bind:value={matchupSearchQuery}
          placeholder="Filter champion…"
          class="rounded-lg border border-purple-500/20 bg-black/40 px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400"
        />
      </div>

      <!-- Table Header in Modal -->
      <div class="grid grid-cols-12 gap-2 border-b border-purple-500/15 bg-purple-950/30 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <div class="col-span-1 text-center">#</div>
        <div class="col-span-6">Champion</div>
        <div class="col-span-2 text-right">Games</div>
        <button
          type="button"
          on:click={toggleMatchupSort}
          class="col-span-3 flex items-center justify-end gap-1 text-right hover:text-white cursor-pointer transition"
        >
          <span>Win rate</span>
          <span class="text-purple-400 font-bold">{matchupSortDir === "desc" ? "▼" : "▲"}</span>
        </button>
      </div>

      <!-- List Container -->
      <div class="flex-1 overflow-y-auto">
        {#if modalFiltered.length}
          {#each modalFiltered as entry, idx}
            <div class="grid grid-cols-12 gap-2 items-center px-5 py-2 border-b border-purple-500/10 hover:bg-purple-900/20 transition-colors duration-150">
              <div class="col-span-1 text-center text-xs font-semibold text-slate-500">
                {idx + 1}
              </div>
              <div class="col-span-6 flex items-center gap-2.5">
                <div class="relative h-7 w-7 rounded-md overflow-hidden border border-purple-500/30 bg-purple-950/40 shrink-0">
                  <img
                    src={squareIconUrl(entry.image, $ddragonVersion)}
                    alt={entry.name}
                    class="h-full w-full object-cover scale-[1.14]"
                    loading="lazy"
                  />
                </div>
                <span class="text-xs font-semibold text-white">{entry.name}</span>
              </div>
              <div class="col-span-2 text-right text-xs text-slate-400">
                {formatGames(entry.games)} Games
              </div>
              <div class="col-span-3 text-right text-xs font-bold {entry.winrate >= 0.5 ? 'text-emerald-400' : 'text-rose-400'}">
                {formatWinrate(entry.winrate)}
              </div>
            </div>
          {/each}
        {:else}
          <p class="py-12 text-center text-xs text-slate-400">No matching champions found</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
