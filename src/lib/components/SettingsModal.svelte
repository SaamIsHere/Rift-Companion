<script lang="ts">
  import { settings, settingsOpen } from "../stores/settings";
  import { setSettings, testServerConnection } from "../ipc/tauri";
  import {
    activeThemeId,
    activeTheme,
    customWallpaper,
    wallpaperScope,
    selectTheme,
    shuffleTheme,
    setWallpaperScope,
    uploadCustomWallpaper,
    clearCustomWallpaper,
  } from "../stores/theme";
  import { THEMES } from "../themes";
  import type { ThemeId, WallpaperScope } from "../types";

  let testing = false;
  let testResult: { success: boolean; message: string } | null = null;
  let fileInput: HTMLInputElement;
  let isUploading = false;
  let uploadError: string | null = null;

  function close() {
    settingsOpen.set(false);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function push() {
    void setSettings($settings);
  }

  function onAlwaysOnTopChange(e: Event) {
    settings.update((s) => ({ ...s, always_on_top: (e.target as HTMLInputElement).checked }));
    push();
  }

  function onServerUrlInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    settings.update((s) => ({ ...s, server_url: val }));
    testResult = null;
  }

  function onServerUrlChange() {
    push();
  }

  async function handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      uploadError = "Das Bild ist zu groß (maximal 25 MB).";
      return;
    }

    isUploading = true;
    uploadError = null;
    try {
      await uploadCustomWallpaper(file);
    } catch (err: any) {
      uploadError = `Fehler beim Speichern: ${err?.message || err}`;
    } finally {
      isUploading = false;
      input.value = "";
    }
  }

  async function handleClearWallpaper() {
    uploadError = null;
    await clearCustomWallpaper();
  }

  function triggerFilePicker() {
    uploadError = null;
    fileInput?.click();
  }

  async function handleTestConnection() {
    if (!$settings.server_url?.trim()) {
      testResult = { success: false, message: "Bitte eine Server-URL eingeben (z. B. http://192.168.1.100:8080)" };
      return;
    }
    testing = true;
    testResult = null;
    try {
      const status = await testServerConnection($settings.server_url.trim());
      const tierCount = status.tiers ? Object.keys(status.tiers).length : 0;
      testResult = {
        success: true,
        message: `Erfolgreich verbunden! Patch: ${status.patch ?? "Unbekannt"} • ${tierCount} Tiers gecrawlt`,
      };
      push();
    } catch (err: any) {
      testResult = {
        success: false,
        message: `Verbindung fehlgeschlagen: ${err?.message || err}`,
      };
    } finally {
      testing = false;
    }
  }
</script>

<svelte:window on:keydown={$settingsOpen ? onKeydown : undefined} />

