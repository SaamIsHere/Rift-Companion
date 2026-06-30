<script lang="ts">
  import { connection } from "../stores/connection";
</script>

<div class="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
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
</div>
