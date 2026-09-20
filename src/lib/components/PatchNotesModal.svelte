<script lang="ts">
  import { patchNotesData } from "../stores/patchNotes";
  import type { PatchChangeItem } from "../data/patchNotes";
  import { ddragonVersion, championCatalog } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { navigateToChampion } from "../stores/navigation";
  import { openInBrowser, type PatchInfo } from "../ipc/tauri";
  import { updateAvailable, updateVersion, showUpdateModal } from "../stores/updater";

  export let isOpen = false;
  export let currentPatch: PatchInfo;
  export let onClose: () => void;

  type FilterType = "all" | "buff" | "nerf" | "adjustment" | "app";
  let activeFilter: FilterType = "all";
  let searchQuery = "";

  $: patchDisplay = currentPatch?.display || $patchNotesData.patchVersion;

  $: filteredChanges = $patchNotesData.changes.filter((item) => {
    if (activeFilter !== "all" && item.type !== activeFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.target && item.target.toLowerCase().includes(q)) ||
      item.summary.toLowerCase().includes(q) ||
      item.details.some((d) => d.toLowerCase().includes(q))
    );
  });

  $: countByType = {
    all: $patchNotesData.changes.length,
    buff: $patchNotesData.changes.filter((c) => c.type === "buff").length,
    nerf: $patchNotesData.changes.filter((c) => c.type === "nerf").length,
    adjustment: $patchNotesData.changes.filter((c) => c.type === "adjustment").length,
    app: $patchNotesData.changes.filter((c) => c.type === "app").length,
  };

  function handleInspectChampion(champId: number, role?: any) {
    onClose();
    navigateToChampion(champId, role);
  }

  function handleOpenBrowser() {
    if (currentPatch?.url) {
      openInBrowser(currentPatch.url);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window on:keydown={isOpen ? handleKeydown : undefined} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm select-none animate-fade-in"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    on:click|self={onClose}
    on:keydown|self={(e) => { if (e.key === "Escape") onClose(); }}
  >
    <div
      class="glass relative flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl overflow-hidden"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-purple-500/20 bg-void-950/40 px-6 py-4 shrink-0">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded bg-purple-600/30 border border-purple-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-200">
              League of Legends • Patch {patchDisplay}
            </span>
            <span class="text-xs text-slate-400">• Balance Highlights</span>
          </div>
          <h2 class="mt-1 text-lg font-black tracking-wide text-white flex items-center gap-2">
            <span>📜 Latest Changes &amp; Patch Notes</span>
          </h2>
        </div>

        <div class="flex items-center gap-2">
          {#if currentPatch?.url}
            <button
              type="button"
              on:click={handleOpenBrowser}
              class="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:bg-purple-900/50 hover:text-white hover:border-purple-400"
              title="Open full Riot Games patch notes in web browser"
            >
              <span>Full Patch Notes</span>
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          {/if}

          <button
            type="button"
            on:click={onClose}
            class="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Toolbar & Category Filter Tabs -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/15 bg-void-950/20 px-6 py-2.5 shrink-0">
        <!-- Filter Tabs -->
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            on:click={() => (activeFilter = "all")}
            class="rounded-lg px-2.5 py-1 text-xs font-bold transition {activeFilter === 'all'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-purple-950/40'}"
          >
            All ({countByType.all})
          </button>
          <button
            type="button"
            on:click={() => (activeFilter = "buff")}
            class="rounded-lg px-2.5 py-1 text-xs font-bold transition {activeFilter === 'buff'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-emerald-300 hover:bg-emerald-950/30'}"
          >
            🟢 Buffs ({countByType.buff})
          </button>
          <button
            type="button"
            on:click={() => (activeFilter = "nerf")}
            class="rounded-lg px-2.5 py-1 text-xs font-bold transition {activeFilter === 'nerf'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/30'}"
          >
            🔴 Nerfs ({countByType.nerf})
          </button>
          <button
            type="button"
            on:click={() => (activeFilter = "adjustment")}
            class="rounded-lg px-2.5 py-1 text-xs font-bold transition {activeFilter === 'adjustment'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-amber-300 hover:bg-amber-950/30'}"
          >
            ⚙️ Items &amp; Systems ({countByType.adjustment})
          </button>
          <button
            type="button"
            on:click={() => (activeFilter = "app")}
            class="rounded-lg px-2.5 py-1 text-xs font-bold transition {activeFilter === 'app'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-purple-200 hover:bg-purple-950/40'}"
          >
            ⚡ Rift Updates ({countByType.app})
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative w-48">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search change..."
            class="w-full rounded-lg border border-purple-500/25 bg-void-950/50 pl-7 pr-2.5 py-1 text-xs text-white placeholder-slate-400 outline-none focus:border-purple-400"
          />
          <svg
            class="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-purple-400/60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      <!-- Patch Changes List -->
      <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
        {#if $updateAvailable}
          <div class="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 to-purple-950/60 p-3.5 shadow-lg animate-fade-in mb-1">
            <div class="flex items-center gap-3">
              <div class="grid h-8 w-8 place-items-center rounded-lg border border-emerald-400/40 bg-emerald-900/40 text-emerald-300">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div class="flex flex-col">
                <span class="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Rift Companion v{$updateVersion} is available!</span>
                  <span class="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-300 border border-emerald-500/40 font-semibold">New Update</span>
                </span>
                <span class="text-[11px] text-slate-300">Click below to review release notes and install in one click.</span>
              </div>
            </div>
            <button
              type="button"
              on:click={() => showUpdateModal.set(true)}
              class="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 shrink-0"
            >
              <span>Update Now</span>
            </button>
          </div>
        {/if}

        {#if filteredChanges.length === 0}
          <div class="flex h-48 flex-col items-center justify-center text-center text-slate-400">
            <span class="text-3xl">🔍</span>
            <p class="mt-2 text-xs font-semibold">No patch changes matching "{searchQuery}".</p>
            <button
              type="button"
              on:click={() => { searchQuery = ""; activeFilter = "all"; }}
              class="mt-3 text-xs text-purple-300 underline hover:text-white"
            >
              Reset filters
            </button>
          </div>
        {:else}
          {#each filteredChanges as item (item.id)}
            {@const isBuff = item.type === "buff"}
            {@const isNerf = item.type === "nerf"}
            {@const isApp = item.type === "app"}
            {@const champInfo = item.championId ? $championCatalog.get(item.championId) : null}

            <div class="rounded-xl border border-purple-500/15 bg-void-950/20 p-4 transition hover:bg-void-950/30">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <!-- Left: Avatar / Icon & Title -->
                <div class="flex items-center gap-3">
                  {#if item.championKey}
                    <div class="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-purple-500/30 bg-void-950 shadow-sm">
                      <img
                        src={squareIconUrl(champInfo?.key || item.championKey, $ddragonVersion)}
                        alt={item.title}
                        class="h-full w-full object-cover scale-[1.14]"
                        loading="lazy"
                      />
                    </div>
                  {:else if isApp}
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/40 text-lg shadow-sm">
                      ⚡
                    </div>
                  {:else}
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/40 text-lg shadow-sm">
                      🛡️
                    </div>
                  {/if}

                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-bold text-white">{item.title}</h3>
                      {#if item.role}
                        <span class="rounded bg-black/40 border border-purple-500/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide text-purple-200">
                          {item.role}
                        </span>
                      {/if}
                      <span
                        class="rounded border px-2 py-0.2 text-[9px] font-extrabold uppercase tracking-wider {isBuff
                          ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                          : isNerf
                          ? 'border-rose-500/40 bg-rose-950/40 text-rose-300'
                          : isApp
                          ? 'border-purple-500/40 bg-purple-950/40 text-purple-200'
                          : 'border-amber-500/40 bg-amber-950/40 text-amber-300'}"
                      >
                        {isBuff ? "BUFF" : isNerf ? "NERF" : isApp ? "COMPANION UPDATE" : "ADJUSTMENT"}
                      </span>
                    </div>

                    {#if item.target}
                      <p class="text-xs font-semibold text-purple-300/80 mt-0.5">
                        Target: {item.target}
                      </p>
                    {/if}
                  </div>
                </div>

                <!-- Right: Quick Inspect Link if Champion -->
                {#if item.championId != null}
                  {@const cId = item.championId}
                  <button
                    type="button"
                    on:click={() => handleInspectChampion(cId, item.role)}
                    class="flex items-center gap-1.5 rounded-lg border border-purple-500/25 bg-purple-950/30 px-3 py-1 text-xs font-semibold text-purple-200 transition hover:bg-purple-900/50 hover:text-white hover:border-purple-400 shrink-0"
                    title="Inspect {item.title} winrate and recommended build in Rift Companion"
                  >
                    <span>View Champion</span>
                    <span class="text-purple-400">➔</span>
                  </button>
                {/if}
              </div>

              <!-- Summary text -->
              <p class="mt-2.5 text-xs text-slate-300 leading-relaxed">
                {item.summary}
              </p>

              <!-- Specific numeric bullet changes -->
              {#if item.details && item.details.length > 0}
                <ul class="mt-2.5 space-y-1 rounded-lg border border-purple-500/10 bg-black/20 p-2.5 text-xs text-slate-200">
                  {#each item.details as detail}
                    <li class="flex items-start gap-2">
                      <span class="mt-0.5 text-[10px] {isBuff ? 'text-emerald-400' : isNerf ? 'text-rose-400' : 'text-purple-400'}">
                        {isBuff ? '▲' : isNerf ? '▼' : '◆'}
                      </span>
                      <span class="font-mono text-[11px] text-slate-200">{detail}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between border-t border-purple-500/15 bg-void-950/40 px-6 py-3 shrink-0">
        <p class="text-[11px] text-slate-400">
          Source: Riot Games League of Legends Balance Update v{patchDisplay}
        </p>
        <button
          type="button"
          on:click={onClose}
          class="rounded-xl border border-purple-500/30 bg-purple-950/40 px-4 py-1.5 text-xs font-bold text-purple-200 transition hover:bg-purple-900/60 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
