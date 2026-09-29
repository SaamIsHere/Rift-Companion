<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { draft } from "../stores/draft";
  import { recentBans } from "../stores/bans";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { banChampion, hoverChampion, recordBan } from "../ipc/tauri";

  const dispatch = createEventDispatcher<{
    selectOverview: number;
  }>();

  let hoveredChampId: number | null = null;
  let actionMessage: string | null = null;
  let actionTimeout: ReturnType<typeof setTimeout> | null = null;
  let isExecuting = false;

  $: effectiveBans = ($draft?.recent_bans && $draft.recent_bans.length > 0)
    ? $draft.recent_bans
    : $recentBans;

  $: isBanPhase = Boolean($draft?.is_ban_phase);
  $: localBanCompleted = Boolean($draft?.local_ban_completed);
  $: lobbyBans = new Set($draft?.bans || []);

  function showMessage(msg: string) {
    actionMessage = msg;
    if (actionTimeout) clearTimeout(actionTimeout);
    actionTimeout = setTimeout(() => {
      actionMessage = null;
    }, 3000);
  }

  async function handleHover(championId: number) {
    if (isExecuting) return;
    hoveredChampId = championId;
    try {
      const ok = await hoverChampion(championId);
      if (ok) {
        showMessage("Ban hovered in League!");
      }
    } catch (err) {
      console.warn("Failed to hover ban in League client", err);
    }
  }

  async function handleLockIn(championId: number) {
    if (isExecuting) return;
    isExecuting = true;
    try {
      const ok = await banChampion(championId, true);
      if (ok) {
        showMessage("Ban locked in!");
      }
    } catch (err) {
      console.warn("Failed to lock in ban in League client", err);
    } finally {
      isExecuting = false;
    }
  }

  async function loadSampleBans() {
    const samples = [238, 157, 53, 25, 84]; // Zed, Yasuo, Blitzcrank, Morgana, Akali
    for (const id of samples) {
      await recordBan(id);
    }
    showMessage("5 sample bans loaded!");
  }
</script>

<div
  class="mb-3 flex flex-col rounded-xl border border-rose-500/25 bg-gradient-to-b from-rose-950/25 via-void-950/40 to-void-950/50 p-3 shadow-md relative overflow-hidden shrink-0 transition-all duration-300"
>
  <!-- Background Glow & Accent Decoration -->
  <div class="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-rose-500/10 blur-2xl"></div>

  <!-- Title Row: Clean typography, no box around "Ban Phase", no pulsing dot -->
  <div class="flex items-center justify-between gap-2 mb-3 shrink-0 relative z-10">
    <div class="flex items-baseline gap-2 flex-wrap">
      <h3 class="text-sm font-bold text-white tracking-wide">
        Ban Phase
      </h3>
      <span class="text-xs text-slate-400">
        Your most recent bans
      </span>
    </div>

    <!-- Notification / Toast Feedback -->
    {#if actionMessage}
      <span class="text-[11px] font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-md animate-fade-in shadow-sm">
        {actionMessage}
      </span>
    {/if}
  </div>

  <!-- Bans Row: Just the Champion Icons + Name + "Ban" button underneath -->
  {#if effectiveBans.length > 0}
    <div class="flex items-start gap-4 relative z-10 flex-wrap sm:flex-nowrap">
      {#each effectiveBans as champId, idx (champId)}
        {@const info = $championCatalog.get(champId)}
        {@const isBannedByLobby = lobbyBans.has(champId)}
        {@const isHovered = hoveredChampId === champId}
        {@const champName = info?.name || `Champion #${champId}`}
        {@const champKey = info?.key || ""}

        <div class="flex flex-col items-center w-14 shrink-0">
          <!-- Clickable Champion Icon -->
          <button
            type="button"
            disabled={localBanCompleted || isBannedByLobby}
            on:click={() => handleHover(champId)}
            class="relative h-14 w-14 rounded-xl overflow-visible transition-all duration-200 cursor-pointer disabled:cursor-not-allowed focus:outline-none {isBannedByLobby
              ? 'opacity-40 grayscale ring-1 ring-white/10'
              : isHovered
                ? 'ring-2 ring-rose-400 scale-105 shadow-lg shadow-rose-500/20'
                : 'ring-1 ring-purple-500/30 hover:ring-rose-400 hover:scale-105 hover:shadow-md'}"
            title={isBannedByLobby ? `${champName} is already banned in this game` : `Click to hover ${champName} in League`}
          >
            <!-- Number badge on top-left (e.g. #1 in amber for latest ban) -->
            <span
              class="absolute -top-1.5 -left-1.5 z-20 flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-black shadow-md {idx === 0
                ? 'bg-amber-400 text-void-950 ring-1 ring-amber-300'
                : 'bg-purple-600 text-white ring-1 ring-purple-400/50'}"
              title={idx === 0 ? "Latest banned champion (#1)" : `Ban #${idx + 1}`}
            >
              #{idx + 1}
            </span>

            <div class="h-full w-full rounded-xl overflow-hidden bg-void-950">
              {#if champKey}
                <img
                  src={squareIconUrl(champKey, $ddragonVersion)}
                  alt={champName}
                  class="h-full w-full object-cover scale-[1.08] transition duration-200"
                />
              {:else}
                <div class="grid h-full w-full place-items-center text-xs text-slate-400 font-bold">
                  ?
                </div>
              {/if}
            </div>
          </button>

          <!-- Champion Name -->
          <span
            class="w-14 truncate text-center text-[11px] font-semibold text-slate-200 tracking-tight mt-1.5 mb-1"
            title={champName}
          >
            {champName}
          </span>

          <!-- Single "Ban" button to confirm the ban -->
          <button
            type="button"
            disabled={localBanCompleted || isBannedByLobby}
            on:click={() => handleLockIn(champId)}
            class="w-full rounded-lg border border-rose-500/40 bg-rose-600/30 py-1 text-[11px] font-bold text-rose-100 transition hover:border-rose-400 hover:bg-rose-600 hover:text-white active:scale-95 text-center cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title={isBannedByLobby ? "Already banned in this game" : `Lock in ban for ${champName}`}
          >
            {isBannedByLobby ? "Banned" : localBanCompleted ? "Locked" : "Ban"}
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Empty State: No bans tracked yet -->
    <div class="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-rose-500/20 bg-void-950/20 text-center relative z-10">
      <div class="flex items-center gap-2 mb-1">
        <svg class="h-4 w-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <span class="text-xs font-bold text-white">No recent bans recorded yet</span>
      </div>
      <p class="text-[11px] text-slate-400 max-w-sm mb-2.5">
        As you ban champions during Champ Select, Rift Companion records your last 20 bans and suggests your top recent bans here.
      </p>
      <button
        type="button"
        on:click={loadSampleBans}
        class="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 hover:bg-rose-900/50 px-2.5 py-1 text-xs font-semibold text-rose-200 transition-colors shadow-sm cursor-pointer"
      >
        <span>+ Load 5 Sample Bans</span>
      </button>
    </div>
  {/if}
</div>
