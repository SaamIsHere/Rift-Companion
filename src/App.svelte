<script lang="ts">
  import { onMount } from "svelte";
  import { initIpc } from "./lib/ipc/tauri";
  import { initChampions } from "./lib/stores/champions";
  import { collapsed } from "./lib/stores/ui";
  import { activeTab } from "./lib/stores/navigation";
  import TopNavBar from "./lib/components/TopNavBar.svelte";
  import LandingPage from "./lib/components/LandingPage.svelte";
  import ProfileView from "./lib/components/ProfileView.svelte";
  import ChampionsView from "./lib/components/ChampionsView.svelte";
  import RankingsView from "./lib/components/RankingsView.svelte";
  import LiveMatchView from "./lib/components/LiveMatchView.svelte";
  import SettingsModal from "./lib/components/SettingsModal.svelte";

  onMount(() => {
    initChampions(); // load Data Dragon id→name/icon catalog
    initIpc();
  });
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden text-slate-100 bg-[#07040d]">
  <!-- Sleek, slim custom frameless navigation bar (window is decorations:false) -->
  <TopNavBar />

  <!-- Main view container (hidden when rolled-up into window-shade mode) -->
  {#if !$collapsed}
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {#if $activeTab === "startseite"}
        <LandingPage />
      {:else if $activeTab === "live_match"}
        <LiveMatchView />
      {:else if $activeTab === "profil"}
        <ProfileView />
      {:else if $activeTab === "champions"}
        <ChampionsView />
      {:else if $activeTab === "ranglisten"}
        <RankingsView />
      {/if}
    </div>
  {/if}

  <!-- Global Settings Modal -->
  <SettingsModal />
</div>
