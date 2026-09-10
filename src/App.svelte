<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { initIpc } from "./lib/ipc/tauri";
  import { initChampions } from "./lib/stores/champions";
  import { collapsed } from "./lib/stores/ui";
  import { activeTab } from "./lib/stores/navigation";
  import { viewedProfile, loadPlayerProfile } from "./lib/stores/profile";
  import TopNavBar from "./lib/components/TopNavBar.svelte";
  import LandingPage from "./lib/components/LandingPage.svelte";
  import ProfileView from "./lib/components/ProfileView.svelte";
  import ChampionsView from "./lib/components/ChampionsView.svelte";
  import RankingsView from "./lib/components/RankingsView.svelte";
  import LiveMatchView from "./lib/components/LiveMatchView.svelte";
  import MatchSimulationView from "./lib/components/MatchSimulationView.svelte";
  import SettingsModal from "./lib/components/SettingsModal.svelte";

  onMount(() => {
    initChampions(); // load Data Dragon id→name/icon catalog
    initIpc();

    // Disable default browser context menu globally to prevent inspect element
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleContextMenu, { capture: true });

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
    };
  });

  function handleGlobalKeydown(e: KeyboardEvent) {
    // Intercept DevTools shortcuts (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U)
    if (
      e.key === "F12" ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) ||
      ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U"))
    ) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Intercept F5 and Ctrl+R / Cmd+R to prevent webview from reloading back to startseite
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      // If currently on profile tab, smoothly refresh the viewed profile data instead
      if ($activeTab === "profil") {
        const vp = get(viewedProfile);
        if (vp) {
          loadPlayerProfile(vp.game_name, vp.tag_line, vp.region || "EUW", true);
        } else {
          loadPlayerProfile(undefined, undefined, "EUW", true);
        }
      }
    }
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} on:contextmenu|preventDefault />

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
      {:else if $activeTab === "simulation"}
        <MatchSimulationView />
      {/if}
    </div>
  {/if}

  <!-- Global Settings Modal -->
  <SettingsModal />
</div>
