<script lang="ts">
  export let value: number; // 0–100

  $: width = Math.max(0, Math.min(100, value));
  // Shift hue from amber (weak) → cyan (strong) based on score.
  $: color =
    value >= 60
      ? "from-purple-500 to-violet-400"
      : value >= 45
        ? "from-amber-300 to-purple-400"
        : "from-rose-400 to-amber-300";
</script>

<div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
  <div
    class="h-full rounded-full bg-gradient-to-r {color} transition-[width] duration-500 ease-out"
    style="width: {width}%"
  ></div>
</div>
