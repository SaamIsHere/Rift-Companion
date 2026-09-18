<script lang="ts">
  import { onMount } from "svelte";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { rankTier } from "../stores/rank";
  import { squareIconUrl, roleIconUrl } from "../utils/ddragon";
  import { getChampionsByRole, getChampionOverview } from "../ipc/tauri";
  import { championsViewReset, targetChampion } from "../stores/navigation";
  import type { Role, RoleChampionItem, ChampionOverviewData } from "../types";
  import ChampionOverview from "./ChampionOverview.svelte";
  import MatchupModal from "./MatchupModal.svelte";

  let query = "";
  let selectedRole: Role | null = null;
  let selectedChamp: { champion_id: number; role: Role } | null = null;
  let roleChampions: RoleChampionItem[] = [];
  let loadingRoleData = false;
  let lastLoadedRank: string | null = null;

  let quickMatchupChamp: RoleChampionItem | null = null;
  let quickMatchupOverview: ChampionOverviewData | null = null;
  let quickMatchupLoading = false;

  async function openQuickMatchups(champ: RoleChampionItem) {
    quickMatchupChamp = champ;
    quickMatchupOverview = null;
    quickMatchupLoading = true;
    try {
      quickMatchupOverview = await getChampionOverview(champ.champion_id, champ.role);
    } catch (e) {
      console.warn("Failed to load quick matchups", e);
    } finally {
      quickMatchupLoading = false;
    }
  }

  $: if ($championsViewReset) {
    selectedChamp = null;
    quickMatchupChamp = null;
  }

  $: if ($targetChampion) {
    selectedChamp = {
      champion_id: $targetChampion.champion_id,
      role: $targetChampion.role || "mid",
    };
    targetChampion.set(null);
  }

  type SortKey = "winrate" | "pick_rate" | "ban_rate";
  let sortBy: SortKey = "winrate";
  let sortDir: "asc" | "desc" = "desc";

  const ROLES: { id: Role | null; label: string }[] = [
    { id: null, label: "All" },
    { id: "top", label: "Top" },
    { id: "jungle", label: "Jungle" },
    { id: "mid", label: "Middle" },
    { id: "adc", label: "Bottom" },
    { id: "support", label: "Support" },
  ];

  async function loadRoleData() {
    loadingRoleData = true;
    try {
      roleChampions = await getChampionsByRole(selectedRole);
    } catch (e) {
      console.warn("Failed to load role champions", e);
    } finally {
      loadingRoleData = false;
    }
  }

  $: if ($rankTier && $rankTier !== lastLoadedRank) {
    lastLoadedRank = $rankTier;
    loadRoleData();
  }

  function selectRole(role: Role | null) {
    if (selectedRole === role) return;
    selectedRole = role;
    loadRoleData();
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      sortDir = sortDir === "desc" ? "asc" : "desc";
    } else {
      sortBy = key;
      sortDir = "desc";
    }
  }

  $: catalogList = Array.from($championCatalog.values());

  $: displayList = roleChampions.length > 0
    ? roleChampions
    : catalogList.map((c) => ({
        champion_id: c.id,
        name: c.name,
        image: c.key,
        damage: "physical" as const,
        frontline: false,
        roles: ["mid" as Role],
        role: "mid" as Role,
        tier: "3",
        winrate: 0.5,
        pick_rate: 0.05,
        ban_rate: 0.02,
        games: 0,
        weak_against: [],
        has_build: false,
      }));

  $: filteredList = displayList
    .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice()
    .sort((a, b) => {
      const mult = sortDir === "desc" ? -1 : 1;
      if (sortBy === "winrate") return (a.winrate - b.winrate) * mult;
      if (sortBy === "pick_rate") return (a.pick_rate - b.pick_rate) * mult;
      if (sortBy === "ban_rate") return (a.ban_rate - b.ban_rate) * mult;
      return 0;
    });

  function openChampion(champ: RoleChampionItem) {
    selectedChamp = {
      champion_id: champ.champion_id,
      role: champ.role,
    };
  }

  function formatPercent(val?: number | null): string {
    if (val == null) return "–";
    return `${(val * 100).toFixed(2)}%`;
  }
