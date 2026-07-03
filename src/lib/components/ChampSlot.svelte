<script lang="ts">
  import type { DraftPick, Role } from "../types";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import { squareIconUrl } from "../utils/ddragon";
  import { setEnemyRole } from "../ipc/tauri";

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
</script>

<div
  class="glass-soft flex items-center gap-3 rounded-xl p-2 {pick.is_local
    ? 'ring-1 ring-hextech-cyan/60'
    : ''}"
>
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
