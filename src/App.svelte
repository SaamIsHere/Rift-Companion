<script lang="ts">
  import { onMount } from "svelte";
  import { initIpc } from "./lib/ipc/tauri";
  import { initChampions } from "./lib/stores/champions";
  import { collapsed } from "./lib/stores/ui";
  import ConnectionStatus from "./lib/components/ConnectionStatus.svelte";
  import RankSelector from "./lib/components/RankSelector.svelte";
  import SettingsButton from "./lib/components/SettingsButton.svelte";
  import SettingsModal from "./lib/components/SettingsModal.svelte";
  import WindowControls from "./lib/components/WindowControls.svelte";
  import DraftBoard from "./lib/components/DraftBoard.svelte";
  import RecommendationList from "./lib/components/RecommendationList.svelte";

  onMount(() => {
    initChampions(); // load Data Dragon id→name/icon catalog
    initIpc();
  });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-slate-100">
  <!-- Custom frameless title bar (window is decorations:false). -->
  <header
    data-tauri-drag-region
    class="flex items-center justify-between px-6 py-4"
  >
    <div class="flex items-center gap-3">
      <img
        src="/logo.png"
        alt="Rift Companion logo"
        draggable="false"
        class="h-9 w-9 rounded-xl shadow-[0_0_18px] shadow-hextech-cyan/30"
      />
      <div>
        <h1 class="text-lg font-semibold leading-none tracking-wide">
          Rift Companion
        </h1>
        <p class="text-[11px] text-slate-500">Champion Select Advisor</p>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <RankSelector />
      <ConnectionStatus />
      <SettingsButton />
      <WindowControls />
    </div>
  </header>

  <main
    class:hidden={$collapsed}
    class="grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-5 px-6 pb-6"
  >
    <DraftBoard />
    <RecommendationList />
  </main>

  <SettingsModal />
</div>
