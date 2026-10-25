<script lang="ts">
  import { onMount } from "svelte";
  import {
    activeTftSubTab,
    tftSelectedDeck,
    tftLoading,
    tftSearchQuery,
    loadTftData,
    selectTftDeck,
    type TftSubTab,
  } from "../stores/tft";
  import TftMetaList from "./tft/TftMetaList.svelte";
  import TftCompDetail from "./tft/TftCompDetail.svelte";
  import TftItemSheet from "./tft/TftItemSheet.svelte";
  import TftEmblemGuide from "./tft/TftEmblemGuide.svelte";
  import TftAugmentsView from "./tft/TftAugmentsView.svelte";
  import TftSearchBar from "./tft/TftSearchBar.svelte";

  const subTabs: { id: TftSubTab; label: string }[] = [
    { id: "meta", label: "META COMPS" },
    { id: "items", label: "ITEM BUILDER" },
    { id: "emblems", label: "EMBLEM GUIDE" },
    { id: "augments", label: "AUGMENTS" },
  ];

  onMount(() => {
    selectTftDeck(null);
    void loadTftData();
  });

  function handleSubTabClick(id: TftSubTab) {
    activeTftSubTab.set(id);
    // When switching tabs, if on meta, clear detail view so list is visible
    if (id !== "meta") {
      selectTftDeck(null);
    }
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto select-none p-4 md:p-6">
  <!-- Subtle ambient glow in background -->
  <div class="pointer-events-none absolute inset-0 overflow-hidden">
    <div class="absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl"></div>
    <div class="absolute top-60 right-10 h-72 w-72 rounded-full bg-purple-600/10 blur-3xl"></div>
  </div>

  <div class="relative z-10 mx-auto w-full max-w-6xl flex flex-col gap-5">
    <!-- Top Control Bar: Sub-Tabs & Search Bar (High z-index to guarantee search dropdown renders over content) -->
    <div class="relative z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-500/15 pb-4">
      <!-- Sub-Tabs Switcher -->
      <div class="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-void-950/80 p-1 shadow-inner backdrop-blur-md">
        {#each subTabs as tab}
          {@const isActive = $activeTftSubTab === tab.id}
          <button
            type="button"
            on:click={() => handleSubTabClick(tab.id)}
            class="rounded-lg px-3.5 py-1.5 text-xs font-bold tracking-wider uppercase transition-all duration-150 {isActive
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}"
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <!-- Redesigned Token Autocomplete Search Bar (Refresh button removed) -->
      <TftSearchBar />
    </div>

    <!-- Main View Content Area (z-10 stacking context, never covers the z-30 search dropdown) -->
    <div class="relative z-10">
      {#if $tftLoading && !$tftSelectedDeck}
        <div class="flex flex-col items-center justify-center p-16">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-purple-400 border-t-transparent mb-3"></div>
          <p class="text-xs font-semibold text-purple-200">Loading TFT meta data…</p>
        </div>
      {:else if $activeTftSubTab === "meta"}
        {#if $tftSelectedDeck}
          <TftCompDetail deck={$tftSelectedDeck} />
        {:else}
          <TftMetaList />
        {/if}
      {:else if $activeTftSubTab === "items"}
        <TftItemSheet />
      {:else if $activeTftSubTab === "emblems"}
        <TftEmblemGuide />
      {:else if $activeTftSubTab === "augments"}
        <TftAugmentsView />
      {/if}
    </div>
  </div>
</div>
