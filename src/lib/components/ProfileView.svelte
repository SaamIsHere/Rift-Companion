<script lang="ts">
  import { connection } from "../stores/connection";
  import { profile } from "../stores/profile";
  import { rankTier } from "../stores/rank";
  import { ddragonVersion } from "../stores/champions";
  import { profileIconUrl } from "../utils/ddragon";

  function formatRank(tier: string): string {
    return tier
      .replace("_plus", "+")
      .replace("_", " ")
      .toUpperCase();
  }
</script>

<div class="flex flex-1 flex-col items-center justify-center p-8 select-none">
  <div class="glass flex w-full max-w-lg flex-col items-center rounded-2xl p-8 text-center">
    {#if $profile}
      <div class="relative mb-4">
        <img
          src={profileIconUrl($profile.profile_icon_id, $ddragonVersion)}
          alt="Summoner Icon"
          class="h-24 w-24 rounded-full border-2 {$connection === 'connected'
            ? 'border-purple-500/60 shadow-[0_0_24px_rgba(168,85,247,0.5)]'
            : 'border-purple-500/30 opacity-85 shadow-[0_0_16px_rgba(168,85,247,0.25)]'}"
        />
        <span class="absolute bottom-0 right-0 rounded-full bg-purple-950 border border-purple-400/50 px-2 py-0.5 text-xs font-bold text-purple-200">
          Lv. {$profile.level}
        </span>
      </div>

      <h2 class="text-2xl font-extrabold text-white tracking-wide">
        {$profile.display_name}
      </h2>

      {#if $connection === "connected"}
        <div class="mt-2 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/40 px-3.5 py-1 text-xs font-semibold text-purple-200">
          <span class="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
          <span>League Client Connected</span>
        </div>
      {:else}
        <div class="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-950/20 px-3.5 py-1 text-xs font-semibold text-amber-300">
          <span class="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Client Offline · Remembered Account</span>
        </div>
      {/if}

      <div class="mt-6 grid w-full grid-cols-2 gap-4 text-left">
        <div class="glass-soft rounded-xl p-4">
          <span class="text-xs uppercase tracking-wider text-purple-300/70">Active Rank</span>
          <p class="mt-1 text-lg font-bold text-white">{formatRank($rankTier)}</p>
        </div>
        <div class="glass-soft rounded-xl p-4">
          <span class="text-xs uppercase tracking-wider text-purple-300/70">Data Dragon</span>
          <p class="mt-1 text-lg font-bold text-white">v{$ddragonVersion}</p>
        </div>
      </div>

      {#if $connection !== "connected"}
        <p class="mt-5 text-xs text-purple-200/50 max-w-sm">
          Launch the League of Legends client to synchronize live champion select and detect account switches.
        </p>
      {/if}
    {:else}
      <div class="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-purple-500/30 bg-purple-950/40 text-purple-400">
        <svg class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="8" r="4" />
          <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
        </svg>
      </div>

      <h2 class="text-xl font-bold text-white">No Profile Connected</h2>
      <p class="mt-2 text-sm text-slate-400 max-w-sm">
        Launch the League of Legends client to automatically detect your summoner name, level, and profile icon.
      </p>

      <div class="mt-6 flex items-center gap-2 text-xs text-amber-400/90 font-medium bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
        <span class="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
        <span>Waiting for League client WebSocket...</span>
      </div>
    {/if}
  </div>
</div>
