<script lang="ts">
  import type { PostGameBadge } from "../types";
  import BadgeIcon from "./BadgeIcon.svelte";
  import { sortBadgesByTier } from "../utils/postGameScoring";

  export let badges: PostGameBadge[] = [];
  export let onBadgeHover: (e: MouseEvent, badge: PostGameBadge) => void = () => {};
  export let onBadgeLeave: () => void = () => {};
  export let onExtraHover: (e: MouseEvent, badges: PostGameBadge[]) => void = () => {};
  export let onExtraLeave: () => void = () => {};

  let containerWidth = 0;

  $: sortedBadges = sortBadgesByTier(badges);

  // Function to get tier styling (Bronze to Gold theme only, no purple)
  function getBadgeTierStyles(tier?: "bronze" | "silver" | "gold") {
    if (tier === "gold") {
      return {
        pill: "bg-gradient-to-r from-amber-500/20 to-yellow-500/15 border-amber-400/50 text-amber-200 hover:border-amber-300 hover:bg-amber-500/30",
      };
    }
    if (tier === "bronze") {
      return {
        pill: "bg-gradient-to-r from-amber-800/30 to-amber-700/20 border-amber-600/50 text-amber-300 hover:border-amber-400 hover:bg-amber-800/40",
      };
    }
    // Silver or default fallback (cohesive metallic tone)
    return {
      pill: "bg-gradient-to-r from-slate-400/20 to-slate-200/15 border-slate-300/40 text-slate-100 hover:border-white hover:bg-slate-300/30",
    };
  }

  // Calculate dynamically how many badges fit based on live containerWidth
  $: visibleCount = (() => {
    if (!containerWidth || containerWidth <= 0) return Math.min(2, sortedBadges.length);
    if (sortedBadges.length <= 1) return sortedBadges.length;

    const PLUS_WIDTH = 38;
    const GAP = 6;
    const AVG_BADGE_WIDTH = 96;

    // Check if all badges fit without the +X button
    const totalAllWidth = sortedBadges.length * AVG_BADGE_WIDTH + (sortedBadges.length - 1) * GAP;
    if (totalAllWidth <= containerWidth) {
      return sortedBadges.length;
    }

    // Allocate space leaving room for the +X overflow button
    const available = Math.max(0, containerWidth - PLUS_WIDTH - GAP);
    const count = Math.floor((available + GAP) / (AVG_BADGE_WIDTH + GAP));
    return Math.max(1, Math.min(sortedBadges.length - 1, count));
  })();

  $: visibleBadges = sortedBadges.slice(0, visibleCount);
  $: extraBadges = sortedBadges.slice(visibleCount);
</script>

<div
  bind:clientWidth={containerWidth}
  class="flex w-full items-center gap-1.5 min-w-0 overflow-hidden py-0.5"
>
  {#each visibleBadges as badge (badge.id)}
    {@const styles = getBadgeTierStyles(badge.tier)}
    <button
      type="button"
      on:mouseenter={(e) => onBadgeHover(e, badge)}
      on:mouseleave={onBadgeLeave}
      class="cursor-help shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-all duration-150 hover:brightness-125 {styles.pill} max-w-[125px] truncate select-none shadow-xs"
    >
      <BadgeIcon badgeId={badge.id} tier={badge.tier} className="h-3 w-3 shrink-0" />
      <span class="truncate">{badge.name}</span>
    </button>
  {/each}

  {#if extraBadges.length > 0}
    <button
      type="button"
      on:mouseenter={(e) => onExtraHover(e, extraBadges)}
      on:mouseleave={onExtraLeave}
      class="cursor-help shrink-0 inline-flex items-center justify-center rounded-md border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-200 transition-all duration-150 hover:bg-amber-500/35 hover:text-white hover:brightness-125 select-none shadow-xs"
      title="{extraBadges.length} more badges"
    >
      +{extraBadges.length}
    </button>
  {/if}
</div>
