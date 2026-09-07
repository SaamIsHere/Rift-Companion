<script lang="ts">
  import { connection } from "../stores/connection";
  import { ddragonVersion } from "../stores/champions";
  import { profile } from "../stores/profile";
  import { profileIconUrl } from "../utils/ddragon";
</script>

<div class="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
  {#if $profile}
    <div class="relative">
      <img
        src={profileIconUrl($profile.profile_icon_id, $ddragonVersion)}
        alt=""
        draggable="false"
        class="h-5 w-5 rounded-full ring-1 {$connection === 'connected' ? 'ring-emerald-400/60' : 'ring-purple-500/30 opacity-80'}"
      />
      <span class="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-[#0c061a] {$connection === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
    </div>
    <span class="text-slate-300">{$profile.display_name}</span>
    {#if $connection === "connected"}
      <span class="text-slate-500">Lv. {$profile.level}</span>
    {:else}
      <span class="text-amber-400/80 text-xs">(offline)</span>
    {/if}
  {:else}
    <span
      class="h-2 w-2 rounded-full {$connection === 'connected'
        ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400'
        : 'animate-pulse bg-amber-400'}"
    ></span>
    <span class="text-slate-300">
      {$connection === "connected"
        ? "Client connected"
        : "Waiting for League client…"}
    </span>
  {/if}
</div>
