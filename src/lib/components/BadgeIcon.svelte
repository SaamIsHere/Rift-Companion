<script lang="ts">
  import {
    Crown,
    Trophy,
    Medal,
    Swords,
    Flame,
    Eye,
    Users,
    Shield,
    ShieldCheck,
    Mountain,
    Zap,
    Coins,
    Crosshair,
    Castle,
    PawPrint,
    Skull,
    Radar,
    Footprints,
    Feather,
    Bomb,
    Award,
    Sprout,
  } from "lucide-svelte";
  import type { BadgeTier } from "../types";

  export let badgeId: string = "";
  export let tier: BadgeTier | undefined = undefined;
  export let className: string = "h-3.5 w-3.5 shrink-0";

  $: iconColor = (() => {
    if (tier === "gold") return "text-amber-400";
    if (tier === "silver") return "text-slate-200";
    if (tier === "bronze") return "text-amber-500";
    return "text-amber-300";
  })();
</script>

<span class="inline-flex items-center justify-center {className} {iconColor}">
  {#if badgeId.includes("pentakill")}
    <Crown class="h-full w-full" strokeWidth={2.2} />
  {:else if badgeId.includes("quadrakill")}
    <Swords class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("unkillable")}
    <Trophy class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("flawless")}
    <Medal class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("high_dps")}
    <Flame class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("cs_machine")}
    <Sprout class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("vision")}
    <Eye class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("team_player")}
    <Users class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("iron_wall_bronze")}
    <!-- Frontline badge -->
    <Mountain class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("iron_wall_silver")}
    <!-- Damage Sponge badge -->
    <ShieldCheck class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("iron_wall")}
    <!-- Iron Wall badge -->
    <Shield class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("cc_disruptor")}
    <Zap class="h-full w-full" strokeWidth={2.2} />
  {:else if badgeId.includes("gold_hoarder")}
    <Coins class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("first_blood")}
    <Crosshair class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("demolisher")}
    <Castle class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("monster_hunter")}
    <!-- Monster Hunter badge (Dragons/Baron/Herald) -->
    <PawPrint class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("rampage")}
    <!-- Rampage spree badge -->
    <Skull class="h-full w-full" strokeWidth={2.2} />
  {:else if badgeId.includes("invader")}
    <Footprints class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("ward_hunter")}
    <Radar class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("pacifist")}
    <Feather class="h-full w-full" strokeWidth={2} />
  {:else if badgeId.includes("glass_cannon")}
    <Bomb class="h-full w-full" strokeWidth={2} />
  {:else}
    <Award class="h-full w-full" strokeWidth={2} />
  {/if}
</span>