{#if $settingsOpen}
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
    on:click={close}
    on:keydown={onKeydown}
    role="presentation"
  >
    <div
      class="glass w-[540px] max-w-[94vw] max-h-[90vh] flex flex-col animate-fade-in rounded-2xl p-6 shadow-2xl overflow-hidden"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="mb-5 flex items-center justify-between border-b border-purple-500/15 pb-3 shrink-0">
        <div class="flex items-center gap-2">
          <div class="h-2 w-2 rounded-full bg-purple-400"></div>
          <h2 class="text-sm font-bold uppercase tracking-widest text-slate-200">Einstellungen &amp; Anpassung</h2>
        </div>
        <button
          class="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus:outline-none"
          aria-label="Einstellungen schließen"
          on:click={close}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <!-- Scrollable Settings Body -->
      <div class="flex flex-col gap-6 text-sm overflow-y-auto pr-1">

        <!-- SECTION 1: THEMES & FARBMUSTER -->
        <section>
          <div class="mb-3 flex items-center justify-between">
            <div class="flex flex-col">
              <h3 class="text-xs font-bold uppercase tracking-wide text-purple-300">Runeterra Theme</h3>
              <span class="text-[11px] text-slate-400">Wähle deine bevorzugte Region & Farbwelt</span>
            </div>
            <!-- Shuffle Button -->
            <button
              type="button"
              on:click={shuffleTheme}
              class="group flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-950/40 px-2.5 py-1 text-xs font-semibold text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white active:scale-95"
              title="Zufälliges Theme auswählen"
            >
              <svg class="h-3.5 w-3.5 transition group-hover:rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.29 7 12 12 20.71 7" />
                <line x1="12" y1="22" x2="12" y2="12" />
              </svg>
              <span>Shuffle 🎲</span>
            </button>
          </div>

          <!-- Theme Grid -->
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each THEMES as t (t.id)}
              {@const isSelected = $activeThemeId === t.id}
              <button
                type="button"
                on:click={() => selectTheme(t.id)}
                class="group relative flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all duration-150 {isSelected
                  ? 'border-purple-400 bg-purple-900/40 ring-1 ring-purple-400/80 shadow-sm'
                  : 'border-purple-500/20 bg-void-950/40 hover:border-purple-400/50 hover:bg-purple-950/40'}"
              >
                <!-- Top: Color Swatches (2 distinct theme colors) -->
                <div class="mb-2 flex items-center gap-1.5">
                  <div
                    class="h-3.5 w-3.5 rounded-full ring-1 ring-white/20 shadow-sm"
                    style="background-color: {t.swatch[0]};"
                  ></div>
                  <div
                    class="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                    style="background-color: {t.swatch[1]};"
                  ></div>
                </div>

                <!-- Bottom: Name -->
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold {isSelected ? 'text-white' : 'text-slate-200 group-hover:text-purple-200'}">
                    {t.name}
                  </span>
                  {#if isSelected}
                    <span class="h-1.5 w-1.5 rounded-full bg-purple-400"></span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </section>

        <!-- SECTION 2: HINTERGRUND & WALLPAPER -->
        <section class="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3.5">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wide text-purple-300">Hintergrund & Startseite</h3>
            {#if $customWallpaper}
              <span class="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                Eigenes Bild aktiv
              </span>
            {:else}
              <span class="rounded bg-purple-900/50 px-2 py-0.5 text-[10px] font-semibold text-purple-300/80">
                Theme-Artwork aktiv
              </span>
            {/if}
          </div>

          <!-- Scope: Nur Startseite vs. Alle Tabs (Dezent) -->
          <div class="mb-3.5">
            <div class="text-[11px] font-semibold text-slate-300 mb-1.5">Anzeige-Bereich:</div>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                on:click={() => setWallpaperScope("landing_only")}
                class="rounded-lg border px-3 py-1.5 text-xs font-medium transition text-left { $wallpaperScope === 'landing_only'
                  ? 'border-purple-400 bg-purple-600/30 text-white shadow-sm'
                  : 'border-purple-500/20 bg-purple-950/30 text-slate-300 hover:bg-purple-900/30 hover:text-white' }"
              >
                <div class="font-bold">Nur Startseite</div>
                <div class="text-[10px] opacity-70">Klassischer Summoner-Rift Look</div>
              </button>

              <button
                type="button"
                on:click={() => setWallpaperScope("all_tabs")}
                class="rounded-lg border px-3 py-1.5 text-xs font-medium transition text-left { $wallpaperScope === 'all_tabs'
                  ? 'border-purple-400 bg-purple-600/30 text-white shadow-sm'
                  : 'border-purple-500/20 bg-purple-950/30 text-slate-300 hover:bg-purple-900/30 hover:text-white' }"
              >
                <div class="font-bold">Ganze App</div>
                <div class="text-[10px] opacity-70">Dezent hinter allen Panels & Tabs</div>
              </button>
            </div>
          </div>

          <!-- Custom Wallpaper Upload Box -->
          <div class="flex items-center gap-3">
            <!-- Hidden native file input -->
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              bind:this={fileInput}
              on:change={handleFileSelected}
              class="hidden"
            />

            <!-- Thumbnail Preview -->
            <div class="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-purple-500/30 bg-black/40 shadow-inner">
              {#if $customWallpaper}
                <img
                  src={$customWallpaper}
                  alt="Custom Wallpaper"
                  class="h-full w-full object-cover"
                />
              {:else}
                <div class="relative h-full w-full overflow-hidden">
                  <div
                    class="h-full w-full bg-cover bg-center opacity-85"
                    style="background-image: url('/landing-bg.jpg'); filter: {$activeTheme.bgFilter};"
                  ></div>
                  <div
                    class="absolute inset-0 pointer-events-none"
                    style="background: {$activeTheme.tintGradient}; mix-blend-mode: {$activeTheme.tintBlendMode}; opacity: 0.9;"
                  ></div>
                </div>
              {/if}
            </div>

            <!-- Upload / Reset Action Buttons -->
            <div class="flex flex-1 flex-col gap-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  on:click={triggerFilePicker}
                  disabled={isUploading}
                  class="glass-soft rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-purple-900/50 hover:border-purple-400/50 disabled:opacity-50"
                >
                  {isUploading ? "Wird geladen…" : $customWallpaper ? "Anderes Bild wählen…" : "Eigenes Bild hochladen…"}
                </button>

                {#if $customWallpaper}
                  <button
                    type="button"
                    on:click={handleClearWallpaper}
                    class="rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/50 hover:text-white"
                    title="Eigenes Bild entfernen und zum Theme-Artwork zurückkehren"
                  >
                    Zurücksetzen
                  </button>
                {/if}
              </div>
              <span class="text-[10px] text-slate-400">
                Unterstützt JPG, PNG, WebP bis 25 MB. Wird dauerhaft gespeichert.
              </span>
            </div>
          </div>

          {#if uploadError}
            <div class="mt-2.5 rounded-md border border-rose-500/30 bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300">
              {uploadError}
            </div>
          {/if}
        </section>

        <!-- SECTION 3: VERHALTEN -->
        <section>
          <h3 class="mb-2 text-xs uppercase tracking-wide text-purple-300/70">Verhalten</h3>
          <div class="flex flex-col gap-1">
            <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
              <span class="text-slate-300">Immer im Vordergrund</span>
              <input
                type="checkbox"
                checked={$settings.always_on_top}
                on:change={onAlwaysOnTopChange}
                class="h-4 w-4 accent-purple-500 cursor-pointer"
              />
            </label>
          </div>
        </section>

        <!-- SECTION 4: NAS / RIFT DATENSERVER -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-xs uppercase tracking-wide text-purple-300/70">NAS / Datenserver</h3>
            <span class="text-[10px] text-purple-300">Keine lokalen Schreibzugriffe</span>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="http://192.168.1.100:8080"
                value={$settings.server_url || ""}
                on:input={onServerUrlInput}
                on:change={onServerUrlChange}
                class="glass-soft flex-1 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
              <button
                class="glass-soft shrink-0 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                disabled={testing}
                on:click={handleTestConnection}
              >
                {testing ? "Wird getestet…" : "Testen"}
              </button>
            </div>
            {#if testResult}
              <div
                class="rounded-md px-2.5 py-1 text-[11px] {testResult.success
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}"
              >
                {testResult.message}
              </div>
            {:else if $settings.server_url}
              <p class="text-[11px] text-slate-400">
                Datensatz wird direkt über das lokale Netzwerk in den RAM gestreamt.
              </p>
            {/if}
          </div>
        </section>

      </div>
    </div>
  </div>
{/if}
