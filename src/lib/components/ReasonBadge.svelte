<script lang="ts">
  import type { BadgeKind } from "../types";

  export let text: string;
  export let kind: BadgeKind = "neutral";

  const styles: Record<BadgeKind, string> = {
    positive: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    negative: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    comp: "border-purple-400/30 bg-purple-400/15 text-purple-300",
    neutral: "border-white/15 bg-white/5 text-slate-400",
  };
</script>

<span class="rounded-full border px-2 py-0.5 text-[11px] {styles[kind]}">
  {text}
</span>
