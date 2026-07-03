<script lang="ts">
  import { connection } from "../stores/connection";
  import { ddragonVersion } from "../stores/champions";
  import { profile } from "../stores/profile";
  import { profileIconUrl } from "../utils/ddragon";
</script>

<div class="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
  {#if $connection === "connected" && $profile}
    <img
      src={profileIconUrl($profile.profile_icon_id, $ddragonVersion)}
      alt=""
      draggable="false"
      class="h-5 w-5 rounded-full ring-1 ring-emerald-400/60"
    />
    <span class="text-slate-300">{$profile.display_name}</span>
    <span class="text-slate-500">Lv. {$profile.level}</span>
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
