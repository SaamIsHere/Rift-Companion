<script lang="ts">
  import type { DraftPick, Role } from "../types";
  import { draft } from "../stores/draft";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { setChampionRole, swapChampionRoles } from "../ipc/tauri";
  import { referenceChampionId } from "../stores/preselect";
  import ChampSlot from "./ChampSlot.svelte";

  const ROLE_DEFS: { role: Role; label: string }[] = [
    { role: "top", label: "Top" },
    { role: "jungle", label: "Jungle" },
    { role: "mid", label: "Mid" },
    { role: "adc", label: "ADC" },
    { role: "support", label: "Support" },
  ];

  let draggedSlot: { championId: number; role: Role; team: "ally" | "enemy" } | null = null;
  let dragOverSlot: { role: Role; team: "ally" | "enemy" } | null = null;
  let selectedSlot: { championId: number; role: Role; team: "ally" | "enemy" } | null = null;

  $: inChampSelect = $draft !== null;
  $: referenceName = inChampSelect && $referenceChampionId !== null ? $championCatalog.get($referenceChampionId)?.name : undefined;
  $: lockedAlliesCount = $draft?.allies.filter((p) => !p.is_hover).length ?? 0;
  $: lockedEnemiesCount = $draft?.enemies.filter((p) => !p.is_hover).length ?? 0;

  function mapPicksToRoles(picks: DraftPick[], isEnemy = false) {
    const assigned = new Set<number>();
    const result = ROLE_DEFS.map((def) => {
      const found = picks.find((p) => p.role === def.role && !assigned.has(p.champion_id));
      if (found) {
        assigned.add(found.champion_id);
        return { ...def, pick: found, playerLabel: "" };
      }
      return { ...def, pick: null, playerLabel: "" };
    });

    const unassigned = picks.filter((p) => !assigned.has(p.champion_id));
    let unassignedIdx = 0;
    for (let i = 0; i < result.length && unassignedIdx < unassigned.length; i++) {
      if (!result[i].pick) {
        result[i].pick = unassigned[unassignedIdx++];
      }
    }

    let playerCounter = 1;
    result.forEach((slot) => {
      if (slot.pick) {
        slot.playerLabel = slot.pick.is_local ? "You" : isEnemy ? `Enemy ${playerCounter++}` : `Player ${playerCounter++}`;
      } else if (!isEnemy && slot.role === $draft?.local_role) {
        slot.playerLabel = "You";
      }
    });

    return result;
  }

  $: allySlots = mapPicksToRoles($draft?.allies || [], false);
  $: enemySlots = mapPicksToRoles($draft?.enemies || [], true);

  async function executeRoleReassign(
    sourceChampId: number,
    sourceRole: Role,
    targetRole: Role,
    targetPick: DraftPick | null,
    team: "ally" | "enemy",
  ) {
    if (sourceRole === targetRole) return;
    const isEnemy = team === "enemy";

    // Optimistic store update
    draft.update((d) => {
      if (!d) return d;
      const next = { ...d };
      const picks = isEnemy ? [...next.enemies] : [...next.allies];

      const sourceIdx = picks.findIndex((p) => p.champion_id === sourceChampId);
      const targetIdx = targetPick ? picks.findIndex((p) => p.champion_id === targetPick.champion_id) : -1;

      if (sourceIdx !== -1) {
        picks[sourceIdx] = { ...picks[sourceIdx], role: targetRole };
        if (!isEnemy && picks[sourceIdx].is_local) {
          next.local_role = targetRole;
        }
      }
      if (targetIdx !== -1 && targetPick) {
        picks[targetIdx] = { ...picks[targetIdx], role: sourceRole };
        if (!isEnemy && picks[targetIdx].is_local) {
          next.local_role = sourceRole;
        }
      }

      if (isEnemy) {
        next.enemies = picks;
      } else {
        next.allies = picks;
      }
      return next;
    });

    try {
      if (targetPick && targetPick.champion_id !== sourceChampId) {
        await swapChampionRoles(sourceChampId, targetRole, targetPick.champion_id, sourceRole, isEnemy);
      } else {
        await setChampionRole(sourceChampId, targetRole, isEnemy);
      }
    } catch (err) {
      console.error(`Failed to reassign ${team} role`, err);
    }
  }

  function handleDragStart(champId: number, fromRole: Role, team: "ally" | "enemy", e: DragEvent) {
    selectedSlot = null; // Clear click selection on drag
    draggedSlot = { championId: champId, role: fromRole, team };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${team}:${champId}:${fromRole}`);
    }
  }

  function handleDragOver(role: Role, team: "ally" | "enemy", e: DragEvent) {
    if (!draggedSlot || draggedSlot.team !== team) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (dragOverSlot?.role !== role || dragOverSlot?.team !== team) {
      dragOverSlot = { role, team };
    }
  }

  function handleDragEnd() {
    draggedSlot = null;
    dragOverSlot = null;
  }

  async function handleDrop(targetRole: Role, targetPick: DraftPick | null, team: "ally" | "enemy", e: DragEvent) {
    e.preventDefault();
    const currentDrag = draggedSlot;
    draggedSlot = null;
    dragOverSlot = null;

    if (!currentDrag || currentDrag.team !== team || currentDrag.role === targetRole) {
      return;
    }

    await executeRoleReassign(currentDrag.championId, currentDrag.role, targetRole, targetPick, team);
  }

  async function handleSlotClick(role: Role, pick: DraftPick | null, team: "ally" | "enemy") {
    if (team !== "enemy") return;

    // If nothing selected yet:
    if (!selectedSlot) {
      if (pick) {
        selectedSlot = { championId: pick.champion_id, role, team };
      }
      return;
    }

    // Clicking the same slot cancels selection
    if (selectedSlot.role === role && selectedSlot.team === team) {
      selectedSlot = null;
      return;
    }

    // Clicking across teams (or invalid) resets
    if (selectedSlot.team !== team) {
      selectedSlot = pick ? { championId: pick.champion_id, role, team } : null;
      return;
    }

    // Same team: perform swap or reassign!
    const source = selectedSlot;
    selectedSlot = null;
    await executeRoleReassign(source.championId, source.role, role, pick, team);
  }
</script>

<svelte:window on:keydown={(e) => { if (e.key === "Escape") { selectedSlot = null; } }} />

<section class="glass flex min-h-0 flex-col rounded-2xl p-5 overflow-hidden">
  <!-- Header -->
  <div class="mb-4 flex items-center justify-between gap-2 shrink-0">
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="grid h-8 w-8 place-items-center rounded-xl bg-purple-600/20 text-purple-300 ring-1 ring-purple-500/30 shrink-0">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <div class="min-w-0">
        <h2 class="text-sm font-bold text-white tracking-wide truncate">Picked Champions</h2>
        <p class="text-[11px] text-slate-400 truncate">Drag or click enemy champions to swap roles.</p>
      </div>
    </div>

    {#if selectedSlot}
      <button
        type="button"
        on:click={() => (selectedSlot = null)}
        class="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-900/50 hover:bg-rose-800/70 border border-rose-500/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
        title="Cancel role swap"
      >
        <span>Cancel Swap</span>
        <span class="text-[10px] text-slate-400 font-mono">(Esc)</span>
      </button>
    {:else if inChampSelect && referenceName}
      <span class="text-xs text-slate-400 bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 rounded-lg shrink-0 truncate max-w-[150px]">
        Preview: <strong class="text-purple-300 font-semibold">{referenceName}</strong>
      </span>
    {/if}
  </div>

  {#if $draft && inChampSelect}
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1 pl-1 pr-2">
      <!-- Your Team (Auto-detected from live client, read-only) -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-purple-300/80">Your Team</h3>
          <span class="text-[11px] text-slate-400 font-medium">{lockedAlliesCount}/5 picked</span>
        </div>
        <div class="flex flex-col gap-1.5">
          {#each allySlots as slot (slot.role)}
            <ChampSlot
              pick={slot.pick}
              role={slot.role}
              roleLabel={slot.label}
              accent="purple"
              editable={false}
              playerLabel={slot.playerLabel}
            />
          {/each}
        </div>
      </div>

      <!-- Enemy Team (Manually adjustable via Drag & Drop or Click to Swap) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex flex-col gap-2 pt-1 border-t border-purple-500/15"
        on:dragleave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            dragOverSlot = null;
          }
        }}
      >
        <div class="flex items-center justify-between px-1">
          <h3 class="text-xs font-bold uppercase tracking-wider text-rose-300/80">Enemy Team</h3>
          <span class="text-[11px] text-slate-400 font-medium">{lockedEnemiesCount}/5 picked</span>
        </div>
        <div class="flex flex-col gap-1.5">
          {#each enemySlots as slot (slot.role)}
            <ChampSlot
              pick={slot.pick}
              role={slot.role}
              roleLabel={slot.label}
              accent="rose"
              editable={true}
              playerLabel={slot.playerLabel}
              isDragOver={dragOverSlot?.team === "enemy" && dragOverSlot?.role === slot.role}
              isSelected={selectedSlot?.team === "enemy" && selectedSlot?.role === slot.role}
              isSwapTarget={Boolean(selectedSlot && selectedSlot.team === "enemy" && selectedSlot.role !== slot.role && !draggedSlot)}
              isDragging={draggedSlot?.team === "enemy" && draggedSlot?.role === slot.role}
              isAnyDragging={Boolean(draggedSlot)}
              on:dragstart={(e) => slot.pick && handleDragStart(slot.pick.champion_id, slot.role, "enemy", e.detail)}
              on:dragover={(e) => handleDragOver(slot.role, "enemy", e.detail)}
              on:dragend={handleDragEnd}
              on:drop={(e) => handleDrop(slot.role, slot.pick, "enemy", e.detail)}
              on:slotclick={() => handleSlotClick(slot.role, slot.pick, "enemy")}
            />
          {/each}
        </div>
      </div>

      <!-- Bans Section -->
      {#if $draft.bans.length}
        <div class="border-t border-purple-500/15 pt-3">
          <p class="mb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Bans</p>
          <div class="flex flex-wrap gap-1.5">
            {#each $draft.bans as id, idx (`${id}-${idx}`)}
              {@const info = $championCatalog.get(id)}
              {#if info}
                <img
                  src={squareIconUrl(info.key, $ddragonVersion)}
                  alt={info.name}
                  title={info.name}
                  class="h-7 w-7 rounded-md object-cover opacity-50 grayscale hover:opacity-100 hover:grayscale-0 ring-1 ring-purple-500/20 transition-all"
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
    </div>
  {:else}
    <div class="grid flex-1 place-items-center px-6 text-center text-sm text-slate-400">
      <div class="flex flex-col items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
        <p>Enter champion select in League of Legends to view the live draft here.</p>
      </div>
    </div>
  {/if}
</section>

