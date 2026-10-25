<script lang="ts">
  import { activeGameMode } from "../stores/navigation";
</script>

<!-- Connected pill toggle: League | TFT -->
<div
  class="relative inline-flex items-center rounded-full border border-purple-500/25 bg-void-950/80 p-0.5 shadow-inner backdrop-blur-md"
  role="group"
  aria-label="Game mode selection"
>
  <!-- Left Half: League -->
  <button
    type="button"
    on:click={() => activeGameMode.set("lol")}
    class="relative z-10 flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition-colors duration-150 focus:outline-none {$activeGameMode === 'lol'
      ? 'bg-purple-600 text-white'
      : 'text-slate-400 hover:text-purple-200 hover:bg-purple-950/30'}"
    title="League of Legends"
  >
    <span>League</span>
  </button>

  <!-- Right Half: TFT -->
  <button
    type="button"
    on:click={() => activeGameMode.set("tft")}
    class="relative z-10 flex items-center justify-center rounded-full px-3 py-1 text-[11px] font-bold tracking-wider uppercase transition-colors duration-150 focus:outline-none {$activeGameMode === 'tft'
      ? 'bg-purple-600 text-white'
      : 'text-slate-400 hover:text-purple-200 hover:bg-purple-950/30'}"
    title="Teamfight Tactics"
  >
    <span>TFT</span>
  </button>
</div>
