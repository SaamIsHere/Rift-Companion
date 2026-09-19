<script lang="ts">
  import { settings, activationOpen, DEFAULT_SERVER_URL } from "../stores/settings";
  import { testServerConnection, setSettings, forceRefreshData } from "../ipc/tauri";

  let enteredKey = "";
  let showKey = false;
  let testing = false;
  let errorMessage: string | null = null;
  let successMessage: string | null = null;
  let inputElement: HTMLInputElement;

  $: if ($activationOpen && inputElement) {
    setTimeout(() => inputElement?.focus(), 100);
  }

  function close() {
    if (!testing) {
      activationOpen.set(false);
      errorMessage = null;
      successMessage = null;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !testing) {
      close();
    }
  }

  async function handleActivate() {
    const key = enteredKey.trim();
    if (!key) {
      errorMessage = "Bitte gib deinen Zugriffsschlüssel ein.";
      return;
    }

    testing = true;
    errorMessage = null;
    successMessage = null;

    const targetUrl = $settings.server_url?.trim() || DEFAULT_SERVER_URL;

    try {
      const status = await testServerConnection(targetUrl, key);
      const tierCount = status.tiers ? Object.keys(status.tiers).length : 0;
      successMessage = `Erfolgreich freigeschaltet! Patch: ${status.patch ?? "Aktiv"} • ${tierCount} Ränge synchronisiert.`;

      // Save key in persistent user settings
      settings.update((s) => ({ ...s, api_key: key }));
      await setSettings({ ...$settings, api_key: key });
      forceRefreshData();

      // Close modal smoothly after brief celebration
      setTimeout(() => {
        activationOpen.set(false);
        testing = false;
        successMessage = null;
      }, 1200);
    } catch (err: any) {
      testing = false;
      const raw = String(err?.message || err);
      if (raw.includes("401") || raw.toLowerCase().includes("unauthorized")) {
        errorMessage = "Ungültiger Zugriffsschlüssel. Bitte überprüfe das Passwort und versuche es erneut.";
      } else {
        errorMessage = `Verbindungsfehler zum Server: ${raw}`;
      }
    }
  }
</script>

<svelte:window on:keydown={$activationOpen ? onKeydown : undefined} />

{#if $activationOpen}
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md p-4 animate-fade-in select-none"
    on:click={close}
    on:keydown={onKeydown}
    role="presentation"
  >
    <div
      class="glass relative w-[480px] max-w-[94vw] flex flex-col rounded-2xl p-6 shadow-2xl overflow-hidden border border-purple-500/30 bg-void-950/95"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-label="Rift Companion Aktivierung"
      tabindex="-1"
    >
      <!-- Background Glow Accent -->
      <div class="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-purple-600/20 blur-3xl"></div>
      <div class="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-indigo-600/20 blur-3xl"></div>

      <!-- Header -->
      <div class="relative mb-4 flex items-center justify-between border-b border-purple-500/20 pb-4">
        <div class="flex items-center gap-3">
          <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-purple-400/40 bg-purple-900/40 text-purple-300 shadow-inner">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h2 class="text-sm font-bold uppercase tracking-wider text-white">Rift Companion Aktivierung</h2>
            <p class="text-[11px] text-purple-300/80">Zugangsschlüssel für Live-Metadaten erforderlich</p>
          </div>
        </div>

        {#if !testing}
          <button
            class="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus:outline-none"
            aria-label="Schließen"
            on:click={close}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        {/if}
      </div>

      <!-- Body / Form -->
      <div class="relative flex flex-col gap-4 text-xs">
        <p class="text-slate-300 leading-relaxed">
          Willkommen! Um Live-Statistiken, Build-Pfade und Synergien vom privaten Rift-Server abzurufen, gib bitte deinen persönlichen Zugangsschlüssel ein. Der Schlüssel wird dauerhaft lokal auf deinem PC gespeichert.
        </p>

        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-semibold text-slate-200" for="activation-input">
            Zugriffsschlüssel (Access Key)
          </label>
          <div class="relative flex items-center">
            <input
              id="activation-input"
              bind:this={inputElement}
              type={showKey ? "text" : "password"}
              placeholder="Passwort eingeben…"
              bind:value={enteredKey}
              on:keydown={(e) => e.key === "Enter" && !testing && handleActivate()}
              disabled={testing || !!successMessage}
              class="glass-soft w-full rounded-xl border border-purple-500/30 bg-purple-950/30 px-3.5 py-2.5 pr-14 text-sm text-slate-100 placeholder-slate-500 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono transition"
            />
            <button
              type="button"
              on:click={() => (showKey = !showKey)}
              disabled={testing || !!successMessage}
              class="absolute right-3 text-slate-400 hover:text-slate-200 focus:outline-none text-xs font-medium transition"
              tabindex="-1"
            >
              {showKey ? "Verbergen" : "Anzeigen"}
            </button>
          </div>
        </div>

        <!-- Feedback Alert -->
        {#if errorMessage}
          <div class="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-[11px] text-rose-200 animate-fade-in">
            <svg class="h-4 w-4 shrink-0 text-rose-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span class="leading-relaxed">{errorMessage}</span>
          </div>
        {/if}

        {#if successMessage}
          <div class="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-[11px] text-emerald-200 animate-fade-in">
            <svg class="h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
            <span class="font-medium">{successMessage}</span>
          </div>
        {/if}

        <div class="rounded-lg border border-purple-500/15 bg-purple-950/20 px-3 py-2 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Server-Ziel:</span>
          <span class="font-mono text-purple-300 truncate max-w-[260px]" title={$settings.server_url || DEFAULT_SERVER_URL}>
            {$settings.server_url || DEFAULT_SERVER_URL}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex items-center justify-between border-t border-purple-500/20 pt-4">
        <button
          type="button"
          on:click={close}
          disabled={testing || !!successMessage}
          class="rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
        >
          Später / Offline nutzen
        </button>

        <button
          type="button"
          on:click={handleActivate}
          disabled={testing || !enteredKey.trim() || !!successMessage}
          class="flex items-center gap-2 rounded-xl border border-purple-400/50 bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if testing}
            <svg class="h-3.5 w-3.5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Wird überprüft…</span>
          {:else if successMessage}
            <span>Freigeschaltet ✓</span>
          {:else}
            <span>Freischalten &amp; Verbinden</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
