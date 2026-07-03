<script lang="ts">
  import { settings, settingsOpen } from "../stores/settings";
  import { rankRefreshing, rankRefreshProgress } from "../stores/rank";
  import { forceRefreshData, setSettings } from "../ipc/tauri";

  function close() {
    settingsOpen.set(false);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function push() {
    void setSettings($settings);
  }

  function onCompactDensityChange(e: Event) {
    settings.update((s) => ({ ...s, compact_density: (e.target as HTMLInputElement).checked }));
    push();
  }

  function onAlwaysOnTopChange(e: Event) {
    settings.update((s) => ({ ...s, always_on_top: (e.target as HTMLInputElement).checked }));
    push();
  }

  function onCompWeightInput(e: Event) {
    // Live-update the label while dragging, without hammering the backend.
    settings.update((s) => ({ ...s, comp_weight: Number((e.target as HTMLInputElement).value) }));
  }

  function onCompWeightChange() {
    push(); // fires on release
  }
</script>

<svelte:window on:keydown={$settingsOpen ? onKeydown : undefined} />

{#if $settingsOpen}
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
    on:click={close}
    on:keydown={onKeydown}
    role="presentation"
  >
    <div
      class="glass w-[380px] max-w-[90vw] animate-fade-in rounded-2xl p-5"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      tabindex="-1"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-sm uppercase tracking-widest text-slate-400">Settings</h2>
        <button
          class="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
          aria-label="Close settings"
          on:click={close}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div class="flex flex-col gap-5 text-sm">
        <section>
          <h3 class="mb-2 text-xs uppercase tracking-wide text-slate-500">Appearance</h3>
          <label class="flex items-center justify-between gap-3 py-1">
            <span class="text-slate-300">Compact card density</span>
            <input
              type="checkbox"
              checked={$settings.compact_density}
              on:change={onCompactDensityChange}
              class="h-4 w-4 accent-hextech-cyan"
            />
          </label>
        </section>

        <section>
          <h3 class="mb-2 text-xs uppercase tracking-wide text-slate-500">Behavior</h3>
          <div class="flex flex-col gap-3">
            <div>
              <div class="mb-1 flex items-center justify-between">
                <span class="text-slate-300">Team-comp weight</span>
                <span class="tabular-nums text-slate-400">{$settings.comp_weight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.3"
                step="0.01"
                value={$settings.comp_weight}
                on:input={onCompWeightInput}
                on:change={onCompWeightChange}
                class="w-full accent-hextech-cyan"
              />
            </div>
            <label class="flex items-center justify-between gap-3 py-1">
              <span class="text-slate-300">Always on top</span>
              <input
                type="checkbox"
                checked={$settings.always_on_top}
                on:change={onAlwaysOnTopChange}
                class="h-4 w-4 accent-hextech-cyan"
              />
            </label>
          </div>
        </section>

        <section>
          <h3 class="mb-2 text-xs uppercase tracking-wide text-slate-500">Data</h3>
          <div class="flex items-center gap-3">
            <button
              class="glass-soft rounded-lg px-3 py-1.5 text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={$rankRefreshing}
              on:click={() => forceRefreshData()}
            >
              {$rankRefreshing ? "Refreshing…" : "Refresh data now"}
            </button>
            {#if $rankRefreshing && $rankRefreshProgress}
              <span class="text-[11px] tabular-nums text-hextech-cyan">
                {$rankRefreshProgress.done}/{$rankRefreshProgress.total}
              </span>
            {/if}
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}
