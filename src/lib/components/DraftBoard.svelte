<script lang="ts">
  import type { DraftPick, Role } from "../types";
  import { draft } from "../stores/draft";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { setEnemyRole } from "../ipc/tauri";
  import { referenceChampionId } from "../stores/preselect";
  import ChampSlot from "./ChampSlot.svelte";

  const ROLE_DEFS: { role: Role; label: string }[] = [
    { role: "top", label: "Top" },
    { role: "jungle", label: "Jungle" },
    { role: "mid", label: "Mid" },
    { role: "adc", label: "ADC" },
    { role: "support", label: "Support" },
  ];

  let draggedEnemy: { championId: number; role: Role } | null = null;
  let dragOverRole: Role | null = null;

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

  function handleDragStart(champId: number, fromRole: Role, e: DragEvent) {
    draggedEnemy = { championId: champId, role: fromRole };
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(champId));
    }
  }

  function handleDragOver(role: Role, e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    dragOverRole = role;
  }

  function handleDragLeave(role: Role) {
    if (dragOverRole === role) {
      dragOverRole = null;
    }
  }

  async function handleEnemyDrop(targetRole: Role, targetPick: DraftPick | null, e: DragEvent) {
    e.preventDefault();
    const currentDrag = draggedEnemy;
    draggedEnemy = null;
    dragOverRole = null;

    if (!currentDrag || currentDrag.role === targetRole) {
      return;
    }

    const { championId: sourceChampId, role: sourceRole } = currentDrag;

    try {
      if (targetPick && targetPick.champion_id !== sourceChampId) {
        // Swap roles between the two enemy champions
        await setEnemyRole(sourceChampId, targetRole);
        await setEnemyRole(targetPick.champion_id, sourceRole);
      } else {
        // Reassign to empty slot
        await setEnemyRole(sourceChampId, targetRole);
      }
    } catch (err) {
      console.error("Failed to reassign enemy role", err);
    }
  }
</script>

<section class="glass flex min-h-0 flex-col rounded-2xl p-5 overflow-hidden">
  <!-- Header -->
  <div class="mb-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2.5">
      <div class="grid h-8 w-8 place-items-center rounded-xl bg-purple-600/20 text-purple-300 ring-1 ring-purple-500/30">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <div>
        <h2 class="text-sm font-bold text-white tracking-wide">Picked Champions</h2>
        <p class="text-[11px] text-slate-400">Drag enemy champions to reassign their roles.</p>
      </div>
    </div>

    {#if inChampSelect && referenceName}
      <span class="text-xs text-slate-400 bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 rounded-lg">
        Preview: <strong class="text-purple-300 font-semibold">{referenceName}</strong>
      </span>
    {/if}
  </div>

  {#if $draft && inChampSelect}
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1 pl-1.5 pr-4">
      <!-- Your Team -->
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
              playerLabel={slot.playerLabel}
            />
          {/each}
        </div>
      </div>

      <!-- Enemy Team -->
      <div class="flex flex-col gap-2 pt-1 border-t border-purple-500/15">
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
              isDragOver={dragOverRole === slot.role}
              on:dragstart={(e) => slot.pick && handleDragStart(slot.pick.champion_id, slot.role, e.detail)}
              on:dragover={(e) => handleDragOver(slot.role, e.detail)}
              on:dragleave={() => handleDragLeave(slot.role)}
              on:drop={(e) => handleEnemyDrop(slot.role, slot.pick, e.detail)}
            />
          {/each}
        </div>
      </div>

      <!-- Drag & Drop Explanation Note (matching mockup) -->
      <div class="flex items-start gap-2.5 rounded-xl border border-purple-500/20 bg-purple-950/25 p-3 text-xs">
        <div class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/30">
          <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div>
          <span class="font-bold text-slate-200 block mb-0.5">Drag &amp; Drop</span>
          <p class="text-slate-400 text-[11px] leading-relaxed">
            Drag enemy champions to reassign them to another role (e.g. if a flex pick is played on a different lane).
          </p>
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

