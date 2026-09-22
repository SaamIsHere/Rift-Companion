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
  export let isSelected = false;
  export let isSwapTarget = false;
  export let isDragging = false;
  export let isAnyDragging = false;

  const dispatch = createEventDispatcher<{
    dragstart: DragEvent;
    dragover: DragEvent;
    dragleave: DragEvent;
    drop: DragEvent;
    dragend: DragEvent;
    slotclick: void;
  }>();

  let imgError = false;
  $: info = pick ? $championCatalog.get(pick.champion_id) : undefined;
  $: name = info?.name ?? (pick ? `Champion ${pick.champion_id}` : "");

  // Draft-board hover preview: while a champion is preselected
  // from the recommendation list, or already locked in via the LCU, hover a
  // teammate/opponent slot to see that specific pairing's historical win rate.
  $: localRole = $draft?.local_role ?? null;
  $: isAllySlot = accent === "purple" || accent === "cyan";
  $: isLocalSlot = pick?.is_local || (!pick && isAllySlot && localRole === role);
  $: isHoveredPick = pick?.is_hover ?? false;
  $: canPreview =
    !isAnyDragging &&
    !isDragging &&
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

  $: if (hovering && canPreview && !isAnyDragging) {
    void loadStat();
  } else if (!hovering || isAnyDragging) {
    stat = null;
  }

  $: referenceName = $referenceChampionId !== null ? $championCatalog.get($referenceChampionId)?.name : undefined;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div
  role={editable ? "button" : "group"}
  draggable={editable && Boolean(pick) ? "true" : "false"}
  on:dragstart={(e) => {
    if (e.dataTransfer && pick) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${role}`);
      if (e.currentTarget instanceof Element) {
        try {
          e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
        } catch (_) {}
      }
    }
    dispatch("dragstart", e);
  }}
  on:dragover={(e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    dispatch("dragover", e);
  }}
  on:dragleave={(e) => {
    const current = e.currentTarget;
    if (current && !current.contains(e.relatedTarget as Node | null)) {
      dispatch("dragleave", e);
    }
  }}
  on:drop={(e) => {
    e.preventDefault();
    dispatch("drop", e);
  }}
  on:dragend={(e) => dispatch("dragend", e)}
  on:click={() => dispatch("slotclick")}
  on:keydown={(e) => {
    if ((e.key === "Enter" || e.key === " ") && editable) {
      e.preventDefault();
      dispatch("slotclick");
    }
  }}
  tabindex={editable ? 0 : -1}
  on:mouseenter={() => { if (!isAnyDragging) hovering = true; }}
  on:mouseleave={() => { hovering = false; }}
  class="group relative flex items-center gap-2 rounded-xl px-3 py-2 border transition-[background-color,border-color,box-shadow,opacity] duration-100 select-none {isDragging
    ? 'opacity-40 border-dashed border-rose-400/60 bg-void-950/30'
    : isDragOver
      ? (accent === 'rose'
          ? 'border-rose-400 bg-rose-900/30 ring-2 ring-rose-400/50 shadow-md'
          : 'border-purple-400 bg-purple-900/30 ring-2 ring-purple-400/50 shadow-md')
      : isSelected
        ? (accent === 'rose'
            ? 'border-rose-400 bg-rose-950/50 ring-2 ring-rose-400/50 shadow-md'
            : 'border-purple-400 bg-purple-950/50 ring-2 ring-purple-400/50 shadow-md')
        : isSwapTarget
          ? (accent === 'rose'
              ? 'border-dashed border-rose-400/60 bg-rose-950/20 hover:bg-rose-900/30 hover:border-rose-300 cursor-pointer shadow-sm'
              : 'border-dashed border-purple-400/60 bg-purple-950/20 hover:bg-purple-900/30 hover:border-purple-300 cursor-pointer shadow-sm')
          : (isHoveredPick && !isLocalSlot)
            ? 'border-dashed border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 shadow-sm'
            : 'border-purple-500/15 bg-void-950/15 hover:bg-purple-900/20'} {isLocalSlot
    ? 'ring-1 ring-inset ring-purple-400/60 bg-purple-950/20 shadow-sm'
    : ''} {editable && pick ? 'cursor-grab active:cursor-grabbing' : editable ? 'cursor-pointer' : ''}"
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

  <!-- Drag Handle for Slots / Spacer if empty -->
  {#if editable}
    <div
      class="flex w-4 items-center justify-center text-slate-500 {accent === 'rose' ? 'group-hover:text-rose-300' : 'group-hover:text-purple-300'} shrink-0 pointer-events-none select-none {pick ? 'cursor-grab active:cursor-grabbing' : 'opacity-25'}"
      title="Drag to reassign role"
    >
      <svg class="h-4 w-4 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="8" cy="6" r="1.5" />
        <circle cx="16" cy="6" r="1.5" />
        <circle cx="8" cy="12" r="1.5" />
        <circle cx="16" cy="12" r="1.5" />
        <circle cx="8" cy="18" r="1.5" />
        <circle cx="16" cy="18" r="1.5" />
      </svg>
    </div>
  {:else}
    <div class="w-4 shrink-0 pointer-events-none" aria-hidden="true"></div>
  {/if}

  <!-- Role Icon (Icon only with tooltip, ensuring avatar vertical alignment) -->
  <div class="flex w-5 items-center justify-center shrink-0 pointer-events-none select-none" title={roleLabel}>
    <img
      src={roleIconUrl(role)}
      alt={roleLabel}
      draggable="false"
      class="h-4.5 w-4.5 opacity-75 group-hover:opacity-100 object-contain filter brightness-110 shrink-0 pointer-events-none select-none"
    />
  </div>

  <!-- Champion Avatar -->
  {#if pick && info && !imgError}
    <div
      class="relative h-9 w-9 rounded-full overflow-hidden pointer-events-none select-none {isHoveredPick && !isLocalSlot
        ? 'ring-2 ring-amber-400/80'
        : 'ring-1 ring-purple-500/30'} bg-void-950/60 shrink-0"
    >
      <img
        src={squareIconUrl(info.key, $ddragonVersion)}
        alt={name}
        draggable="false"
        class="h-full w-full object-cover scale-[1.18] pointer-events-none select-none {isHoveredPick && !isLocalSlot ? 'opacity-85' : ''}"
        on:error={() => (imgError = true)}
      />
    </div>
  {:else if pick}
    <div
      class="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[10px] font-bold pointer-events-none select-none {accent === 'rose'
        ? 'text-rose-300'
        : 'text-purple-300'} {isHoveredPick && !isLocalSlot ? 'ring-2 ring-amber-400/80' : 'ring-1 ring-purple-500/20'} shrink-0"
    >
      {pick.champion_id}
    </div>
  {:else}
    <div class="grid h-9 w-9 place-items-center rounded-full border border-dashed border-purple-500/30 bg-purple-950/15 text-slate-600 shrink-0 pointer-events-none select-none">
      <svg class="h-3.5 w-3.5 opacity-40 text-purple-300 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14" stroke-linecap="round" />
      </svg>
    </div>
  {/if}

  <!-- Champion Name & Subtitle -->
  <div class="min-w-0 flex-1 flex flex-col justify-center pointer-events-none select-none">
    {#if pick}
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="truncate text-sm font-medium {isHoveredPick && !isLocalSlot ? 'text-slate-200' : 'text-white'}">{name}</span>
        {#if pick.is_local}
          <span class="rounded bg-purple-500/25 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-purple-300 ring-1 ring-purple-400/40 shrink-0">
            You
          </span>
        {/if}
        {#if isSelected}
          <span class="inline-flex items-center gap-1 rounded bg-purple-500/30 border border-purple-400/60 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-purple-200 animate-pulse shrink-0">
            Selected
          </span>
        {/if}
        {#if isHoveredPick && !pick.is_local}
          <span class="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-amber-300 shrink-0">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
            Hovering
          </span>
        {/if}
      </div>
      <span class="truncate text-[11px] text-slate-400">
        {#if isSwapTarget}
          <span class="{accent === 'rose' ? 'text-rose-300' : 'text-purple-300'} font-medium">Click to swap here</span>
        {:else}
          {playerLabel || (accent === 'rose' ? "Enemy" : "Teammate")}
        {/if}
      </span>
    {:else if isSwapTarget}
      <div class="flex items-center gap-1.5">
        <span class="text-xs italic font-medium {accent === 'rose' ? 'text-rose-300' : 'text-purple-300'} animate-pulse">
          Click to move here
        </span>
      </div>
    {:else if isAllySlot && localRole === role}
      <div class="flex items-center gap-1.5">
        <span class="text-xs italic text-purple-300/80 font-medium">Waiting for pick...</span>
        <span class="rounded bg-purple-500/25 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-purple-300 ring-1 ring-purple-400/40">
          You
        </span>
      </div>
    {:else}
      <span class="text-xs italic text-slate-500">
        {accent === 'rose' ? "Pick open" : "Waiting for pick..."}
      </span>
    {/if}
  </div>

  <!-- Spells on the right -->
  {#if pick && (pick.spell1_id || pick.spell2_id)}
    <div class="flex items-center gap-1 shrink-0 pointer-events-none select-none">
      {#if pick.spell1_id}
        <img
          src={summonerSpellIconUrl(pick.spell1_id, $ddragonVersion)}
          alt="Spell 1"
          draggable="false"
          class="h-6 w-6 rounded-md object-cover ring-1 ring-white/10 pointer-events-none select-none"
        />
      {/if}
      {#if pick.spell2_id}
        <img
          src={summonerSpellIconUrl(pick.spell2_id, $ddragonVersion)}
          alt="Spell 2"
          draggable="false"
          class="h-6 w-6 rounded-md object-cover ring-1 ring-white/10 pointer-events-none select-none"
        />
      {/if}
    </div>
  {/if}
</div>
