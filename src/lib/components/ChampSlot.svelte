<script lang="ts">
  import type { DraftPick, PairwiseStat, Role } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { setEnemyRole, getPairwiseStat } from "../ipc/tauri";
  import { draft } from "../stores/draft";
  import { referenceChampionId } from "../stores/preselect";

  export let pick: DraftPick;
  export let accent: "cyan" | "rose";
  /** Enemy cards allow correcting the guessed role; ally cards do not. */
  export let editable = false;

  const ROLES: Role[] = ["top", "jungle", "mid", "adc", "support"];

  let imgError = false;
  $: info = $championCatalog.get(pick.champion_id);
  $: name = info?.name ?? `Champion ${pick.champion_id}`;

  function onRoleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    void setEnemyRole(pick.champion_id, value === "" ? null : (value as Role));
  }

  // Draft-board hover preview (Issue #7): while a champion is preselected
  // from the recommendation list, or already locked in via the LCU, hover a
  // teammate/opponent slot to see that specific pairing's historical win
  // rate. A locked-in pick always wins over a stale preselection.
  $: localRole = $draft?.local_role ?? null;
  $: isAllySlot = accent === "cyan";
  $: canPreview =
    !pick.is_local &&
    $referenceChampionId !== null &&
    localRole !== null &&
    $referenceChampionId !== pick.champion_id;

  let hovering = false;
  let stat: PairwiseStat | null = null;
  let loading = false;
  let requestToken = 0;

  async function loadStat() {
    if (!canPreview || $referenceChampionId === null || localRole === null) return;
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
  class="glass-soft relative flex items-center gap-3 rounded-xl p-2 {pick.is_local
    ? 'ring-1 ring-hextech-cyan/60'
    : ''}"
  on:mouseenter={() => (hovering = true)}
  on:mouseleave={() => (hovering = false)}
>
  {#if hovering && canPreview}
    <div
      class="glass absolute -top-2 left-1/2 z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-lg px-3 py-2 text-xs shadow-xl"
    >
      <p class="mb-0.5 text-slate-400">
        {referenceName ?? "Your champion"} {isAllySlot ? "with" : "vs"} {name}
      </p>
      {#if loading}
        <p class="text-slate-500">Loading…</p>
      {:else if stat}
        <p
          class="font-semibold {stat.delta > 0.005
            ? 'text-emerald-300'
            : stat.delta < -0.005
              ? 'text-rose-300'
              : 'text-slate-300'}"
        >
          {Math.round(stat.winrate * 100)}% win rate ({stat.games} games)
        </p>
      {:else}
        <p class="text-slate-500">Not enough data yet</p>
      {/if}
    </div>
  {/if}
  {#if info && !imgError}
    <img
      src={squareIconUrl(info.key, $ddragonVersion)}
      alt={name}
      class="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10"
      on:error={() => (imgError = true)}
    />
  {:else}
    <div
      class="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-[10px] {accent ===
      'cyan'
        ? 'text-hextech-cyan'
        : 'text-rose-300'}"
    >
      {pick.champion_id}
    </div>
  {/if}

  <div class="flex flex-col">
    <span class="text-sm">{name}</span>
    {#if editable}
      <select
        class="mt-0.5 w-fit rounded bg-white/5 px-1 py-0.5 text-[11px] uppercase text-slate-300 ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-hextech-cyan/60"
        value={pick.role ?? ""}
        on:change={onRoleChange}
      >
        <option value="">Guess</option>
        {#each ROLES as r}
          <option value={r}>{r}</option>
        {/each}
      </select>
    {:else if pick.role}
      <span class="text-[11px] uppercase text-slate-400">{pick.role}</span>
    {/if}
  </div>
  {#if pick.is_local}
    <span class="ml-auto text-[10px] uppercase text-hextech-cyan">You</span>
  {/if}
</div>
