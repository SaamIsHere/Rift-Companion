<script lang="ts">
  import { onMount } from "svelte";
  import { ddragonVersion, championCatalog } from "../stores/champions";
  import { profile } from "../stores/profile";
  import { squareIconUrl } from "../utils/ddragon";
  import { openInBrowser, getLatestPatchInfo, type PatchInfo } from "../ipc/tauri";

  let searchQuery = "";

  // Convert Data Dragon internal version (16.17.1) to public patch notes format (26.17)
  function computePatch(ver: string): PatchInfo {
    const parts = (ver || "16.17.1").split(".");
    let major = parseInt(parts[0], 10) || 16;
    const minor = parts[1] || "17";
    // Season 2026 starts with internal major 16, which maps to year 26
    if (major >= 16 && major <= 25) {
      major += 10;
    }
    const slug = `${major}-${minor}`;
    return {
      display: `${major}.${minor}`,
      slug,
      url: `https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-${slug}-notes/`,
    };
  }

  $: defaultPatch = computePatch($ddragonVersion);
  let livePatch: PatchInfo | null = null;
  $: currentPatch = livePatch ?? defaultPatch;

  onMount(async () => {
    try {
      livePatch = await getLatestPatchInfo($ddragonVersion);
    } catch (e) {
      console.warn("Failed to load live patch info", e);
    }
  });

  // Quick suggestions
  function setQuery(text: string) {
    searchQuery = text;
  }

  function handleSearchSubmit() {
    // UI-focused behavior as requested
    console.log("Search query submitted:", searchQuery);
  }

  function openPatchNotes() {
    openInBrowser(currentPatch.url);
  }

  // Find Ahri and Jinx icons from catalog if available
  $: ahriInfo = Array.from($championCatalog.values()).find(
    (c) => c.name.toLowerCase() === "ahri" || c.key.toLowerCase() === "ahri"
  );
  $: jinxInfo = Array.from($championCatalog.values()).find(
    (c) => c.name.toLowerCase() === "jinx" || c.key.toLowerCase() === "jinx"
  );
</script>

<div class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 select-none">
  <!-- Atmospheric background map with glowing runes (clean artwork from mockup) -->
  <div
    class="pointer-events-none absolute inset-0 bg-center bg-no-repeat bg-cover opacity-90 transition-opacity duration-700"
    style="background-image: url('/landing-bg.jpg');"
  >
    <!-- Vignette gradients blending into deep dark void edges -->
    <div class="absolute inset-0 bg-radial-gradient from-transparent via-[#07040d]/40 to-[#07040d]"></div>
    <div class="absolute inset-0 bg-gradient-to-t from-[#07040d] via-transparent to-[#07040d]/80"></div>
  </div>

  <!-- Central Hero Content -->
  <div class="relative z-10 flex w-full max-w-2xl flex-col items-center text-center -mt-6">
    <!-- Main Title -->
    <h1 class="text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase tracking-[0.22em] text-white drop-shadow-[0_4px_30px_rgba(168,85,247,0.45)]">
      Rift Companion
    </h1>

    <!-- Search Bar -->
    <div class="mt-8 w-full max-w-xl">
      <form
        on:submit|preventDefault={handleSearchSubmit}
        class="relative flex items-center rounded-2xl border border-purple-500/35 bg-[#0d071e]/85 shadow-[0_0_28px_rgba(168,85,247,0.22)] backdrop-blur-xl transition-all duration-300 focus-within:border-purple-400 focus-within:shadow-[0_0_36px_rgba(168,85,247,0.45)] hover:border-purple-400/60"
      >
        <span class="pointer-events-none absolute left-4 text-purple-300/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search specific player (e.g. Faker#T1), champion, or match ID..."
          class="w-full rounded-2xl bg-transparent py-3.5 pl-12 pr-4 text-sm text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
        />
        {#if searchQuery}
          <button
            type="button"
            aria-label="Clear search query"
            on:click={() => (searchQuery = "")}
            class="mr-3 text-slate-400 hover:text-white transition"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </form>

      <!-- Quick suggestions row -->
      <div class="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span class="text-purple-300/60 font-medium">Quick suggest:</span>

        <!-- Ahri chip -->
        <button
          type="button"
          on:click={() => setQuery("Ahri")}
          class="group flex items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white"
        >
          {#if ahriInfo}
            <img
              src={squareIconUrl(ahriInfo.key, $ddragonVersion)}
              alt="Ahri"
              class="h-4 w-4 rounded-full object-cover ring-1 ring-purple-400/50"
            />
          {:else}
            <span class="h-3.5 w-3.5 rounded-full bg-purple-600/60"></span>
          {/if}
          <span>Ahri</span>
        </button>

        <!-- Jinx chip -->
        <button
          type="button"
          on:click={() => setQuery("Jinx")}
          class="group flex items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white"
        >
          {#if jinxInfo}
            <img
              src={squareIconUrl(jinxInfo.key, $ddragonVersion)}
              alt="Jinx"
              class="h-4 w-4 rounded-full object-cover ring-1 ring-purple-400/50"
            />
          {:else}
            <span class="h-3.5 w-3.5 rounded-full bg-purple-600/60"></span>
          {/if}
          <span>Jinx</span>
        </button>

        <!-- Summoner chip -->
        <button
          type="button"
          on:click={() => setQuery($profile?.display_name || "SummonerXYZ#EUW")}
          class="group flex items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-950/40 px-2.5 py-1 text-purple-200 backdrop-blur-md transition hover:border-purple-400/60 hover:bg-purple-900/60 hover:text-white"
        >
          <svg class="h-3.5 w-3.5 text-purple-300/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>{$profile?.display_name || "SummonerXYZ#EUW"}</span>
        </button>
      </div>
    </div>

    <!-- Latest Patch button (slimmed down per user request) -->
    <div class="mt-9">
      <button
        type="button"
        on:click={openPatchNotes}
        class="group flex items-center gap-3 rounded-xl border border-purple-400/30 bg-gradient-to-r from-purple-700/85 via-violet-600/85 to-indigo-700/85 px-4 py-2 text-left shadow-[0_0_22px_rgba(147,51,234,0.32)] backdrop-blur-lg transition-all duration-200 hover:scale-[1.02] hover:border-purple-300 hover:from-purple-600 hover:to-indigo-600 hover:shadow-[0_0_28px_rgba(168,85,247,0.5)] active:scale-[0.98]"
        title="Open patch notes in default browser"
      >
        <!-- Patch/Book icon box -->
        <div class="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white shadow-inner">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
          </svg>
        </div>

        <!-- Text details -->
        <div class="flex flex-col">
          <span class="text-[11px] font-semibold tracking-wide text-purple-200">Latest Patch</span>
          <span class="text-sm font-bold text-white leading-none">v{currentPatch.display} <span class="text-xs font-normal text-purple-200/80">(Browser)</span></span>
        </div>

        <!-- External link icon -->
        <div class="ml-1 text-purple-200/80 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </div>
      </button>
    </div>
  </div>
</div>
