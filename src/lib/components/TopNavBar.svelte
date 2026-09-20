<script lang="ts">
  import { activeTab, type NavTab, resetChampionsView } from "../stores/navigation";
  import { draft, gameflowPhase } from "../stores/draft";
  import { connection } from "../stores/connection";
  import { profile, loadPlayerProfile, isExplicitSearch, activeSearchQuery } from "../stores/profile";
  import { rankTier } from "../stores/rank";
  import { ddragonVersion } from "../stores/champions";
  import { profileIconUrl } from "../utils/ddragon";
  import { settingsOpen } from "../stores/settings";
  import { updateAvailable, updateVersion, showUpdateModal } from "../stores/updater";
  import WindowControls from "./WindowControls.svelte";

  // Center navigation tabs in English
  const tabs: { id: NavTab; label: string }[] = [
    { id: "champions", label: "CHAMPIONS" },
    { id: "ranglisten", label: "RANKINGS" },
    { id: "simulation", label: "MATCH SIMULATION" },
    { id: "live_match", label: "LIVE MATCH" },
  ];

  function formatRank(tier: string): string {
    return tier
      .replace("_plus", "+")
      .replace("_", " ")
      .toUpperCase();
  }
</script>

<!-- Slimmer, sleek topbar with native draggable region -->
<header
  data-tauri-drag-region
  class="relative z-30 flex h-11 w-full items-center justify-between border-b border-purple-500/15 bg-void-950/95 px-4 backdrop-blur-xl select-none transition-colors duration-300"
>
  <!-- Left: Clickable Brand Logo & Title (opens STARTSEITE) -->
  <button
    type="button"
    on:click={() => activeTab.set("startseite")}
    class="group flex items-center gap-2.5 transition focus:outline-none"
    title="Home"
  >
    <div class="relative flex h-7 w-7 items-center justify-center transition group-hover:scale-105">
      <img
        src="/app-icon.png"
        alt="Rift Companion Logo"
        draggable="false"
        class="h-6 w-6 rounded-md object-contain"
        on:error={(e) => {
          const target = e.currentTarget as HTMLImageElement;
          target.src = '/logo.png';
        }}
      />
    </div>
    <span class="text-sm font-bold tracking-wide text-white transition group-hover:text-purple-200">
      Rift Companion
    </span>
  </button>

  <!-- Center: Main Navigation Tabs -->
  <nav class="flex h-full items-center gap-0.5" data-tauri-drag-region>
    {#each tabs as tab (tab.id)}
      {@const isActive = $activeTab === tab.id}
      <button
        type="button"
        on:click={() => {
          if (tab.id === "champions") {
            resetChampionsView();
          }
          activeTab.set(tab.id);
        }}
        class="relative flex h-full items-center px-3.5 text-[11px] font-bold tracking-wider uppercase transition-all duration-200 {isActive
          ? 'text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}"
      >
        <div class="flex items-center gap-1.5">
          <span>{tab.label}</span>
          {#if tab.id === "live_match" && ($draft || ["ChampSelect", "GameStart", "InProgress", "Reconnect"].includes($gameflowPhase))}
            <!-- Pulsing LIVE badge when champ select or match is active -->
            <span class="flex h-2 w-2 relative">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          {/if}
        </div>

        {#if isActive}
          <!-- Active indicator bar at the bottom -->
          <div class="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 via-violet-400 to-purple-500"></div>
          <!-- Subtle top/center highlight -->
          <div class="absolute inset-0 bg-purple-500/[0.07] pointer-events-none"></div>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Right: Profile Info (no box), Settings Cog (no box), and Window Controls -->
  <div class="flex items-center gap-4">
    <!-- User Profile Snippet (frameless, matching mockup) -->
    <button
      type="button"
      on:click={() => {
        isExplicitSearch.set(false);
        if ($profile) {
          activeSearchQuery.set($profile.display_name);
          const parts = $profile.display_name.split("#");
          const gn = parts[0];
          const tl = parts[1] || "EUW";
          loadPlayerProfile(gn, tl, "EUW", false);
        } else {
          activeSearchQuery.set("");
          loadPlayerProfile(undefined, undefined, "EUW", false);
        }
        activeTab.set("profil");
      }}
      class="group flex items-center gap-2.5 text-right transition hover:opacity-80 focus:outline-none"
      title="View My Profile"
    >
      {#if $profile}
        <div class="flex flex-col">
          <div class="flex items-center justify-end gap-1.5">
            <span class="text-xs font-bold text-slate-100 leading-tight group-hover:text-purple-200 transition">
              {$profile.display_name}
            </span>
          </div>
          <div class="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wider leading-none">
            <span class="text-purple-300/80">{formatRank($rankTier)}</span>
            {#if $connection === "connected"}
              <span class="text-emerald-400 font-bold lowercase tracking-normal text-[9px]">online</span>
            {:else}
              <span class="text-amber-400/80 font-normal lowercase tracking-normal text-[9px]">(offline)</span>
            {/if}
          </div>
        </div>
        <div class="relative">
          <img
            src={profileIconUrl($profile.profile_icon_id, $ddragonVersion)}
            alt="Summoner Avatar"
            draggable="false"
            class="h-7 w-7 rounded-full object-cover ring-1 {$activeTab === 'profil'
              ? 'ring-2 ring-purple-400 scale-105'
              : $connection === 'connected'
              ? 'ring-purple-400/50'
              : 'ring-purple-500/20 opacity-85'} transition group-hover:ring-purple-300"
          />
          <span
            class="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-void-950 {$connection === 'connected'
              ? 'bg-emerald-400'
              : 'bg-amber-400/85'}"
            title={$connection === 'connected' ? 'Client connected' : 'Client offline (last active account)'}
          ></span>
        </div>
      {:else}
        <div class="flex flex-col">
          <span class="text-xs font-bold text-slate-300 leading-tight group-hover:text-purple-200 transition">
            Offline
          </span>
          <span class="text-[10px] font-semibold uppercase tracking-wider text-purple-300/60 leading-none">
            {formatRank($rankTier)}
          </span>
        </div>
        <div class="flex h-7 w-7 items-center justify-center rounded-full bg-purple-950/40 ring-1 {$activeTab === 'profil' ? 'ring-2 ring-purple-400' : 'ring-purple-500/30'} text-purple-300 transition group-hover:ring-purple-400/60">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
          </svg>
        </div>
      {/if}
    </button>

    <!-- Update Badge (subtle indicator when an update was found in the background) -->
    {#if $updateAvailable}
      <button
        type="button"
        on:click={() => showUpdateModal.set(true)}
        class="group flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300 shadow-sm transition hover:bg-emerald-500/25 hover:border-emerald-400 hover:scale-105 active:scale-95 focus:outline-none"
        title="Update v{$updateVersion} ready - Click to review & install"
      >
        <span class="flex h-1.5 w-1.5 relative">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
        </span>
        <span>Update v{$updateVersion}</span>
      </button>
    {/if}

    <!-- Settings Cog (clean icon without box/border, matching mockup) -->
    <button
      type="button"
      on:click={() => settingsOpen.set(true)}
      class="relative flex items-center justify-center text-slate-400 hover:text-purple-200 transition p-1 focus:outline-none"
      title={$updateAvailable ? `Settings (Update v${$updateVersion} available)` : "Settings"}
      aria-label="Open settings"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      {#if $updateAvailable}
        <span class="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-void-950"></span>
      {/if}
    </button>

    <!-- Native Window Controls: Minimize, Maximize, Close -->
    <WindowControls />
  </div>
</header>
