<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { DraftPick, PairwiseStat, Role } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl, roleIconUrl, summonerSpellIconUrl } from "../utils/ddragon";
  import { getPairwiseStat } from "../ipc/tauri";
  import { draft } from "../stores/draft";
  import { referenceChampionId } from "../stores/preselect";

  export let pick: DraftPick | null = null;
  export let role: Role;
  export let roleLabel: string;
  export let accent: "purple" | "rose" | "cyan" = "purple";
  export let editable = false;
  export let playerLabel: string = "";
  export let isDragOver = false;

  const dispatch = createEventDispatcher<{
    dragstart: DragEvent;
    dragover: DragEvent;
    dragleave: DragEvent;
    drop: DragEvent;
  }>();

  let imgError = false;
  $: info = pick ? $championCatalog.get(pick.champion_id) : undefined;
  $: name = info?.name ?? (pick ? `Champion ${pick.champion_id}` : "");

  // Draft-board hover preview: while a champion is preselected
  // from the recommendation list, or already locked in via the LCU, hover a
  // teammate/opponent slot to see that specific pairing's historical win rate.
  $: localRole = $draft?.local_role ?? null;
  $: isAllySlot = accent === "purple" || accent === "cyan";
  $: canPreview =
    Boolean(pick) &&
    !pick?.is_local &&
    $referenceChampionId !== null &&
    localRole !== null &&
    $referenceChampionId !== pick?.champion_id;

  let hovering = false;
  let stat: PairwiseStat | null = null;
  let loading = false;
  let requestToken = 0;

  async function loadStat() {
    if (!canPreview || $referenceChampionId === null || localRole === null || !pick) return;
    const token = ++requestToken;
    loading = true;
    try {
      const result = await getPairwiseStat($referenceChampionId, localRole, pick.champion_id, isAllySlot);
      if (token === requestToken) stat = result;
    } catch (err) {
      console.error("Failed to fetch pairwise stat", err);
      if (token === requestToken) stat = null;
    } finally {
      if (token === requestToken) loading = false;
    }
  }

  $: if (hovering && canPreview) {
    void loadStat();
  } else if (!hovering) {
    stat = null;
  }

  $: referenceName = $referenceChampionId !== null ? $championCatalog.get($referenceChampionId)?.name : undefined;
</script>

<div
  role="group"
  draggable={editable && Boolean(pick)}
  on:dragstart={(e) => dispatch("dragstart", e)}
  on:dragover={(e) => dispatch("dragover", e)}
  on:dragleave={(e) => dispatch("dragleave", e)}
  on:drop={(e) => dispatch("drop", e)}
  on:mouseenter={() => (hovering = true)}
  on:mouseleave={() => (hovering = false)}
  class="group relative flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-150 select-none {isDragOver
    ? 'ring-2 ring-purple-400 bg-purple-900/40 shadow-lg shadow-purple-500/20'
    : 'bg-[#120826]/70 hover:bg-[#190c33]/85 border border-purple-500/15'} {pick?.is_local
    ? 'ring-1 ring-purple-400/80 bg-purple-950/40 shadow-sm'
    : ''} {editable && pick ? 'cursor-grab active:cursor-grabbing' : ''}"
>
  <!-- Hover Preview Tooltip -->
  {#if hovering && canPreview}
    <div
      class="glass pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg px-3 py-2 text-xs shadow-xl"
    >
      <p class="mb-0.5 text-slate-400">
        {referenceName ?? "Your pick"} {isAllySlot ? "with" : "vs"} {name}
      </p>
      {#if loading}
        <p class="text-slate-500">Loading stats…</p>
      {:else if stat}
        <p
          class="font-semibold {stat.delta > 0.005
            ? 'text-emerald-400'
            : stat.delta < -0.005
              ? 'text-rose-400'
              : 'text-slate-300'}"
        >
          {(stat.winrate * 100).toFixed(1)}% win rate ({stat.games.toLocaleString()} games)
        </p>
      {:else}
        <p class="text-slate-500">Not enough data yet</p>
      {/if}
    </div>
  {/if}

  <!-- Drag Handle for Enemy Slots / Spacer for Ally Slots -->
  {#if editable}
    <div
      class="flex w-4 items-center justify-center text-slate-500 group-hover:text-purple-300 shrink-0 {pick ? 'cursor-grab active:cursor-grabbing' : 'opacity-25'}"
      title="Drag to reassign role"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="8" cy="6" r="1.5" />
        <circle cx="16" cy="6" r="1.5" />
        <circle cx="8" cy="12" r="1.5" />
        <circle cx="16" cy="12" r="1.5" />
        <circle cx="8" cy="18" r="1.5" />
        <circle cx="16" cy="18" r="1.5" />
      </svg>
    </div>
  {:else}
    <div class="w-4 shrink-0" aria-hidden="true"></div>
  {/if}

  <!-- Role Icon (Icon only with tooltip, ensuring avatar vertical alignment) -->
  <div class="flex w-6 items-center justify-center shrink-0" title={roleLabel}>
    <img
      src={roleIconUrl(role)}
      alt={roleLabel}
      class="h-4.5 w-4.5 opacity-75 group-hover:opacity-100 object-contain filter brightness-110 shrink-0"
    />
  </div>

  <!-- Champion Avatar -->
  {#if pick && info && !imgError}
    <div class="relative h-9 w-9 rounded-full overflow-hidden ring-1 ring-purple-500/30 bg-[#120924] shrink-0">
      <img
        src={squareIconUrl(info.key, $ddragonVersion)}
        alt={name}
        class="h-full w-full object-cover scale-[1.12]"
        on:error={() => (imgError = true)}
      />
    </div>
  {:else if pick}
    <div
      class="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[10px] font-bold {accent === 'rose'
        ? 'text-rose-300'
        : 'text-purple-300'} ring-1 ring-purple-500/20 shrink-0"
    >
      {pick.champion_id}
    </div>
  {:else}
    <div class="grid h-9 w-9 place-items-center rounded-full border border-dashed border-purple-500/30 bg-purple-950/15 text-slate-600 shrink-0">
      <svg class="h-3.5 w-3.5 opacity-40 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14" stroke-linecap="round" />
      </svg>
    </div>
  {/if}

  <!-- Champion Name & Subtitle -->
  <div class="min-w-0 flex-1 flex flex-col justify-center">
    {#if pick}
      <div class="flex items-center gap-1.5">
        <span class="truncate text-sm font-medium text-white">{name}</span>
        {#if pick.is_local}
          <span class="rounded bg-purple-500/25 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-purple-300 ring-1 ring-purple-400/40">
            You
          </span>
        {/if}
      </div>
      <span class="truncate text-[11px] text-slate-400">
        {playerLabel || (editable ? "Enemy" : "Teammate")}
      </span>
    {:else}
      <span class="text-xs italic text-slate-500">
        {editable ? "Pick open" : "Waiting for pick..."}
      </span>
    {/if}
  </div>

  <!-- Spells on the right -->
  {#if pick && (pick.spell1_id || pick.spell2_id)}
    <div class="flex items-center gap-1 shrink-0">
      {#if pick.spell1_id}
        <img
          src={summonerSpellIconUrl(pick.spell1_id, $ddragonVersion)}
          alt="Spell 1"
          class="h-6 w-6 rounded-md object-cover ring-1 ring-white/10"
        />
      {/if}
      {#if pick.spell2_id}
        <img
          src={summonerSpellIconUrl(pick.spell2_id, $ddragonVersion)}
          alt="Spell 2"
          class="h-6 w-6 rounded-md object-cover ring-1 ring-white/10"
        />
      {/if}
    </div>
  {/if}
</div>