</script>

{#if selectedChamp !== null}
  <ChampionOverview
    championId={selectedChamp.champion_id}
    initialRole={selectedChamp.role}
    onBack={() => selectedChamp = null}
  />
{:else}
  <div class="flex min-h-0 flex-1 flex-col p-6 overflow-hidden select-none">
    <!-- Top Navigation Toolbar matching Listenansicht.png -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
      <!-- Search Input (h-11, w-60) -->
      <div class="relative h-11 w-60">
        <svg
          class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-300/60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          bind:value={query}
          placeholder="Search champion…"
          class="h-full w-full rounded-xl border border-purple-500/20 bg-void-950/40 backdrop-blur-md pl-10 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400/40 shadow-inner"
        />
      </div>

      <!-- Role Tabs (h-11, Icons only: All, Top, Jungle, Middle, Bottom, Support) -->
      <div class="flex h-11 items-center gap-1 rounded-xl border border-purple-500/20 bg-void-950/40 p-1 backdrop-blur-md shadow-md">
        {#each ROLES as r (r.label)}
          {@const isActive = selectedRole === r.id}
          <button
            type="button"
            on:click={() => selectRole(r.id)}
            title={r.label}
            aria-label={r.label}
            class="flex h-full aspect-square items-center justify-center rounded-lg transition {isActive
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-purple-200 hover:bg-purple-950/40'}"
          >
            <img
              src={roleIconUrl(r.id || "all")}
              alt={r.label}
              class="h-5 w-5 shrink-0 object-contain {isActive
                ? 'brightness-125'
                : 'opacity-60 brightness-90 hover:opacity-100'}"
            />
          </button>
        {/each}
      </div>
    </div>

    <!-- Champions List Table Container -->
    <div class="glass flex min-h-0 flex-1 flex-col rounded-2xl overflow-hidden">
      <!-- Table Header -->
      <div class="grid grid-cols-12 gap-2 border-b border-purple-500/15 bg-purple-950/20 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <div class="col-span-1 text-center">Rank</div>
        <div class="col-span-3">Champion</div>
        <div class="col-span-1 text-center">Role</div>

        <!-- Sortable Win Rate -->
        <button
          type="button"
          on:click={() => toggleSort("winrate")}
          class="col-span-2 flex items-center justify-center gap-1 hover:text-white transition group cursor-pointer"
        >
          <span>Win rate</span>
          <span class="text-[10px] {sortBy === 'winrate' ? 'text-purple-400 font-black' : 'text-slate-600 group-hover:text-slate-400'}">
            {sortBy === 'winrate' ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
          </span>
        </button>

        <!-- Sortable Pick Rate -->
        <button
          type="button"
          on:click={() => toggleSort("pick_rate")}
          class="col-span-1 flex items-center justify-center gap-1 hover:text-white transition group cursor-pointer"
        >
          <span>Pick rate</span>
          <span class="text-[10px] {sortBy === 'pick_rate' ? 'text-purple-400 font-black' : 'text-slate-600 group-hover:text-slate-400'}">
            {sortBy === 'pick_rate' ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
          </span>
        </button>

        <!-- Sortable Ban Rate -->
        <button
          type="button"
          on:click={() => toggleSort("ban_rate")}
          class="col-span-1 flex items-center justify-center gap-1 hover:text-white transition group cursor-pointer"
        >
          <span>Ban rate</span>
          <span class="text-[10px] {sortBy === 'ban_rate' ? 'text-purple-400 font-black' : 'text-slate-600 group-hover:text-slate-400'}">
            {sortBy === 'ban_rate' ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
          </span>
        </button>

        <div class="col-span-3 text-right pr-2">Weak against</div>
      </div>

      <!-- Table Body Rows -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if loadingRoleData}
          <div class="flex h-64 flex-col items-center justify-center gap-2">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
            <span class="text-xs text-purple-300">Loading champions…</span>
          </div>
        {:else if filteredList.length}
          {#each filteredList as champ, idx (champ.champion_id + '-' + champ.role)}
            <div
              role="button"
              tabindex="0"
              on:click={() => openChampion(champ)}
              on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChampion(champ); } }}
              class="grid grid-cols-12 gap-2 items-center px-5 py-2.5 border-b border-purple-500/10 transition-colors duration-150 hover:bg-purple-900/25 cursor-pointer group text-left"
            >
              <!-- Rank -->
              <div class="col-span-1 text-center text-xs font-semibold text-slate-400 group-hover:text-slate-200">
                {idx + 1}
              </div>

              <!-- Champion Icon + Name -->
              <div class="col-span-3 flex items-center gap-3">
                <div class="relative h-8 w-8 rounded-lg overflow-hidden border border-purple-500/30 bg-void-950/60 shrink-0 group-hover:border-purple-400 shadow-sm transition">
                  <img
                    src={squareIconUrl(champ.image, $ddragonVersion)}
                    alt={champ.name}
                    class="h-full w-full object-cover scale-[1.14] group-hover:scale-[1.22] transition-transform duration-200"
                    loading="lazy"
                  />
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-xs font-bold text-slate-100 group-hover:text-white truncate">
                    {champ.name}
                  </span>
                </div>
              </div>

              <!-- Role Icon -->
              <div class="col-span-1 flex items-center justify-center">
                <img
                  src={roleIconUrl(champ.role)}
                  alt={champ.role}
                  title={champ.role ? champ.role.toUpperCase() : "ROLE"}
                  class="h-4 w-4 object-contain brightness-110 opacity-90 transition duration-150 group-hover:opacity-100 group-hover:scale-110"
                />
              </div>

              <!-- Win rate -->
              <div class="col-span-2 text-center text-xs font-bold {champ.winrate >= 0.515 ? 'text-emerald-400' : champ.winrate <= 0.485 ? 'text-rose-400' : 'text-slate-200'}">
                {formatPercent(champ.winrate)}
              </div>

              <!-- Pick rate -->
              <div class="col-span-1 text-center text-xs font-semibold text-slate-300">
                {formatPercent(champ.pick_rate)}
              </div>

              <!-- Ban rate -->
              <div class="col-span-1 text-center text-xs font-semibold text-slate-400">
                {formatPercent(champ.ban_rate)}
              </div>

              <!-- Weak against (3 counter champion icons + Counterpicks shortcut button) -->
              <div class="col-span-3 flex items-center justify-end gap-1.5 pr-2">
                {#if champ.weak_against && champ.weak_against.length}
                  {#each champ.weak_against as counter}
                    <div
                      class="relative h-6 w-6 rounded-full overflow-hidden border border-purple-500/30 bg-void-950/60 shrink-0 hover:border-purple-400 hover:scale-115 transition duration-150 shadow-sm"
                      title="{counter.name} ({(counter.winrate * 100).toFixed(1)}% WR)"
                    >
                      <img
                        src={squareIconUrl(counter.image, $ddragonVersion)}
                        alt={counter.name}
                        class="h-full w-full object-cover scale-[1.18]"
                        loading="lazy"
                      />
                    </div>
                  {/each}
                {:else}
                  <span class="text-[10px] text-slate-500 mr-1">–</span>
                {/if}

                <!-- Quick shortcut to open all counter matchups directly in modal -->
                <button
                  type="button"
                  on:click|stopPropagation={() => openQuickMatchups(champ)}
                  class="ml-1 flex h-6 items-center gap-1 rounded-md border border-purple-500/30 bg-purple-950/60 px-1.5 text-[10px] font-bold text-purple-200 shadow-sm transition hover:border-purple-400 hover:bg-purple-800/80 hover:text-white active:scale-95 shrink-0"
                  title="View all counter matchups for {champ.name}"
                >
                  <span>All</span>
                  <svg class="h-2.5 w-2.5 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          {/each}
        {:else}
          <div class="flex h-64 flex-col items-center justify-center text-sm text-slate-400">
            No champions found matching "{query}".
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if quickMatchupChamp}
  <MatchupModal
    championName={quickMatchupChamp.name}
    activeRole={quickMatchupChamp.role}
    overview={quickMatchupOverview}
    loading={quickMatchupLoading}
    onClose={() => {
      quickMatchupChamp = null;
      quickMatchupOverview = null;
    }}
  />
{/if}
