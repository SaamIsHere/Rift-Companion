<script lang="ts">
  import {
    showUpdateModal,
    updateVersion,
    updateNotes,
    isUpdating,
    updateProgress,
    updateStatusMessage,
    updateError,
    installAppUpdate,
  } from "../stores/updater";

  function close() {
    if (!$isUpdating) {
      showUpdateModal.set(false);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !$isUpdating) {
      close();
    }
  }
</script>

<svelte:window on:keydown={$showUpdateModal ? onKeydown : undefined} />

{#if $showUpdateModal}
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4 animate-fade-in select-none"
    on:click={close}
    on:keydown={onKeydown}
    role="presentation"
  >
    <div
      class="glass relative w-[480px] max-w-[94vw] flex flex-col rounded-2xl p-6 shadow-2xl overflow-hidden border border-purple-500/30 bg-void-950/90"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-label="Application Update Available"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between border-b border-purple-500/20 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="grid h-8 w-8 place-items-center rounded-lg border border-purple-400/40 bg-purple-900/40 text-purple-300">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wider text-white">Update Available</h2>
            <p class="text-[11px] text-purple-300">A new version of Rift Companion is ready!</p>
          </div>
        </div>

        {#if !$isUpdating}
          <button
            class="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
            on:click={close}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        {/if}
      </div>

      <!-- Version Badge Box -->
      <div class="mb-4 flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-950/30 p-3">
        <div class="flex items-center gap-2">
          <span class="rounded bg-purple-900/60 px-2 py-0.5 text-xs font-semibold text-purple-300 border border-purple-500/30">
            Current: v0.1.2
          </span>
          <svg class="h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
          <span class="rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
            New: v{$updateVersion}
          </span>
        </div>
        <span class="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
          Ready to install
        </span>
      </div>

      <!-- Release Notes Box -->
      <div class="mb-5 flex flex-col gap-1.5">
        <span class="text-[11px] font-bold uppercase tracking-wide text-slate-300">Release Notes &amp; Highlights:</span>
        <div class="glass-soft max-h-40 overflow-y-auto rounded-xl p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-sans border border-purple-500/15">
          {$updateNotes}
        </div>
      </div>

      <!-- Progress / Status Area -->
      {#if $isUpdating}
        <div class="mb-5 flex flex-col gap-2 rounded-xl border border-purple-500/20 bg-purple-950/40 p-3">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-purple-200">{$updateStatusMessage || "Updating…"}</span>
            <span class="font-mono text-purple-300 font-bold">{$updateProgress}%</span>
          </div>
          <!-- Progress bar -->
          <div class="h-2 w-full overflow-hidden rounded-full bg-black/50 border border-purple-500/30">
            <div
              class="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-200"
              style="width: {$updateProgress}%;"
            ></div>
          </div>
          <span class="text-[10px] text-slate-400">
            Please don't close the application. It will restart automatically once finished.
          </span>
        </div>
      {/if}

      <!-- Error feedback -->
      {#if $updateError}
        <div class="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/20 p-2.5 text-xs text-rose-300">
          {$updateError}
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="flex items-center justify-end gap-2.5">
        {#if !$isUpdating}
          <button
            type="button"
            on:click={close}
            class="rounded-lg border border-slate-700 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            Later
          </button>
          <button
            type="button"
            on:click={installAppUpdate}
            class="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-purple-900/40 transition hover:from-purple-500 hover:to-indigo-500 active:scale-95"
          >
            <svg class="h-3.5 w-3.5 transition group-hover:translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Update &amp; Restart Now</span>
          </button>
        {:else}
          <button
            type="button"
            disabled
            class="flex items-center gap-2 rounded-lg bg-purple-700/50 px-4 py-2 text-xs font-bold text-white/70 cursor-not-allowed"
          >
            <svg class="h-3.5 w-3.5 animate-spin text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Installing Update…</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
