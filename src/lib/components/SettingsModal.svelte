<script lang="ts">
  import { settings, settingsOpen, DEFAULT_SERVER_URL, DEFAULT_API_KEY } from "../stores/settings";
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
  import {
    checkForAppUpdate,
    isChecking as isCheckingUpdate,
    updateStatusMessage,
    updateError as updateCheckError,
    updateAvailable,
    showUpdateModal,
    updateVersion,
  } from "../stores/updater";

  let testing = false;
  let testResult: { success: boolean; message: string } | null = null;
  let fileInput: HTMLInputElement;
  let isUploading = false;
  let uploadError: string | null = null;
  let selfHostingOpen = false;
  let showApiKey = false;

  $: isCustomServer =
    Boolean($settings.server_url) &&
    $settings.server_url.trim() !== DEFAULT_SERVER_URL &&
    $settings.server_url.trim() !== "";

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

  function onApiKeyInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    settings.update((s) => ({ ...s, api_key: val }));
    testResult = null;
  }

  function onApiKeyChange() {
    push();
  }

  function resetToDefaultServer() {
    settings.update((s) => ({
      ...s,
      server_url: DEFAULT_SERVER_URL,
      api_key: DEFAULT_API_KEY,
    }));
    testResult = null;
    push();
  }

  async function handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      uploadError = "The image is too large (maximum 25 MB).";
      return;
    }

    isUploading = true;
    uploadError = null;
    try {
      await uploadCustomWallpaper(file);
    } catch (err: any) {
      uploadError = `Failed to save image: ${err?.message || err}`;
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
    const targetUrl = $settings.server_url?.trim() || DEFAULT_SERVER_URL;
    const targetKey = $settings.api_key?.trim() || DEFAULT_API_KEY;

    testing = true;
    testResult = null;
    try {
      const status = await testServerConnection(targetUrl, targetKey);
      const tierCount = status.tiers ? Object.keys(status.tiers).length : 0;
      testResult = {
        success: true,
        message: `Connected successfully! Patch: ${status.patch ?? "Unknown"} • ${tierCount} tiers crawled`,
      };
      push();
    } catch (err: any) {
      testResult = {
        success: false,
        message: `Connection failed: ${err?.message || err}`,
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
          <h2 class="text-sm font-bold uppercase tracking-widest text-slate-200">Settings &amp; Preferences</h2>
        </div>
        <button
          class="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus:outline-none"
          aria-label="Close settings"
          on:click={close}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <!-- Scrollable Settings Body -->
      <div class="flex flex-col gap-6 text-sm overflow-y-auto pr-1">

        <!-- SECTION 1: THEMES & COLOR PALETTE -->
        <section>
          <div class="mb-3 flex items-center justify-between">
            <div class="flex flex-col">
              <h3 class="text-xs font-bold uppercase tracking-wide text-purple-300">Runeterra Theme</h3>
              <span class="text-[11px] text-slate-400">Choose your preferred region & color palette</span>
            </div>
            <!-- Shuffle Button -->
            <button
              type="button"
              on:click={shuffleTheme}
              class="group flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-950/40 px-2.5 py-1 text-xs font-semibold text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white active:scale-95"
              title="Pick a random theme"
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

        <!-- SECTION 2: BACKGROUND & WALLPAPER -->
        <section class="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3.5">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-xs font-bold uppercase tracking-wide text-purple-300">Background & Wallpaper</h3>
            {#if $customWallpaper}
              <span class="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                Custom Image Active
              </span>
            {:else}
              <span class="rounded bg-purple-900/50 px-2 py-0.5 text-[10px] font-semibold text-purple-300/80">
                Theme Artwork Active
              </span>
            {/if}
          </div>

          <!-- Scope: Landing only vs. All tabs -->
          <div class="mb-3.5">
            <div class="text-[11px] font-semibold text-slate-300 mb-1.5">Display Scope:</div>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                on:click={() => setWallpaperScope("landing_only")}
                class="rounded-lg border px-3 py-1.5 text-xs font-medium transition text-left { $wallpaperScope === 'landing_only'
                  ? 'border-purple-400 bg-purple-600/30 text-white shadow-sm'
                  : 'border-purple-500/20 bg-purple-950/30 text-slate-300 hover:bg-purple-900/30 hover:text-white' }"
              >
                <div class="font-bold">Landing Page Only</div>
                <div class="text-[10px] opacity-70">Classic Summoner's Rift look</div>
              </button>

              <button
                type="button"
                on:click={() => setWallpaperScope("all_tabs")}
                class="rounded-lg border px-3 py-1.5 text-xs font-medium transition text-left { $wallpaperScope === 'all_tabs'
                  ? 'border-purple-400 bg-purple-600/30 text-white shadow-sm'
                  : 'border-purple-500/20 bg-purple-950/30 text-slate-300 hover:bg-purple-900/30 hover:text-white' }"
              >
                <div class="font-bold">Entire Application</div>
                <div class="text-[10px] opacity-70">Subtle backdrop across all panels & tabs</div>
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
                  {isUploading ? "Uploading…" : $customWallpaper ? "Choose different image…" : "Upload custom wallpaper…"}
                </button>

                {#if $customWallpaper}
                  <button
                    type="button"
                    on:click={handleClearWallpaper}
                    class="rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/50 hover:text-white"
                    title="Remove custom image and restore theme artwork"
                  >
                    Reset
                  </button>
                {/if}
              </div>
              <span class="text-[10px] text-slate-400">
                Supports JPG, PNG, WebP up to 25 MB. Stored locally.
              </span>
            </div>
          </div>

          {#if uploadError}
            <div class="mt-2.5 rounded-md border border-rose-500/30 bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300">
              {uploadError}
            </div>
          {/if}
        </section>

        <!-- SECTION 3: BEHAVIOR -->
        <section>
          <h3 class="mb-2 text-xs uppercase tracking-wide text-purple-300/70">Behavior</h3>
          <div class="flex flex-col gap-1">
            <label class="flex items-center justify-between gap-3 py-1 cursor-pointer">
              <span class="text-slate-300">Always on Top</span>
              <input
                type="checkbox"
                checked={$settings.always_on_top}
                on:change={onAlwaysOnTopChange}
                class="h-4 w-4 accent-purple-500 cursor-pointer"
              />
            </label>
          </div>
        </section>

        <!-- SECTION 4: DATA SOURCE & SERVER CONFIGURATION -->
        <section class="rounded-xl border border-purple-500/15 bg-purple-950/20 p-3.5">
          <div class="mb-2.5 flex items-center justify-between">
            <div class="flex flex-col">
              <h3 class="text-xs font-bold uppercase tracking-wide text-purple-300">Data Source</h3>
              <span class="text-[11px] text-slate-400">Live champion stats, tier lists & builds</span>
            </div>
            {#if isCustomServer}
              <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                Custom Server
              </span>
            {:else}
              <span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Official Rift Cloud
              </span>
            {/if}
          </div>

          <!-- Main Status & Action Card -->
          <div class="flex items-center justify-between rounded-lg border border-purple-500/20 bg-void-950/50 p-2.5">
            <div class="flex items-center gap-2.5 min-w-0 pr-2">
              <div class="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-purple-500/30 bg-purple-900/30 text-purple-300">
                {#if isCustomServer}
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                {:else}
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                  </svg>
                {/if}
              </div>
              <div class="flex flex-col min-w-0">
                <span class="text-xs font-semibold text-slate-200 truncate">
                  {isCustomServer ? "Self-Hosted Remote Endpoint" : "Official Rift Companion Network"}
                </span>
                <span class="text-[10px] text-slate-400 truncate" title={$settings.server_url}>
                  {isCustomServer ? $settings.server_url : "Cloudflare Edge Tunnel • Pre-configured"}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                on:click={handleTestConnection}
                disabled={testing}
                class="glass-soft rounded-lg px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:text-white disabled:opacity-50"
                title="Verify connection and patch data"
              >
                {testing ? "Testing…" : "Test"}
              </button>

              <button
                type="button"
                on:click={() => (selfHostingOpen = !selfHostingOpen)}
                class="group flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-950/40 px-2.5 py-1 text-xs font-medium text-purple-200 transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white"
                title="Configure custom server endpoint"
              >
                <span>Self-Hosting</span>
                <svg class="h-3 w-3 transition-transform duration-150 {selfHostingOpen ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- Connection Test Feedback -->
          {#if testResult}
            <div
              class="mt-2 rounded-md px-2.5 py-1.5 text-[11px] {testResult.success
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}"
            >
              {testResult.message}
            </div>
          {/if}

          <!-- Collapsible Self-Hosting / Custom Server Panel -->
          {#if selfHostingOpen}
            <div class="mt-3 flex flex-col gap-2.5 rounded-lg border border-purple-500/25 bg-void-950/80 p-3 animate-fade-in">
              <div class="flex items-center justify-between border-b border-purple-500/15 pb-1.5">
                <span class="text-[11px] font-bold uppercase tracking-wider text-purple-300">Custom Server Endpoint</span>
                {#if isCustomServer}
                  <button
                    type="button"
                    on:click={resetToDefaultServer}
                    class="text-[10px] text-purple-400 underline hover:text-purple-200"
                  >
                    Reset to Official Cloud
                  </button>
                {/if}
              </div>

              <p class="text-[10px] text-slate-400 leading-tight">
                To connect to your own Docker or NAS container, enter your custom URL and pre-shared API key below.
              </p>

              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-semibold text-slate-300" for="custom-server-url">Server URL</label>
                <input
                  id="custom-server-url"
                  type="text"
                  placeholder="https://... or http://192.168.x.x:8085"
                  value={$settings.server_url || ""}
                  on:input={onServerUrlInput}
                  on:change={onServerUrlChange}
                  class="glass-soft rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono text-[11px]"
                />
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-[10px] font-semibold text-slate-300" for="custom-api-key">API Key (optional)</label>
                <div class="relative flex items-center">
                  <input
                    id="custom-api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder="your-friends-secret-api-key-here"
                    value={$settings.api_key || ""}
                    on:input={onApiKeyInput}
                    on:change={onApiKeyChange}
                    class="glass-soft w-full rounded-lg px-2.5 py-1 pr-12 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    on:click={() => (showApiKey = !showApiKey)}
                    class="absolute right-2 text-slate-400 hover:text-slate-200 focus:outline-none text-[10px] font-medium"
                    tabindex="-1"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div class="mt-1 flex items-center justify-between pt-1">
                <span class="text-[10px] text-slate-500">Changes save automatically.</span>
                <div class="flex items-center gap-2">
                  {#if isCustomServer}
                    <button
                      type="button"
                      on:click={resetToDefaultServer}
                      class="rounded-md border border-slate-700 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-white/10"
                    >
                      Use Official Cloud
                    </button>
                  {/if}
                  <button
                    type="button"
                    on:click={() => (selfHostingOpen = false)}
                    class="rounded-md bg-purple-600/60 px-3 py-1 text-[10px] font-semibold text-white transition hover:bg-purple-600"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </section>

        <!-- SECTION 5: ABOUT & LEGAL -->
        <section class="border-t border-white/5 pt-3 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs uppercase tracking-wide text-purple-300/70">About &amp; Legal</h3>
            <span class="text-[10px] text-slate-400">v0.1.0 • MIT License</span>
          </div>

          <!-- App Updates Card -->
          <div class="flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-950/30 p-2.5">
            <div class="flex items-center gap-2.5">
              <div class="grid h-7 w-7 place-items-center rounded-lg border border-purple-400/30 bg-purple-900/30 text-purple-300">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div class="flex flex-col">
                <span class="text-xs font-semibold text-slate-200">
                  {$updateAvailable ? `Update v${$updateVersion} Available!` : "Rift Companion v0.1.0"}
                </span>
                <span class="text-[10px] text-slate-400">
                  {$updateStatusMessage || ($updateAvailable ? "New version ready to install" : "Automatic update checking enabled")}
                </span>
              </div>
            </div>

            <div>
              {#if $updateAvailable}
                <button
                  type="button"
                  on:click={() => showUpdateModal.set(true)}
                  class="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-white animate-ping"></span>
                  <span>Install Update</span>
                </button>
              {:else}
                <button
                  type="button"
                  disabled={$isCheckingUpdate}
                  on:click={() => checkForAppUpdate(true)}
                  class="glass-soft rounded-lg px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-purple-900/40 hover:text-white disabled:opacity-50"
                >
                  {$isCheckingUpdate ? "Checking…" : "Check for Updates"}
                </button>
              {/if}
            </div>
          </div>

          {#if $updateCheckError}
            <div class="rounded-md border border-rose-500/30 bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-300">
              {$updateCheckError}
            </div>
          {/if}

          <div class="glass-soft rounded-lg p-2.5 text-[10px] leading-relaxed text-slate-400">
            <p class="mb-1 font-medium text-slate-300">Riot Games Disclaimer</p>
            <p>
              Rift Companion isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.
            </p>
          </div>
        </section>

      </div>
    </div>
  </div>
{/if}
