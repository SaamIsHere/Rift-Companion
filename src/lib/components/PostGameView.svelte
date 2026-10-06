<script lang="ts">
  import { onMount } from "svelte";
  import {
    postGameMatch,
    isPostGameLoading,
    postGameError,
    fetchLatestPostGame,
    loadMockPostGame,
    clearPostGame,
  } from "../stores/postGame";
  import { activeTab } from "../stores/navigation";
  import { profile } from "../stores/profile";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import {
    squareIconUrl,
    roleIconUrl,
    itemIconUrl,
    summonerSpellIconUrl,
    formatDuration,
    formatTimeAgo,
    splashArtUrl,
  } from "../utils/ddragon";
  import type { PostGameParticipant, PostGameBadge } from "../types";
  import BadgeIcon from "./BadgeIcon.svelte";
  import ResponsiveBadgeList from "./ResponsiveBadgeList.svelte";
  import ObjectiveIcon from "./ObjectiveIcon.svelte";
  import { sortBadgesByTier } from "../utils/postGameScoring";
  import {
    Crown,
    LayoutList,
    Swords,
    Shield,
    Coins,
    RefreshCw,
    Zap,
    Trophy,
    TrendingUp,
    Sparkles,
    Activity,
  } from "lucide-svelte";

  let activeSubTab: "scoreboard" | "damage" | "defense" | "economy" | "timeline" = "scoreboard";
  let hoveredBadge: { badge: PostGameBadge; x: number; y: number } | null = null;
  let hoveredExtraBadges: { badges: PostGameBadge[]; x: number; y: number; isNearBottom: boolean } | null = null;
  let extraBadgesCloseTimer: ReturnType<typeof setTimeout> | null = null;

  let damageSortBy: "damage" | "dpm" | "rank" | "physical" | "magic" | "team" = "damage";
  let defenseSortBy: "totalDefended" | "damageTaken" | "selfMitigated" | "rank" | "team" = "totalDefended";
  let economySortBy: "gold" | "cs" | "csPerMin" | "rank" | "team" = "gold";

  const BOOT_ITEM_IDS = new Set([
    1001, 3006, 3009, 3020, 3047, 3111, 3117, 3158, 3005, 3173, 2422, 1104, 1105, 1106, 1107
  ]);
  const JUNGLE_QUEST_ITEM_IDS = new Set([
    1101, 1102, 1103
  ]);
  const SUPPORT_QUEST_ITEM_IDS = new Set([
    3850, 3851, 3853, 3854, 3855, 3857, 3858, 3859, 3860, 3862, 3863, 3864,
    3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877
  ]);

  function partitionPlayerItems(p: PostGameParticipant): {
    mainItems: number[];
    questOrBootsItem: number;
    trinketItem: number;
  } {
    const raw = p.items || [];
    let trinket = raw[6] || 0;
    let questOrBoots = raw[7] || 0;
    let main = [raw[0] || 0, raw[1] || 0, raw[2] || 0, raw[3] || 0, raw[4] || 0, raw[5] || 0];

    // If 7th slot wasn't explicitly populated in raw[7], detect role-specific quest or boots
    if (!questOrBoots) {
      if (p.role === "adc") {
        const bootIdx = main.findIndex((id) => BOOT_ITEM_IDS.has(id));
        if (bootIdx !== -1 && main.filter((id) => id > 0).length >= 6) {
          questOrBoots = main[bootIdx];
          main[bootIdx] = 0;
        }
      } else if (p.role === "jungle") {
        const jgIdx = main.findIndex((id) => JUNGLE_QUEST_ITEM_IDS.has(id));
        if (jgIdx !== -1) {
          questOrBoots = main[jgIdx];
          main[jgIdx] = 0;
        }
      } else if (p.role === "support") {
        const suppIdx = main.findIndex((id) => SUPPORT_QUEST_ITEM_IDS.has(id));
        if (suppIdx !== -1 && main.filter((id) => id > 0).length >= 6) {
          questOrBoots = main[suppIdx];
          main[suppIdx] = 0;
        }
      }
    }

    return {
      mainItems: main,
      questOrBootsItem: questOrBoots,
      trinketItem: trinket,
    };
  }

  $: match = $postGameMatch;
  $: localPart = match?.localParticipant;
  $: isVictory = match?.localPlayerWon ?? false;
  $: mvp = match?.mvp;
  $: ace = match?.ace;
  $: svp = match?.svp ?? match?.ace;
  $: showSvpInSpotlight = Boolean(localPart?.isMvp && svp);
  $: spotlight2Part = showSvpInSpotlight ? svp : localPart;
  $: maxMatchDamage = Math.max(
    1,
    match?.mvp?.totalDamage ??
      (match?.allParticipants?.length ? Math.max(...match.allParticipants.map((p) => p.totalDamage || 0)) : 1)
  );

  $: sortedDamageParticipants = match?.allParticipants
    ? [...match.allParticipants].sort((a, b) => {
        if (damageSortBy === "damage") return b.totalDamage - a.totalDamage;
        if (damageSortBy === "dpm") return b.dpm - a.dpm;
        if (damageSortBy === "rank") return a.rank - b.rank;
        if (damageSortBy === "physical") return b.physicalDamage - a.physicalDamage;
        if (damageSortBy === "magic") return b.magicDamage - a.magicDamage;
        if (damageSortBy === "team") return a.teamId - b.teamId;
        return 0;
      })
    : [];

  $: sortedDefenseParticipants = match?.allParticipants
    ? [...match.allParticipants].sort((a, b) => {
        const totalDefA = a.damageTaken + a.damageSelfMitigated;
        const totalDefB = b.damageTaken + b.damageSelfMitigated;
        if (defenseSortBy === "totalDefended") return totalDefB - totalDefA;
        if (defenseSortBy === "damageTaken") return b.damageTaken - a.damageTaken;
        if (defenseSortBy === "selfMitigated") return b.damageSelfMitigated - a.damageSelfMitigated;
        if (defenseSortBy === "rank") return a.rank - b.rank;
        if (defenseSortBy === "team") return a.teamId - b.teamId;
        return 0;
      })
    : [];

  $: sortedEconomyParticipants = match?.allParticipants
    ? [...match.allParticipants].sort((a, b) => {
        if (economySortBy === "gold") return b.goldEarned - a.goldEarned;
        if (economySortBy === "cs") return b.cs - a.cs;
        if (economySortBy === "csPerMin") return b.csPerMin - a.csPerMin;
        if (economySortBy === "rank") return a.rank - b.rank;
        if (economySortBy === "team") return a.teamId - b.teamId;
        return 0;
      })
    : [];

  // --- TIMELINE GRAPH & DAMAGE COMPOSITION STATE (Issue 88) ---
  let timelineSvg: SVGSVGElement | null = null;
  let hoveredTimelineIndex: number | null = null;

  $: timeline = match?.timeline;
  $: frames = timeline?.frames || [];
  $: totalFrames = frames.length;
  $: maxGoldLeadVal = Math.max(timeline?.maxGoldDiff || 1000, 2500);

  $: hoveredFrame = (hoveredTimelineIndex !== null && frames[hoveredTimelineIndex]) ? frames[hoveredTimelineIndex] : null;

  function getTimelineX(index: number, count: number): number {
    if (count <= 1) return 450;
    return 60 + (index / (count - 1)) * 780;
  }

  function getTimelineY(goldDiff: number, maxDiff: number): number {
    const clamped = Math.max(-maxDiff, Math.min(maxDiff, goldDiff));
    return 120 - (clamped / maxDiff) * 85;
  }

  $: blueAreaPath = (() => {
    if (!frames.length) return "";
    const n = frames.length;
    const startX = getTimelineX(0, n);
    const endX = getTimelineX(n - 1, n);
    let path = `M ${startX} 120`;
    for (let i = 0; i < n; i++) {
      const x = getTimelineX(i, n);
      const y = Math.min(120, getTimelineY(frames[i].goldDiff, maxGoldLeadVal));
      path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    path += ` L ${endX} 120 Z`;
    return path;
  })();

  $: redAreaPath = (() => {
    if (!frames.length) return "";
    const n = frames.length;
    const startX = getTimelineX(0, n);
    const endX = getTimelineX(n - 1, n);
    let path = `M ${startX} 120`;
    for (let i = 0; i < n; i++) {
      const x = getTimelineX(i, n);
      const y = Math.max(120, getTimelineY(frames[i].goldDiff, maxGoldLeadVal));
      path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    path += ` L ${endX} 120 Z`;
    return path;
  })();

  $: timelineLinePath = (() => {
    if (!frames.length) return "";
    const n = frames.length;
    return frames
      .map((f, i) => `${i === 0 ? "M" : "L"} ${getTimelineX(i, n).toFixed(1)} ${getTimelineY(f.goldDiff, maxGoldLeadVal).toFixed(1)}`)
      .join(" ");
  })();

  $: timelineTicks = (() => {
    if (!frames.length) return [];
    const ticks: { index: number; minute: number; x: number }[] = [];
    const lastIdx = frames.length - 1;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const isStart = i === 0;
      const isFiveMin = f.minute % 5 === 0 && f.minute > 0;
      const isLast = i === lastIdx;
      if (isStart || isFiveMin || isLast) {
        const x = getTimelineX(i, frames.length);
        const prev = ticks[ticks.length - 1];
        // Deduplicate: avoid ticks that are less than 2 minutes apart or less than 32px apart to prevent text collisions
        if (prev && (Math.abs(prev.minute - f.minute) < 2 || Math.abs(prev.x - x) < 32)) {
          if (isLast) {
            ticks[ticks.length - 1] = { index: i, minute: f.minute, x };
          }
          continue;
        }
        ticks.push({ index: i, minute: f.minute, x });
      }
    }
    return ticks;
  })();

  interface MilestonePin {
    index: number;
    minute: number;
    x: number;
    y: number;
    teamId: number;
    primaryType: "baron" | "dragon" | "herald" | "inhibitor" | "tower";
    count: number;
    events: NonNullable<(typeof frames)[0]["events"]>;
    label: string;
  }

  const typePriority: Record<string, number> = {
    baron: 5,
    dragon: 4,
    herald: 3,
    inhibitor: 2,
    tower: 1,
  };

  $: milestonePins = (() => {
    if (!frames.length) return [];
    const pins: MilestonePin[] = [];
    frames.forEach((f, i) => {
      if (!f.events || f.events.length === 0) return;
      const sorted = [...f.events].sort((a, b) => {
        const pA = typePriority[a.type] || 0;
        const pB = typePriority[b.type] || 0;
        return pB - pA;
      });
      const topEv = sorted[0];
      const x = getTimelineX(i, frames.length);
      const y = getTimelineY(f.goldDiff, maxGoldLeadVal);
      const clampedY = Math.max(25, Math.min(215, y));

      pins.push({
        index: i,
        minute: f.minute,
        x,
        y: clampedY,
        teamId: topEv.teamId || 100,
        primaryType: topEv.type as any,
        count: f.events.length,
        events: f.events,
        label: topEv.description,
      });
    });
    return pins;
  })();

  function handleTimelineMouseMove(e: MouseEvent) {
    if (!frames.length || !timelineSvg) return;
    const rect = timelineSvg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const mouseX = e.clientX - rect.left;
    const relX = Math.max(0, Math.min(1, mouseX / rect.width));
    const svgX = relX * 900;
    const clampedX = Math.max(60, Math.min(840, svgX));
    const progress = (clampedX - 60) / 780;
    const idx = Math.round(progress * (frames.length - 1));
    hoveredTimelineIndex = Math.max(0, Math.min(frames.length - 1, idx));
  }

  function handleTimelineMouseLeave() {
    hoveredTimelineIndex = null;
  }

  // Damage distribution totals
  $: bluePhysTotal = match?.blueTeam.participants.reduce((acc, p) => acc + (p.physicalDamage || 0), 0) || 0;
  $: blueMagTotal = match?.blueTeam.participants.reduce((acc, p) => acc + (p.magicDamage || 0), 0) || 0;
  $: blueTrueTotal = match?.blueTeam.participants.reduce((acc, p) => acc + (p.trueDamage || 0), 0) || 0;
  $: blueGrandTotal = Math.max(1, bluePhysTotal + blueMagTotal + blueTrueTotal);

  $: redPhysTotal = match?.redTeam.participants.reduce((acc, p) => acc + (p.physicalDamage || 0), 0) || 0;
  $: redMagTotal = match?.redTeam.participants.reduce((acc, p) => acc + (p.magicDamage || 0), 0) || 0;
  $: redTrueTotal = match?.redTeam.participants.reduce((acc, p) => acc + (p.trueDamage || 0), 0) || 0;
  $: redGrandTotal = Math.max(1, redPhysTotal + redMagTotal + redTrueTotal);

  onMount(() => {
    // If no match loaded and LCU is available, attempt to fetch the latest match
    if (!match && !$isPostGameLoading) {
      void fetchLatestPostGame();
    }
  });

  function cancelCloseExtraBadges() {
    if (extraBadgesCloseTimer) {
      clearTimeout(extraBadgesCloseTimer);
      extraBadgesCloseTimer = null;
    }
  }

  function scheduleCloseExtraBadges() {
    cancelCloseExtraBadges();
    extraBadgesCloseTimer = setTimeout(() => {
      hoveredExtraBadges = null;
    }, 200);
  }

  function handleBadgeMouseEnter(e: MouseEvent, badge: PostGameBadge) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoveredBadge = {
      badge,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    };
  }

  function handleBadgeMouseLeave() {
    hoveredBadge = null;
  }

  function handleExtraBadgesMouseEnter(e: MouseEvent, badges: PostGameBadge[]) {
    cancelCloseExtraBadges();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isNearBottom = window.innerHeight - rect.bottom < 270;
    hoveredExtraBadges = {
      badges,
      x: rect.left + rect.width / 2,
      y: isNearBottom ? rect.top - 6 : rect.bottom + 6,
      isNearBottom,
    };
  }

  function handleExtraBadgesMouseLeave() {
    scheduleCloseExtraBadges();
  }

  function getBadgeTierStyles(tier?: "bronze" | "silver" | "gold"): {
    border: string;
    bg: string;
    text: string;
    pill: string;
  } {
    if (tier === "gold") {
      return {
        border: "border-amber-400/40",
        bg: "bg-amber-500/15",
        text: "text-amber-300",
        pill: "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-amber-400/50 text-amber-200 hover:border-amber-300",
      };
    }
    if (tier === "bronze") {
      return {
        border: "border-amber-700/40",
        bg: "bg-amber-800/20",
        text: "text-amber-400",
        pill: "bg-gradient-to-r from-amber-800/30 to-amber-700/20 border-amber-600/50 text-amber-300 hover:border-amber-400",
      };
    }
    // Silver and cohesive metallic fallback (no purple)
    return {
      border: "border-slate-300/40",
      bg: "bg-slate-300/15",
      text: "text-slate-200",
      pill: "bg-gradient-to-r from-slate-400/20 to-slate-200/20 border-slate-300/40 text-slate-100 hover:border-white",
    };
  }

  function getScoreColor(score: number): string {
    if (score >= 9.0) return "text-amber-400 font-extrabold";
    if (score >= 7.5) return "text-emerald-400 font-bold";
    if (score >= 6.0) return "text-cyan-300 font-semibold";
    if (score >= 4.5) return "text-slate-300 font-normal";
    return "text-rose-400 font-normal";
  }

  function getScoreBg(score: number): string {
    if (score >= 9.0) return "bg-amber-500/20 border-amber-400/40 text-amber-300";
    if (score >= 7.5) return "bg-emerald-500/20 border-emerald-400/40 text-emerald-300";
    if (score >= 6.0) return "bg-cyan-500/15 border-cyan-400/30 text-cyan-300";
    if (score >= 4.5) return "bg-slate-700/30 border-slate-600/40 text-slate-300";
    return "bg-rose-500/15 border-rose-500/30 text-rose-300";
  }

  function getChampName(champId: number, fallback = ""): string {
    return $championCatalog.get(champId)?.name || fallback || `Champion ${champId}`;
  }

  function getChampKey(champId: number, fallback = ""): string {
    return $championCatalog.get(champId)?.key || fallback || "";
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden text-slate-100 select-none pb-12">
  {#if !match}
    <!-- Empty / Loading State -->
    <div class="flex min-h-[500px] flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {#if $isPostGameLoading}
        <div class="flex flex-col items-center gap-4">
          <div class="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
          <p class="text-sm font-semibold text-purple-300">Loading post-game statistics from League Client...</p>
        </div>
      {:else}
        <div class="glass flex max-w-md flex-col items-center gap-4 rounded-2xl border border-purple-500/20 p-8 shadow-2xl backdrop-blur-md">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300">
            <LayoutList class="h-8 w-8" />
          </div>
          <div class="flex flex-col gap-1">
            <h2 class="text-lg font-bold text-white">No Finished Match Active</h2>
            <p class="text-xs text-slate-400 leading-relaxed">
              Once your active match concludes, Rift Companion automatically analyzes all 10 players, assigns 1–10 performance ratings, and awards achievement badges.
            </p>
          </div>

          {#if $postGameError}
            <div class="rounded-lg bg-rose-500/15 border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300">
              {$postGameError}
            </div>
          {/if}

          <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              on:click={() => void fetchLatestPostGame()}
              class="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-600/30 px-4 py-2 text-xs font-bold text-purple-200 transition hover:bg-purple-600 hover:text-white shadow-sm"
            >
              <RefreshCw class="h-3.5 w-3.5" />
              <span>Fetch from Client</span>
            </button>
            <button
              type="button"
              on:click={() => loadMockPostGame(true)}
              class="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500 hover:text-black shadow-sm"
            >
              <Zap class="h-3.5 w-3.5" />
              <span>View Demo Match</span>
            </button>
            <button
              type="button"
              on:click={() => activeTab.set("startseite")}
              class="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Home
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- 1. TOP HEADER BANNER -->
    <header class="relative shrink-0 border-b border-purple-500/15 bg-void-950/60 px-6 py-3.5 backdrop-blur-md {isVictory ? 'border-b-emerald-500/30' : 'border-b-rose-500/30'}">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <!-- Outcome & Details -->
        <div class="flex items-center gap-4">
          <div class="flex flex-col">
            <div class="flex items-center gap-2.5">
              <span class="rounded-lg px-2.5 py-0.5 text-xs font-black tracking-widest uppercase {isVictory ? 'bg-emerald-500 text-void-950 shadow-md shadow-emerald-500/20' : 'bg-rose-500 text-white shadow-md shadow-rose-500/20'}">
                {isVictory ? "VICTORY" : "DEFEAT"}
              </span>
              {#if match.modeType === "aram"}
                <span class="rounded-lg bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 text-xs font-bold text-sky-200 shadow-sm flex items-center gap-1">
                  <span>❄️</span>
                  <span>ARAM • Howling Abyss</span>
                </span>
              {:else if match.modeType === "arena"}
                <span class="rounded-lg bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-xs font-bold text-amber-200 shadow-sm flex items-center gap-1">
                  <span>⚔️</span>
                  <span>Arena • Rings of Wrath</span>
                </span>
              {/if}
              <h1 class="text-base font-bold text-white tracking-wide">
                Post-Game Analysis
              </h1>
            </div>
            <div class="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span class="font-medium text-slate-300">{match.queueLabel}</span>
              <span>•</span>
              <span class="font-mono">{formatDuration(match.gameDuration)}</span>
              {#if match.gameCreation}
                <span>•</span>
                <span>{formatTimeAgo(match.gameCreation)}</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            on:click={() => loadMockPostGame(!isVictory, match.modeType === 'aram' ? 'aram' : 'classic')}
            class="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-300 transition hover:bg-purple-900/40 hover:text-white"
            title="Toggle between Victory and Defeat Demo"
          >
            <Zap class="h-3.5 w-3.5" />
            <span>{isVictory ? "Demo Defeat" : "Demo Victory"}</span>
          </button>
          <button
            type="button"
            on:click={() => loadMockPostGame(true, match.modeType === 'aram' ? 'classic' : 'aram')}
            class="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-900/40 hover:text-white"
            title="Switch between Summoner's Rift and ARAM Demo"
          >
            <span>{match.modeType === 'aram' ? '🛡️ Classic SR' : '❄️ ARAM Demo'}</span>
          </button>
          <button
            type="button"
            on:click={() => void fetchLatestPostGame()}
            class="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-300 transition hover:bg-purple-900/40 hover:text-white"
            title="Reload latest game from Client"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            on:click={() => {
              void clearPostGame();
              activeTab.set("startseite");
            }}
            class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/15 hover:text-white"
            title="Close Post-Game view and return Home"
          >
            <span>✕</span>
            <span>Home</span>
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 pt-6">
      <!-- 2. TOP SPOTLIGHT ROW: MVP & DEINE LEISTUNG -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Spotlight 1: Match MVP -->
        {#if mvp}
          <div class="glass relative flex flex-col justify-between overflow-hidden rounded-2xl border border-amber-400/30 p-5 shadow-xl transition hover:border-amber-400/50">
            <!-- Ambient Champion Splash Artwork with Soft Gradient Fade -->
            <div
              class="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none scale-105 filter blur-[1px]"
              style="background-image: url('{splashArtUrl(getChampKey(mvp.championId, mvp.championName))}');"
            ></div>
            <div class="absolute inset-0 bg-gradient-to-t from-void-950/80 via-void-950/40 to-transparent pointer-events-none"></div>

            <div class="relative flex flex-col gap-4">
              <!-- Top Row: Avatar, Names & Score -->
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3.5">
                  <div class="relative shrink-0">
                    <img
                      src={squareIconUrl(getChampKey(mvp.championId, mvp.championName), $ddragonVersion)}
                      alt={getChampName(mvp.championId, mvp.championName)}
                      class="h-14 w-14 rounded-xl object-cover ring-2 ring-amber-400/80 shadow-lg"
                    />
                    <span class="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-void-950 shadow-md ring-2 ring-void-950" title="Match MVP">
                      <Crown class="h-3.5 w-3.5 stroke-[2.5]" />
                    </span>
                    <span class="absolute -bottom-1 -right-1 rounded bg-void-950/90 px-1 text-[10px] font-bold text-amber-300 border border-amber-400/40">
                      Lvl {mvp.championLevel}
                    </span>
                  </div>

                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-amber-400">
                      <Crown class="h-3.5 w-3.5" />
                      <span>Match MVP</span>
                      <span class="text-slate-500">•</span>
                      <span class="text-slate-400 font-semibold normal-case">Rank #1</span>
                      {#if mvp.isLocal}
                        <span class="text-purple-300 font-medium normal-case">(You)</span>
                      {/if}
                    </div>
                    <h3 class="text-base font-extrabold text-white mt-1 truncate">
                      {mvp.summonerName}
                    </h3>
                    <div class="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
                      <span class="capitalize font-semibold text-amber-200">{getChampName(mvp.championId, mvp.championName)}</span>
                      {#if match.modeType !== "aram" && match.modeType !== "arena"}
                        <span class="text-slate-500">•</span>
                        <span class="uppercase text-[11px] font-medium text-slate-400">{mvp.role}</span>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Score Badge -->
                <div class="flex flex-col items-end shrink-0">
                  <div class="flex items-baseline gap-1">
                    <span class="text-3xl font-black text-amber-300 tracking-tight">{mvp.overallScore.toFixed(1)}</span>
                    <span class="text-xs font-bold text-amber-400/60">/ 10</span>
                  </div>
                  <span class="text-[11px] font-semibold text-slate-400">Overall Rating</span>
                </div>
              </div>

              <!-- MVP Key Stats -->
              <div class="grid grid-cols-4 gap-2 rounded-xl bg-white/[0.03] border border-white/5 p-2.5 text-center text-xs">
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">KDA</div>
                  <div class="font-black text-slate-100">{mvp.kills}/{mvp.deaths}/{mvp.assists}</div>
                  <div class="text-[10px] text-amber-400 font-bold">{mvp.kda} KDA</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Damage</div>
                  <div class="font-black text-slate-100">{(mvp.totalDamage / 1000).toFixed(1)}k</div>
                  <div class="text-[10px] text-slate-400">{Math.round(mvp.damageShare * 100)}% Share</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Farm</div>
                  <div class="font-black text-slate-100">{mvp.cs} CS</div>
                  <div class="text-[10px] text-slate-400">{mvp.csPerMin}/m</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Team KP</div>
                  <div class="font-black text-slate-100">{Math.round(mvp.killParticipation * 100)}%</div>
                  {#if match.modeType === "aram"}
                    <div class="text-[10px] text-slate-400">{(mvp.turretDamage / 1000).toFixed(1)}k Tower</div>
                  {:else if match.modeType === "arena"}
                    <div class="text-[10px] text-slate-400">{(mvp.damageTaken / 1000).toFixed(1)}k Tanked</div>
                  {:else}
                    <div class="text-[10px] text-slate-400">{mvp.visionScore} Vision</div>
                  {/if}
                </div>
              </div>

              <!-- MVP Badges Row (ALL Badges displayed - NO extra details in pill) -->
              {#if mvp.badges.length > 0}
                <div class="flex flex-col gap-1.5 pt-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Earned Badges ({mvp.badges.length})
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#each sortBadgesByTier(mvp.badges) as badge (badge.id)}
                      {@const styles = getBadgeTierStyles(badge.tier)}
                      <button
                        type="button"
                        on:mouseenter={(e) => handleBadgeMouseEnter(e, badge)}
                        on:mouseleave={handleBadgeMouseLeave}
                        class="cursor-help inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold border transition-all duration-150 hover:brightness-125 {styles.pill} select-none shadow-xs"
                      >
                        <BadgeIcon badgeId={badge.id} tier={badge.tier} className="h-3.5 w-3.5 shrink-0" />
                        <span>{badge.name}</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Spotlight 2: YOUR PERFORMANCE (OR MATCH SVP IF USER WAS MVP) -->
        {#if spotlight2Part}
          <div class="glass relative flex flex-col justify-between overflow-hidden rounded-2xl border {showSvpInSpotlight ? 'border-indigo-500/30 hover:border-indigo-400/50' : 'border-purple-500/30 hover:border-purple-400/50'} p-5 shadow-xl transition">
            <!-- Ambient Champion Splash Artwork with Soft Gradient Fade -->
            <div
              class="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none scale-105 filter blur-[1px]"
              style="background-image: url('{splashArtUrl(getChampKey(spotlight2Part.championId, spotlight2Part.championName))}');"
            ></div>
            <div class="absolute inset-0 bg-gradient-to-t from-void-950/80 via-void-950/40 to-transparent pointer-events-none"></div>

            <div class="relative flex flex-col gap-4">
              <!-- Top Row: Avatar, Names & Score -->
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3.5">
                  <div class="relative shrink-0">
                    <img
                      src={squareIconUrl(getChampKey(spotlight2Part.championId, spotlight2Part.championName), $ddragonVersion)}
                      alt={getChampName(spotlight2Part.championId, spotlight2Part.championName)}
                      class="h-14 w-14 rounded-xl object-cover ring-2 {showSvpInSpotlight ? 'ring-indigo-400/80' : 'ring-purple-400/80'} shadow-lg"
                    />
                    <span class="absolute -bottom-1 -right-1 rounded bg-void-950/90 px-1 text-[10px] font-bold {showSvpInSpotlight ? 'text-indigo-300 border-indigo-400/40' : 'text-purple-300 border-purple-400/40'} border">
                      Lvl {spotlight2Part.championLevel}
                    </span>
                  </div>

                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase {showSvpInSpotlight ? 'text-indigo-400' : 'text-purple-400'}">
                      {#if showSvpInSpotlight}
                        <Trophy class="h-3.5 w-3.5 text-indigo-400" />
                        <span>Match SVP</span>
                        <span class="text-slate-500">•</span>
                        <span class="text-slate-400 font-semibold normal-case">Opponent Ace</span>
                        <span class="text-indigo-300 font-semibold normal-case">(Enemy Team)</span>
                      {:else}
                        <span>Your Performance</span>
                        <span class="text-slate-500">•</span>
                        <span class="text-slate-400 font-semibold normal-case">Rank #{spotlight2Part.rank}</span>
                        {#if spotlight2Part.isMvp}
                          <span class="text-amber-400 font-semibold inline-flex items-center gap-1 normal-case">
                            <Crown class="h-3 w-3 stroke-[2.5]" /> MVP
                          </span>
                        {:else if spotlight2Part.isSvp || spotlight2Part.isAce}
                          <span class="text-purple-300 font-semibold normal-case">SVP</span>
                        {/if}
                      {/if}
                    </div>
                    <h3 class="text-base font-extrabold text-white mt-1 truncate">
                      {spotlight2Part.summonerName}
                    </h3>
                    <div class="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
                      <span class="capitalize font-semibold {showSvpInSpotlight ? 'text-indigo-200' : 'text-purple-200'}">{getChampName(spotlight2Part.championId, spotlight2Part.championName)}</span>
                      {#if match.modeType !== "aram" && match.modeType !== "arena"}
                        <span class="text-slate-500">•</span>
                        <span class="uppercase text-[11px] font-medium text-slate-400">{spotlight2Part.role}</span>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Score & Rank Badge -->
                <div class="flex flex-col items-end shrink-0">
                  <div class="flex items-baseline gap-1">
                    <span class="text-3xl font-black {getScoreColor(spotlight2Part.overallScore)} tracking-tight">{spotlight2Part.overallScore.toFixed(1)}</span>
                    <span class="text-xs font-bold text-slate-400">/ 10</span>
                  </div>
                  <span class="text-[11px] font-semibold text-slate-400">Overall Rating</span>
                </div>
              </div>

              <!-- Key Summary Stats -->
              <div class="grid grid-cols-4 gap-2 rounded-xl bg-white/[0.03] border border-white/5 p-2.5 text-center text-xs">
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">KDA</div>
                  <div class="font-black text-slate-100">{spotlight2Part.kills}/{spotlight2Part.deaths}/{spotlight2Part.assists}</div>
                  <div class="text-[10px] {showSvpInSpotlight ? 'text-indigo-300' : 'text-purple-300'} font-bold">{spotlight2Part.kda} KDA</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Damage</div>
                  <div class="font-black text-slate-100">{(spotlight2Part.totalDamage / 1000).toFixed(1)}k</div>
                  <div class="text-[10px] text-slate-400">{Math.round(spotlight2Part.damageShare * 100)}% Share</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Farm</div>
                  <div class="font-black text-slate-100">{spotlight2Part.cs} CS</div>
                  <div class="text-[10px] text-slate-400">{spotlight2Part.csPerMin}/m</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Team KP</div>
                  <div class="font-black text-slate-100">{Math.round(spotlight2Part.killParticipation * 100)}%</div>
                  {#if match.modeType === "aram"}
                    <div class="text-[10px] text-slate-400">{(spotlight2Part.turretDamage / 1000).toFixed(1)}k Tower</div>
                  {:else if match.modeType === "arena"}
                    <div class="text-[10px] text-slate-400">{(spotlight2Part.damageTaken / 1000).toFixed(1)}k Tanked</div>
                  {:else}
                    <div class="text-[10px] text-slate-400">{spotlight2Part.visionScore} Vision</div>
                  {/if}
                </div>
              </div>

              <!-- Badges Row (ALL Badges displayed - NO extra details in pill) -->
              {#if spotlight2Part.badges.length > 0}
                <div class="flex flex-col gap-1.5 pt-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Earned Badges ({spotlight2Part.badges.length})
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#each sortBadgesByTier(spotlight2Part.badges) as badge (badge.id)}
                      {@const styles = getBadgeTierStyles(badge.tier)}
                      <button
                        type="button"
                        on:mouseenter={(e) => handleBadgeMouseEnter(e, badge)}
                        on:mouseleave={handleBadgeMouseLeave}
                        class="cursor-help inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold border transition-all duration-150 hover:brightness-125 {styles.pill} select-none shadow-xs"
                      >
                        <BadgeIcon badgeId={badge.id} tier={badge.tier} className="h-3.5 w-3.5 shrink-0" />
                        <span>{badge.name}</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {:else}
                <div class="text-xs text-slate-400 italic">
                  No specific badges earned in this match.
                </div>
              {/if}
            </div>
          </div>
        {:else if svp}
          <!-- Fallback: Show SVP Spotlight if local player is not found -->
          <div class="glass relative overflow-hidden rounded-2xl border border-purple-400/30 p-5 shadow-xl">
            <div class="flex items-center gap-3">
              <Trophy class="h-6 w-6 text-purple-300" />
              <div>
                <div class="text-xs font-bold text-purple-300 uppercase">MATCH SVP • #{svp.rank}</div>
                <div class="text-base font-bold text-white">{svp.summonerName} ({getChampName(svp.championId)})</div>
                <div class="text-xs text-slate-400">{svp.kills}/{svp.deaths}/{svp.assists} • Score: {svp.overallScore.toFixed(1)}</div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- 3. SUB-TABS NAVIGATION -->
      <div class="flex items-center justify-between border-b border-white/10 pb-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            on:click={() => (activeSubTab = "scoreboard")}
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition {activeSubTab === 'scoreboard'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'}"
          >
            <LayoutList class="h-3.5 w-3.5" />
            <span>Scoreboard</span>
          </button>
          <button
            type="button"
            on:click={() => (activeSubTab = "damage")}
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition {activeSubTab === 'damage'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'}"
          >
            <Swords class="h-3.5 w-3.5" />
            <span>Damage</span>
          </button>
          <button
            type="button"
            on:click={() => (activeSubTab = "defense")}
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition {activeSubTab === 'defense'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'}"
          >
            <Shield class="h-3.5 w-3.5" />
            <span>Defense</span>
          </button>
          <button
            type="button"
            on:click={() => (activeSubTab = "economy")}
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition {activeSubTab === 'economy'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'}"
          >
            <Coins class="h-3.5 w-3.5" />
            <span>Economy</span>
          </button>
          <button
            type="button"
            on:click={() => (activeSubTab = "timeline")}
            class="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition {activeSubTab === 'timeline'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:bg-white/5 hover:text-white'}"
          >
            <TrendingUp class="h-3.5 w-3.5" />
            <span>Timeline & Analysis</span>
          </button>
        </div>
      </div>

      <!-- 4. TAB CONTENTS -->
      {#if activeSubTab === "scoreboard"}
        <!-- SCOREBOARD VIEW (Blue Team vs Red Team) -->
        <div class="flex flex-col gap-6">
          <!-- TEAM 1: BLUE TEAM -->
          <div class="glass flex flex-col overflow-hidden rounded-2xl border {match.blueTeam.win ? 'border-emerald-500/30' : 'border-rose-500/30'} shadow-xl">
            <!-- Team Header -->
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-3 {match.blueTeam.win ? 'bg-emerald-950/30' : 'bg-rose-950/30'}">
              <div class="flex items-center gap-3">
                <span class="text-sm font-black tracking-wider uppercase {match.blueTeam.win ? 'text-emerald-400' : 'text-rose-400'}">
                  Blue Team ({match.blueTeam.win ? 'VICTORY' : 'DEFEAT'})
                </span>
                <span class="text-xs text-slate-400">
                  {match.blueTeam.totalKills} Kills • {(match.blueTeam.totalGold / 1000).toFixed(1)}k Gold
                </span>
              </div>
              <div class="flex items-center gap-4 text-xs font-semibold text-slate-300">
                {#if match.modeType !== "aram" && match.modeType !== "arena"}
                  <span class="flex items-center gap-1.5" title="Dragons Slain">
                    <ObjectiveIcon type="dragon" className="h-4 w-4 text-amber-400" />
                    <span>{match.blueTeam.dragonKills ?? 0}</span>
                  </span>
                  <span class="flex items-center gap-1.5" title="Baron Nashors Slain">
                    <ObjectiveIcon type="baron" className="h-4 w-4 text-purple-300" />
                    <span>{match.blueTeam.baronKills ?? 0}</span>
                  </span>
                {/if}
                <span class="flex items-center gap-1.5" title="Turrets Destroyed">
                  <ObjectiveIcon type="tower" className="h-4 w-4 text-slate-300" />
                  <span>{match.blueTeam.towerKills ?? 0}</span>
                </span>
              </div>
            </div>

            <!-- Table Header -->
            <div class="grid grid-cols-[60px_180px_95px_75px_110px_65px_minmax(0,1fr)_200px] items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <div>Rank</div>
              <div>Player / Champion</div>
              <div>KDA</div>
              <div>{match.modeType === "arena" ? "Rounds" : "Farm (CS)"}</div>
              <div>Damage</div>
              <div>{match.modeType === "aram" ? "Tower Dmg" : match.modeType === "arena" ? "Tanked" : "Vision"}</div>
              <div>Badges</div>
              <div class="text-right pr-2">Items</div>
            </div>

            <!-- Team 1 Participants -->
            <div class="divide-y divide-white/5">
              {#each match.blueTeam.participants as p (p.participantId)}
                {@const itemsData = partitionPlayerItems(p)}
                <div class="grid grid-cols-[60px_180px_95px_75px_110px_65px_minmax(0,1fr)_200px] items-center gap-2 px-4 py-2.5 transition hover:bg-white/[0.04] {p.isLocal ? 'bg-purple-500/10' : ''}">
                  <!-- Rank & Score -->
                  <div class="flex flex-col items-start gap-0.5">
                    <div class="flex items-center gap-1">
                      {#if p.isMvp}
                        <span class="inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/50 px-1.5 py-0.5 text-[9px] font-black text-amber-300" title="MVP (Winning Team Top Performer)">
                          <Crown class="h-2.5 w-2.5 stroke-[2.5]" />
                          <span>MVP</span>
                        </span>
                      {:else if p.isSvp}
                        <span class="rounded-full bg-purple-400/20 border border-purple-400/50 px-1.5 py-0.5 text-[9px] font-black text-purple-300" title="SVP (Losing Team Top Performer • Rank #{p.rank})">
                          SVP
                        </span>
                      {:else}
                        <span class="rounded-full bg-white/5 border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                          #{p.rank}
                        </span>
                      {/if}
                    </div>
                    <span class="text-xs font-bold {getScoreColor(p.overallScore)} leading-tight">
                      {p.overallScore.toFixed(1)}
                    </span>
                  </div>

                  <!-- Player & Champ Info -->
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="relative shrink-0">
                      <img
                        src={squareIconUrl(getChampKey(p.championId, p.championName), $ddragonVersion)}
                        alt={getChampName(p.championId, p.championName)}
                        class="h-8 w-8 rounded-lg object-cover ring-1 ring-white/10"
                      />
                      <span class="absolute -bottom-1 -right-1 rounded bg-void-950 px-0.5 text-[8px] font-bold text-slate-300">
                        {p.championLevel}
                      </span>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="truncate text-xs font-bold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}" title={p.summonerName}>
                          {p.summonerName}
                        </span>
                        {#if p.isLocal}
                          <span class="shrink-0 rounded bg-purple-500/30 px-1 py-0.2 text-[8px] font-bold text-purple-200">
                            YOU
                          </span>
                        {/if}
                      </div>
                      <div class="flex items-center gap-1 text-[10px] text-slate-400">
                        <span class="capitalize text-slate-300">{getChampName(p.championId, p.championName)}</span>
                        {#if match.modeType !== "aram" && match.modeType !== "arena"}
                          <span>•</span>
                          <span class="uppercase text-[9px]">{p.role}</span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- KDA -->
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-100">
                      {p.kills} <span class="text-slate-500">/</span> {p.deaths} <span class="text-slate-500">/</span> {p.assists}
                    </span>
                    <span class="text-[10px] text-slate-400">
                      {p.kda} KDA ({Math.round(p.killParticipation * 100)}% KP)
                    </span>
                  </div>

                  <!-- Farm / CS -->
                  <div class="flex flex-col">
                    {#if match.modeType === "arena"}
                      <span class="text-xs font-bold text-slate-200">Arena</span>
                      <span class="text-[10px] text-slate-400">Round Duel</span>
                    {:else}
                      <span class="text-xs font-bold text-slate-200">{p.cs} CS</span>
                      <span class="text-[10px] text-slate-400">{p.csPerMin} / Min</span>
                    {/if}
                  </div>

                  <!-- Damage & Mini Bar -->
                  <div class="flex flex-col gap-1 pr-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-bold text-slate-100">{(p.totalDamage / 1000).toFixed(1)}k</span>
                      <span class="text-[10px] text-slate-400">{Math.round(p.damageShare * 100)}%</span>
                    </div>
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        class="h-full rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-purple-400"
                        style="width: {Math.min(100, (p.totalDamage / maxMatchDamage) * 100)}%"
                      ></div>
                    </div>
                  </div>

                  <!-- Vision / Tower / Tanked -->
                  <div class="flex flex-col">
                    {#if match.modeType === "aram"}
                      <span class="text-xs font-bold text-slate-200">{(p.turretDamage / 1000).toFixed(1)}k</span>
                      <span class="text-[10px] text-slate-400">Tower</span>
                    {:else if match.modeType === "arena"}
                      <span class="text-xs font-bold text-slate-200">{(p.damageTaken / 1000).toFixed(1)}k</span>
                      <span class="text-[10px] text-slate-400">Tanked</span>
                    {:else}
                      <span class="text-xs font-bold text-slate-200">{p.visionScore}</span>
                      <span class="text-[10px] text-slate-400">{p.controlWardsBought} Pinks</span>
                    {/if}
                  </div>

                  <!-- Badges List (Responsive Dynamic Auto-Fit) -->
                  <div class="min-w-0 overflow-hidden">
                    <ResponsiveBadgeList
                      badges={p.badges}
                      onBadgeHover={handleBadgeMouseEnter}
                      onBadgeLeave={handleBadgeMouseLeave}
                      onExtraHover={handleExtraBadgesMouseEnter}
                      onExtraLeave={handleExtraBadgesMouseLeave}
                    />
                  </div>

                  <!-- Items (6 inventory slots + 7th Quest/Boots slot above Trinket) -->
                  <div class="flex items-center justify-end gap-1.5 w-[196px] shrink-0">
                    <div class="flex items-center gap-1">
                      {#each itemsData.mainItems as it, idx (idx)}
                        <div class="h-6 w-6 rounded bg-void-950/80 border border-white/10 overflow-hidden shrink-0">
                          {#if it > 0}
                            <img
                              src={itemIconUrl(it, $ddragonVersion)}
                              alt="Item"
                              class="h-full w-full object-cover"
                            />
                          {/if}
                        </div>
                      {/each}
                    </div>

                    <!-- 7th Slot (ADC Boots / Quest / Jungle) stacked above Trinket -->
                    <div class="flex flex-col items-center justify-center gap-0.5 shrink-0">
                      <!-- Quest / ADC Boots (smaller item slot on top) -->
                      <div
                        class="h-[13px] w-[13px] rounded-[3px] bg-void-950/90 border overflow-hidden shrink-0 transition flex items-center justify-center {itemsData.questOrBootsItem > 0 ? 'border-amber-400/80 shadow-sm shadow-amber-400/20' : 'border-white/10 border-dashed'}"
                        title={itemsData.questOrBootsItem > 0 ? (BOOT_ITEM_IDS.has(itemsData.questOrBootsItem) ? "ADC Boots Slot (7th Role Quest Slot)" : "Role Quest / Jungle Item") : "Role Quest / Boots Slot"}
                      >
                        {#if itemsData.questOrBootsItem > 0}
                          <img
                            src={itemIconUrl(itemsData.questOrBootsItem, $ddragonVersion)}
                            alt="Quest Item"
                            class="h-full w-full object-cover"
                          />
                        {:else}
                          <span class="text-[7px] text-slate-500 font-bold leading-none select-none">7</span>
                        {/if}
                      </div>

                      <!-- Trinket -->
                      <div
                        class="h-[13px] w-[13px] rounded-[3px] bg-void-950/90 border border-amber-400/40 overflow-hidden shrink-0 transition flex items-center justify-center"
                        title="Trinket"
                      >
                        {#if itemsData.trinketItem > 0}
                          <img
                            src={itemIconUrl(itemsData.trinketItem, $ddragonVersion)}
                            alt="Trinket"
                            class="h-full w-full object-cover"
                          />
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- TEAM 2: RED TEAM -->
          <div class="glass flex flex-col overflow-hidden rounded-2xl border {match.redTeam.win ? 'border-emerald-500/30' : 'border-rose-500/30'} shadow-xl">
            <!-- Team Header -->
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-3 {match.redTeam.win ? 'bg-emerald-950/30' : 'bg-rose-950/30'}">
              <div class="flex items-center gap-3">
                <span class="text-sm font-black tracking-wider uppercase {match.redTeam.win ? 'text-emerald-400' : 'text-rose-400'}">
                  Red Team ({match.redTeam.win ? 'VICTORY' : 'DEFEAT'})
                </span>
                <span class="text-xs text-slate-400">
                  {match.redTeam.totalKills} Kills • {(match.redTeam.totalGold / 1000).toFixed(1)}k Gold
                </span>
              </div>
              <div class="flex items-center gap-4 text-xs font-semibold text-slate-300">
                {#if match.modeType !== "aram" && match.modeType !== "arena"}
                  <span class="flex items-center gap-1.5" title="Dragons Slain">
                    <ObjectiveIcon type="dragon" className="h-4 w-4 text-amber-400" />
                    <span>{match.redTeam.dragonKills ?? 0}</span>
                  </span>
                  <span class="flex items-center gap-1.5" title="Baron Nashors Slain">
                    <ObjectiveIcon type="baron" className="h-4 w-4 text-purple-300" />
                    <span>{match.redTeam.baronKills ?? 0}</span>
                  </span>
                {/if}
                <span class="flex items-center gap-1.5" title="Turrets Destroyed">
                  <ObjectiveIcon type="tower" className="h-4 w-4 text-slate-300" />
                  <span>{match.redTeam.towerKills ?? 0}</span>
                </span>
              </div>
            </div>

            <!-- Table Header -->
            <div class="grid grid-cols-[60px_180px_95px_75px_110px_65px_minmax(0,1fr)_200px] items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <div>Rank</div>
              <div>Player / Champion</div>
              <div>KDA</div>
              <div>{match.modeType === "arena" ? "Rounds" : "Farm (CS)"}</div>
              <div>Damage</div>
              <div>{match.modeType === "aram" ? "Tower Dmg" : match.modeType === "arena" ? "Tanked" : "Vision"}</div>
              <div>Badges</div>
              <div class="text-right pr-2">Items</div>
            </div>

            <!-- Team 2 Participants -->
            <div class="divide-y divide-white/5">
              {#each match.redTeam.participants as p (p.participantId)}
                {@const itemsData = partitionPlayerItems(p)}
                <div class="grid grid-cols-[60px_180px_95px_75px_110px_65px_minmax(0,1fr)_200px] items-center gap-2 px-4 py-2.5 transition hover:bg-white/[0.04] {p.isLocal ? 'bg-purple-500/10' : ''}">
                  <!-- Rank & Score -->
                  <div class="flex flex-col items-start gap-0.5">
                    <div class="flex items-center gap-1">
                      {#if p.isMvp}
                        <span class="inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/50 px-1.5 py-0.5 text-[9px] font-black text-amber-300" title="MVP (Winning Team Top Performer)">
                          <Crown class="h-2.5 w-2.5 stroke-[2.5]" />
                          <span>MVP</span>
                        </span>
                      {:else if p.isSvp}
                        <span class="rounded-full bg-purple-400/20 border border-purple-400/50 px-1.5 py-0.5 text-[9px] font-black text-purple-300" title="SVP (Losing Team Top Performer • Rank #{p.rank})">
                          SVP
                        </span>
                      {:else}
                        <span class="rounded-full bg-white/5 border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                          #{p.rank}
                        </span>
                      {/if}
                    </div>
                    <span class="text-xs font-bold {getScoreColor(p.overallScore)} leading-tight">
                      {p.overallScore.toFixed(1)}
                    </span>
                  </div>

                  <!-- Player & Champ Info -->
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="relative shrink-0">
                      <img
                        src={squareIconUrl(getChampKey(p.championId, p.championName), $ddragonVersion)}
                        alt={getChampName(p.championId, p.championName)}
                        class="h-8 w-8 rounded-lg object-cover ring-1 ring-white/10"
                      />
                      <span class="absolute -bottom-1 -right-1 rounded bg-void-950 px-0.5 text-[8px] font-bold text-slate-300">
                        {p.championLevel}
                      </span>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="truncate text-xs font-bold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}" title={p.summonerName}>
                          {p.summonerName}
                        </span>
                        {#if p.isLocal}
                          <span class="shrink-0 rounded bg-purple-500/30 px-1 py-0.2 text-[8px] font-bold text-purple-200">
                            YOU
                          </span>
                        {/if}
                      </div>
                      <div class="flex items-center gap-1 text-[10px] text-slate-400">
                        <span class="capitalize text-slate-300">{getChampName(p.championId, p.championName)}</span>
                        {#if match.modeType !== "aram" && match.modeType !== "arena"}
                          <span>•</span>
                          <span class="uppercase text-[9px]">{p.role}</span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- KDA -->
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-100">
                      {p.kills} <span class="text-slate-500">/</span> {p.deaths} <span class="text-slate-500">/</span> {p.assists}
                    </span>
                    <span class="text-[10px] text-slate-400">
                      {p.kda} KDA ({Math.round(p.killParticipation * 100)}% KP)
                    </span>
                  </div>

                  <!-- Farm / CS -->
                  <div class="flex flex-col">
                    {#if match.modeType === "arena"}
                      <span class="text-xs font-bold text-slate-200">Arena</span>
                      <span class="text-[10px] text-slate-400">Round Duel</span>
                    {:else}
                      <span class="text-xs font-bold text-slate-200">{p.cs} CS</span>
                      <span class="text-[10px] text-slate-400">{p.csPerMin} / Min</span>
                    {/if}
                  </div>

                  <!-- Damage & Mini Bar -->
                  <div class="flex flex-col gap-1 pr-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-bold text-slate-100">{(p.totalDamage / 1000).toFixed(1)}k</span>
                      <span class="text-[10px] text-slate-400">{Math.round(p.damageShare * 100)}%</span>
                    </div>
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        class="h-full rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-purple-400"
                        style="width: {Math.min(100, (p.totalDamage / maxMatchDamage) * 100)}%"
                      ></div>
                    </div>
                  </div>

                  <!-- Vision / Tower / Tanked -->
                  <div class="flex flex-col">
                    {#if match.modeType === "aram"}
                      <span class="text-xs font-bold text-slate-200">{(p.turretDamage / 1000).toFixed(1)}k</span>
                      <span class="text-[10px] text-slate-400">Tower</span>
                    {:else if match.modeType === "arena"}
                      <span class="text-xs font-bold text-slate-200">{(p.damageTaken / 1000).toFixed(1)}k</span>
                      <span class="text-[10px] text-slate-400">Tanked</span>
                    {:else}
                      <span class="text-xs font-bold text-slate-200">{p.visionScore}</span>
                      <span class="text-[10px] text-slate-400">{p.controlWardsBought} Pinks</span>
                    {/if}
                  </div>

                  <!-- Badges List (Responsive Dynamic Auto-Fit) -->
                  <div class="min-w-0 overflow-hidden">
                    <ResponsiveBadgeList
                      badges={p.badges}
                      onBadgeHover={handleBadgeMouseEnter}
                      onBadgeLeave={handleBadgeMouseLeave}
                      onExtraHover={handleExtraBadgesMouseEnter}
                      onExtraLeave={handleExtraBadgesMouseLeave}
                    />
                  </div>

                  <!-- Items (6 inventory slots + 7th Quest/Boots slot above Trinket) -->
                  <div class="flex items-center justify-end gap-1.5 w-[196px] shrink-0">
                    <div class="flex items-center gap-1">
                      {#each itemsData.mainItems as it, idx (idx)}
                        <div class="h-6 w-6 rounded bg-void-950/80 border border-white/10 overflow-hidden shrink-0">
                          {#if it > 0}
                            <img
                              src={itemIconUrl(it, $ddragonVersion)}
                              alt="Item"
                              class="h-full w-full object-cover"
                            />
                          {/if}
                        </div>
                      {/each}
                    </div>

                    <!-- 7th Slot (ADC Boots / Quest / Jungle) stacked above Trinket -->
                    <div class="flex flex-col items-center justify-center gap-0.5 shrink-0">
                      <!-- Quest / ADC Boots (smaller item slot on top) -->
                      <div
                        class="h-[13px] w-[13px] rounded-[3px] bg-void-950/90 border overflow-hidden shrink-0 transition flex items-center justify-center {itemsData.questOrBootsItem > 0 ? 'border-amber-400/80 shadow-sm shadow-amber-400/20' : 'border-white/10 border-dashed'}"
                        title={itemsData.questOrBootsItem > 0 ? (BOOT_ITEM_IDS.has(itemsData.questOrBootsItem) ? "ADC Boots Slot (7th Role Quest Slot)" : "Role Quest / Jungle Item") : "Role Quest / Boots Slot"}
                      >
                        {#if itemsData.questOrBootsItem > 0}
                          <img
                            src={itemIconUrl(itemsData.questOrBootsItem, $ddragonVersion)}
                            alt="Quest Item"
                            class="h-full w-full object-cover"
                          />
                        {:else}
                          <span class="text-[7px] text-slate-500 font-bold leading-none select-none">7</span>
                        {/if}
                      </div>

                      <!-- Trinket -->
                      <div
                        class="h-[13px] w-[13px] rounded-[3px] bg-void-950/90 border border-amber-400/40 overflow-hidden shrink-0 transition flex items-center justify-center"
                        title="Trinket"
                      >
                        {#if itemsData.trinketItem > 0}
                          <img
                            src={itemIconUrl(itemsData.trinketItem, $ddragonVersion)}
                            alt="Trinket"
                            class="h-full w-full object-cover"
                          />
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

      {:else if activeSubTab === "damage"}
        <!-- DAMAGE COMPARISON VIEW -->
        <div class="glass flex flex-col gap-4 rounded-2xl p-6 shadow-xl">
          <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 class="text-sm font-bold text-white">Damage Dealt to Enemy Champions</h3>
              <p class="text-xs text-slate-400">Physical, Magic, and True Damage Breakdown</p>
            </div>
            <div class="flex items-center gap-6 text-xs">
              <!-- Sort Filter (Left of the legend) -->
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-400">Sort by:</span>
                <select
                  bind:value={damageSortBy}
                  class="rounded-lg border border-white/10 bg-void-950/80 px-2.5 py-1 text-xs font-semibold text-slate-200 outline-none transition hover:border-purple-400/50 focus:border-purple-400 cursor-pointer"
                >
                  <option value="damage" class="bg-[#120a26] text-white">Damage (High → Low)</option>
                  <option value="dpm" class="bg-[#120a26] text-white">Damage / Min</option>
                  <option value="rank" class="bg-[#120a26] text-white">Match Rank</option>
                  <option value="physical" class="bg-[#120a26] text-white">Physical Damage</option>
                  <option value="magic" class="bg-[#120a26] text-white">Magic Damage</option>
                  <option value="team" class="bg-[#120a26] text-white">Team</option>
                </select>
              </div>

              <!-- Legend -->
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-amber-500"></span>
                  <span>Physical</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-sky-500"></span>
                  <span>Magic</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-slate-100"></span>
                  <span>True Damage</span>
                </span>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3 pt-2">
            {#each sortedDamageParticipants as p (p.participantId)}
              {@const maxDmg = maxMatchDamage}
              {@const totalPct = Math.min(100, (p.totalDamage / maxDmg) * 100)}
              {@const physPct = p.totalDamage > 0 ? (p.physicalDamage / p.totalDamage) * 100 : 0}
              {@const magPct = p.totalDamage > 0 ? (p.magicDamage / p.totalDamage) * 100 : 0}
              {@const truePct = p.totalDamage > 0 ? (p.trueDamage / p.totalDamage) * 100 : 0}

              <div class="flex items-center gap-4 text-xs">
                <!-- Champ & Name with Match Rank before avatar -->
                <div class="flex w-52 items-center gap-2 shrink-0 min-w-0">
                  <span
                    class="flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11px] font-black {p.rank === 1 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50' : p.rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40' : p.rank === 3 ? 'bg-amber-700/20 text-amber-400 border border-amber-600/40' : 'bg-white/5 text-slate-400 border border-white/5'}"
                    title="Match Rank #{p.rank}"
                  >
                    #{p.rank}
                  </span>
                  <img
                    src={squareIconUrl(getChampKey(p.championId), $ddragonVersion)}
                    alt=""
                    class="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10 shrink-0"
                  />
                  <div class="flex flex-col min-w-0">
                    <span class="truncate font-bold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}">
                      {p.summonerName}
                    </span>
                    <span class="text-[10px] text-slate-400 capitalize">{getChampName(p.championId)}</span>
                  </div>
                </div>

                <!-- Horizontal Stacked Bar -->
                <div class="flex-1">
                  <div class="flex h-5 w-full overflow-hidden rounded-md bg-white/5">
                    <div
                      class="flex h-full overflow-hidden rounded-md transition-all duration-500"
                      style="width: {totalPct}%;"
                    >
                      <div class="h-full bg-amber-500" style="width: {physPct}%;" title="Physical: {p.physicalDamage.toLocaleString()}"></div>
                      <div class="h-full bg-sky-500" style="width: {magPct}%;" title="Magic: {p.magicDamage.toLocaleString()}"></div>
                      <div class="h-full bg-slate-100" style="width: {truePct}%;" title="True: {p.trueDamage.toLocaleString()}"></div>
                    </div>
                  </div>
                </div>

                <!-- Values -->
                <div class="flex w-32 items-center justify-end gap-2 text-right shrink-0">
                  <span class="font-bold text-slate-100">{p.totalDamage.toLocaleString()}</span>
                  <span class="text-[10px] text-slate-400 font-mono">({Math.round(p.dpm)}/m)</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

      {:else if activeSubTab === "defense"}
        <!-- DEFENSE & TANKING VIEW -->
        <div class="glass flex flex-col gap-4 rounded-2xl p-6 shadow-xl">
          <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 class="text-sm font-bold text-white">Damage Taken & Mitigated</h3>
              <p class="text-xs text-slate-400">Comparison of frontline durability and damage mitigation</p>
            </div>
            <div class="flex items-center gap-6 text-xs">
              <!-- Sort Filter (Left of the legend) -->
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-400">Sort by:</span>
                <select
                  bind:value={defenseSortBy}
                  class="rounded-lg border border-white/10 bg-void-950/80 px-2.5 py-1 text-xs font-semibold text-slate-200 outline-none transition hover:border-purple-400/50 focus:border-purple-400 cursor-pointer"
                >
                  <option value="totalDefended" class="bg-[#120a26] text-white">Total Defended</option>
                  <option value="damageTaken" class="bg-[#120a26] text-white">Damage Taken</option>
                  <option value="selfMitigated" class="bg-[#120a26] text-white">Self Mitigated</option>
                  <option value="rank" class="bg-[#120a26] text-white">Match Rank</option>
                  <option value="team" class="bg-[#120a26] text-white">Team</option>
                </select>
              </div>

              <!-- Legend -->
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-rose-500"></span>
                  <span>Damage Taken</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-emerald-500"></span>
                  <span>Self Mitigated</span>
                </span>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3 pt-2">
            {#each sortedDefenseParticipants as p (p.participantId)}
              {@const totalDef = p.damageTaken + p.damageSelfMitigated}
              {@const maxDef = Math.max(1, ...match.allParticipants.map((x) => x.damageTaken + x.damageSelfMitigated))}
              {@const barPct = Math.min(100, (totalDef / maxDef) * 100)}
              {@const takenPct = totalDef > 0 ? (p.damageTaken / totalDef) * 100 : 0}
              {@const mitPct = totalDef > 0 ? (p.damageSelfMitigated / totalDef) * 100 : 0}

              <div class="flex items-center gap-4 text-xs">
                <!-- Champ & Name with Match Rank before avatar -->
                <div class="flex w-52 items-center gap-2 shrink-0 min-w-0">
                  <span
                    class="flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11px] font-black {p.rank === 1 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50' : p.rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40' : p.rank === 3 ? 'bg-amber-700/20 text-amber-400 border border-amber-600/40' : 'bg-white/5 text-slate-400 border border-white/5'}"
                    title="Match Rank #{p.rank}"
                  >
                    #{p.rank}
                  </span>
                  <img
                    src={squareIconUrl(getChampKey(p.championId), $ddragonVersion)}
                    alt=""
                    class="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10 shrink-0"
                  />
                  <div class="flex flex-col min-w-0">
                    <span class="truncate font-bold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}">
                      {p.summonerName}
                    </span>
                    <span class="text-[10px] text-slate-400 capitalize">{getChampName(p.championId)}</span>
                  </div>
                </div>

                <!-- Bar -->
                <div class="flex-1">
                  <div class="flex h-5 w-full overflow-hidden rounded-md bg-white/5">
                    <div
                      class="flex h-full overflow-hidden rounded-md transition-all duration-500"
                      style="width: {barPct}%;"
                    >
                      <div class="h-full bg-rose-500" style="width: {takenPct}%;" title="Damage Taken: {p.damageTaken.toLocaleString()}"></div>
                      <div class="h-full bg-emerald-500" style="width: {mitPct}%;" title="Mitigated: {p.damageSelfMitigated.toLocaleString()}"></div>
                    </div>
                  </div>
                </div>

                <!-- Total Defended -->
                <div class="flex w-32 items-center justify-end gap-2 text-right shrink-0">
                  <span class="font-bold text-slate-100">{(totalDef / 1000).toFixed(1)}k</span>
                  <span class="text-[10px] text-slate-400">Total</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

      {:else if activeSubTab === "economy"}
        <!-- ECONOMY & GOLD VIEW -->
        <div class="glass flex flex-col gap-4 rounded-2xl p-6 shadow-xl">
          <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 class="text-sm font-bold text-white">Gold Earned & Farming Efficiency</h3>
              <p class="text-xs text-slate-400">Comparison of total gold accumulation and CS income</p>
            </div>
            <!-- Sort Filter (Right side of header) -->
            <div class="flex items-center gap-2 text-xs">
              <span class="text-xs font-semibold text-slate-400">Sort by:</span>
              <select
                bind:value={economySortBy}
                class="rounded-lg border border-white/10 bg-void-950/80 px-2.5 py-1 text-xs font-semibold text-slate-200 outline-none transition hover:border-purple-400/50 focus:border-purple-400 cursor-pointer"
              >
                <option value="gold" class="bg-[#120a26] text-white">Gold (High → Low)</option>
                <option value="cs" class="bg-[#120a26] text-white">Total CS</option>
                <option value="csPerMin" class="bg-[#120a26] text-white">CS / Min</option>
                <option value="rank" class="bg-[#120a26] text-white">Match Rank</option>
                <option value="team" class="bg-[#120a26] text-white">Team</option>
              </select>
            </div>
          </div>

          <div class="flex flex-col gap-3 pt-2">
            {#each sortedEconomyParticipants as p (p.participantId)}
              {@const maxGold = Math.max(1, ...match.allParticipants.map((x) => x.goldEarned))}
              {@const goldPct = Math.min(100, (p.goldEarned / maxGold) * 100)}

              <div class="flex items-center gap-4 text-xs">
                <!-- Champ & Name with Match Rank before avatar -->
                <div class="flex w-52 items-center gap-2 shrink-0 min-w-0">
                  <span
                    class="flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11px] font-black {p.rank === 1 ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50' : p.rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40' : p.rank === 3 ? 'bg-amber-700/20 text-amber-400 border border-amber-600/40' : 'bg-white/5 text-slate-400 border border-white/5'}"
                    title="Match Rank #{p.rank}"
                  >
                    #{p.rank}
                  </span>
                  <img
                    src={squareIconUrl(getChampKey(p.championId), $ddragonVersion)}
                    alt=""
                    class="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10 shrink-0"
                  />
                  <div class="flex flex-col min-w-0">
                    <span class="truncate font-bold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}">
                      {p.summonerName}
                    </span>
                    <span class="text-[10px] text-slate-400 capitalize">{getChampName(p.championId)}</span>
                  </div>
                </div>

                <!-- Bar -->
                <div class="flex-1">
                  <div class="flex h-5 w-full overflow-hidden rounded-md bg-white/5">
                    <div
                      class="h-full rounded-md bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500"
                      style="width: {goldPct}%;"
                    ></div>
                  </div>
                </div>

                <!-- Gold & CS -->
                <div class="flex w-40 items-center justify-end gap-3 text-right shrink-0">
                  <span class="font-bold text-amber-300">{p.goldEarned.toLocaleString()} g</span>
                  <span class="text-[10px] text-slate-400 font-mono">({p.cs} CS • {p.csPerMin}/m)</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

      {:else if activeSubTab === "timeline"}
        <!-- TIMELINE & ANALYSIS VIEW (Issue 88) -->
        <div class="flex flex-col gap-6">
          <!-- Comeback Alert Banner if detected -->
          {#if timeline?.hasComeback}
            <div class="flex items-center justify-between rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-sky-500/20 p-4 shadow-xl backdrop-blur-md">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-void-950 shadow-md">
                  <Sparkles class="h-5 w-5 stroke-[2.5]" />
                </div>
                <div class="flex flex-col">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-black uppercase tracking-wider text-amber-300">Epic Comeback Detected</span>
                  </div>
                  <p class="text-xs text-slate-200 mt-0.5">
                    {timeline.comebackDetails || "The winning team overcame a major deficit to turn the match around and secure the win!"}
                  </p>
                </div>
              </div>
            </div>
          {/if}

          <!-- 3 KPI Cards: Peak Blue Lead, Peak Red Lead, Final Gold Diff -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="glass flex flex-col gap-1 rounded-2xl border border-blue-500/30 bg-blue-950/20 p-4 shadow-lg">
              <div class="flex items-center justify-between text-xs font-bold text-sky-400 uppercase tracking-wider">
                <span>Peak Blue Advantage</span>
                <span class="text-base">🛡️</span>
              </div>
              <div class="text-2xl font-black text-white mt-1">
                {#if timeline?.maxBlueLead && timeline.maxBlueLead.amount > 0}
                  +{Math.round(timeline.maxBlueLead.amount).toLocaleString()} <span class="text-xs text-sky-300 font-bold">Gold</span>
                  <span class="text-xs text-slate-400 font-normal font-mono">({timeline.maxBlueLead.minute}m)</span>
                {:else}
                  <span class="text-slate-400 text-base font-normal">No Blue Lead</span>
                {/if}
              </div>
              <div class="text-[11px] text-slate-400">Largest lead held by Blue Team</div>
            </div>

            <div class="glass flex flex-col gap-1 rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4 shadow-lg">
              <div class="flex items-center justify-between text-xs font-bold text-rose-400 uppercase tracking-wider">
                <span>Peak Red Advantage</span>
                <span class="text-base">⚔️</span>
              </div>
              <div class="text-2xl font-black text-white mt-1">
                {#if timeline?.maxRedLead && timeline.maxRedLead.amount > 0}
                  +{Math.round(timeline.maxRedLead.amount).toLocaleString()} <span class="text-xs text-rose-300 font-bold">Gold</span>
                  <span class="text-xs text-slate-400 font-normal font-mono">({timeline.maxRedLead.minute}m)</span>
                {:else}
                  <span class="text-slate-400 text-base font-normal">No Red Lead</span>
                {/if}
              </div>
              <div class="text-[11px] text-slate-400">Largest lead held by Red Team</div>
            </div>

            <div class="glass flex flex-col gap-1 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 shadow-lg">
              <div class="flex items-center justify-between text-xs font-bold text-purple-300 uppercase tracking-wider">
                <span>Final Gold Difference</span>
                <span class="text-base">🏆</span>
              </div>
              <div class="text-2xl font-black text-white mt-1">
                {#if frames.length > 0}
                  {@const lastFrame = frames[frames.length - 1]}
                  {#if lastFrame.goldDiff >= 0}
                    <span class="text-sky-300">+{lastFrame.goldDiff.toLocaleString()} g</span>
                    <span class="text-xs text-slate-400 font-semibold">(Blue)</span>
                  {:else}
                    <span class="text-rose-300">+{Math.abs(lastFrame.goldDiff).toLocaleString()} g</span>
                    <span class="text-xs text-slate-400 font-semibold">(Red)</span>
                  {/if}
                {:else}
                  <span class="text-slate-400 text-base font-normal">0 g</span>
                {/if}
              </div>
              <div class="text-[11px] text-slate-400">Margin at the conclusion of the match</div>
            </div>
          </div>

          <!-- Interactive Team Gold Advantage Timeline Chart -->
          <div class="glass flex flex-col gap-4 rounded-2xl p-6 shadow-xl">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <Activity class="h-4 w-4 text-purple-400" />
                  <span>Team Gold Advantage Over Time</span>
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">
                  Dynamic timeline displaying relative team net worth advantage and objective milestones
                </p>
              </div>

              <!-- Live HUD Info -->
              <div class="flex items-center gap-4 bg-void-950/70 border border-white/10 rounded-xl px-3 py-1.5 text-xs shadow-inner">
                {#if hoveredFrame}
                  <div class="flex items-center gap-3">
                    <span class="font-mono font-bold text-amber-300">{hoveredFrame.minute}:00</span>
                    <span class="text-slate-500">•</span>
                    {#if hoveredFrame.goldDiff > 0}
                      <span class="font-bold text-sky-400">Blue +{hoveredFrame.goldDiff.toLocaleString()}g</span>
                    {:else if hoveredFrame.goldDiff < 0}
                      <span class="font-bold text-rose-400">Red +{Math.abs(hoveredFrame.goldDiff).toLocaleString()}g</span>
                    {:else}
                      <span class="font-bold text-slate-300">Parity (0g)</span>
                    {/if}
                    <span class="text-slate-500">•</span>
                    <span class="text-[11px] text-slate-300">
                      <span class="text-sky-300 font-semibold">{(hoveredFrame.blueGold / 1000).toFixed(1)}k</span> vs <span class="text-rose-300 font-semibold">{(hoveredFrame.redGold / 1000).toFixed(1)}k</span>
                    </span>
                    {#if hoveredFrame.events && hoveredFrame.events.length > 0}
                      <div class="flex items-center gap-1.5 pl-1 border-l border-white/10 flex-wrap">
                        {#each hoveredFrame.events as ev}
                          <span class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase {ev.teamId === 100 ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40' : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'}">
                            {ev.description || ev.type}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="flex items-center gap-3">
                    <span class="text-slate-400 text-xs italic">
                      Hover over graph to scrub through timeline & events
                    </span>
                    <span class="text-slate-600">•</span>
                    <span class="text-[10px] text-slate-400 flex items-center gap-2">
                      <span class="text-sky-400 font-bold">D</span> Dragon
                      <span class="text-purple-400 font-bold">B</span> Baron
                      <span class="text-purple-300 font-bold">H</span> Herald
                      <span class="text-slate-200 font-bold">T</span> Turret
                      <span class="text-amber-400 font-bold">I</span> Inhibitor
                    </span>
                  </div>
                {/if}
              </div>
            </div>

            <!-- SVG Graph Container -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="relative w-full rounded-xl bg-void-950/60 border border-white/5 py-2 px-2 overflow-hidden"
            >
              <svg
                bind:this={timelineSvg}
                viewBox="0 0 900 240"
                preserveAspectRatio="none"
                class="w-full h-64 overflow-visible cursor-crosshair select-none block"
                on:mousemove={handleTimelineMouseMove}
                on:mouseleave={handleTimelineMouseLeave}
              >
                <defs>
                  <linearGradient id="blueLeadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.38" />
                    <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02" />
                  </linearGradient>
                  <linearGradient id="redLeadGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.38" />
                    <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.02" />
                  </linearGradient>
                </defs>

                <!-- Gridlines -->
                <!-- Upper grid line (+Max Gold Lead) -->
                <line x1="60" y1="35" x2="840" y2="35" stroke="rgba(56, 189, 248, 0.15)" stroke-dasharray="3 3" />
                <text x="52" y="38" text-anchor="end" font-size="9" font-family="monospace" fill="rgba(56, 189, 248, 0.7)">
                  +{Math.round(maxGoldLeadVal / 1000)}k
                </text>

                <!-- Center Parity Line (0) -->
                <line x1="60" y1="120" x2="840" y2="120" stroke="rgba(255, 255, 255, 0.25)" stroke-dasharray="4 4" stroke-width="1.5" />
                <text x="52" y="123" text-anchor="end" font-size="9" font-family="monospace" fill="rgba(255, 255, 255, 0.5)">
                  0
                </text>

                <!-- Lower grid line (-Max Gold Lead) -->
                <line x1="60" y1="205" x2="840" y2="205" stroke="rgba(244, 63, 94, 0.15)" stroke-dasharray="3 3" />
                <text x="52" y="208" text-anchor="end" font-size="9" font-family="monospace" fill="rgba(244, 63, 94, 0.7)">
                  -{Math.round(maxGoldLeadVal / 1000)}k
                </text>

                <!-- Area Fills -->
                {#if blueAreaPath}
                  <path d={blueAreaPath} fill="url(#blueLeadGrad)" />
                {/if}
                {#if redAreaPath}
                  <path d={redAreaPath} fill="url(#redLeadGrad)" />
                {/if}

                <!-- Main Line -->
                {#if timelineLinePath}
                  <path
                    d={timelineLinePath}
                    fill="none"
                    stroke="#c084fc"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                {/if}

                <!-- Time Axis Minute Ticks (Deduplicated to avoid collisions) -->
                {#each timelineTicks as t}
                  <line
                    x1={t.x}
                    y1="210"
                    x2={t.x}
                    y2="216"
                    stroke="rgba(255,255,255,0.2)"
                  />
                  <text
                    x={t.x}
                    y="228"
                    text-anchor="middle"
                    font-size="9"
                    font-family="monospace"
                    fill="rgba(148, 163, 184, 0.8)"
                  >
                    {t.minute}m
                  </text>
                {/each}

                <!-- Objective Markers / Milestone Pins (Cleanly aggregated with count badges) -->
                {#each milestonePins as pin}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <g
                    class="cursor-pointer"
                    on:mouseenter={() => { hoveredTimelineIndex = pin.index; }}
                  >
                    <!-- Outer ring glow -->
                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r="8.5"
                      fill={pin.teamId === 100 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(244, 63, 94, 0.25)'}
                    />
                    <!-- Center node -->
                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r="6.5"
                      fill="#0b0517"
                      stroke={pin.teamId === 100 ? '#38bdf8' : '#f43f5e'}
                      stroke-width="1.8"
                    />

                    <!-- Objective Icon / Symbol -->
                    {#if pin.primaryType === 'baron'}
                      <text x={pin.x} y={pin.y + 2.5} text-anchor="middle" font-size="7.5" font-weight="900" font-family="sans-serif" fill="#c084fc">B</text>
                    {:else if pin.primaryType === 'dragon'}
                      <text x={pin.x} y={pin.y + 2.5} text-anchor="middle" font-size="7.5" font-weight="900" font-family="sans-serif" fill="#38bdf8">D</text>
                    {:else if pin.primaryType === 'herald'}
                      <text x={pin.x} y={pin.y + 2.5} text-anchor="middle" font-size="7.5" font-weight="900" font-family="sans-serif" fill="#c084fc">H</text>
                    {:else if pin.primaryType === 'inhibitor'}
                      <text x={pin.x} y={pin.y + 2.5} text-anchor="middle" font-size="7.5" font-weight="900" font-family="sans-serif" fill="#facc15">I</text>
                    {:else}
                      <!-- Tower -->
                      <text x={pin.x} y={pin.y + 2.5} text-anchor="middle" font-size="7.5" font-weight="900" font-family="sans-serif" fill="#e2e8f0">T</text>
                    {/if}

                    <!-- Multiple events badge (e.g. 5 towers/inhibs in 1 minute) -->
                    {#if pin.count > 1}
                      <circle
                        cx={pin.x + 5.5}
                        cy={pin.y - 5.5}
                        r="4"
                        fill={pin.teamId === 100 ? '#0369a1' : '#be123c'}
                        stroke="#ffffff"
                        stroke-width="1"
                      />
                      <text
                        x={pin.x + 5.5}
                        y={pin.y - 3.2}
                        text-anchor="middle"
                        font-size="6"
                        font-weight="900"
                        font-family="sans-serif"
                        fill="#ffffff"
                      >
                        {pin.count}
                      </text>
                    {/if}

                    <title>{pin.minute}m: {pin.events.map(e => e.description).join(' | ')}</title>
                  </g>
                {/each}

                <!-- Scrubber Guide Line & Dot when hovering -->
                {#if hoveredTimelineIndex !== null && hoveredFrame}
                  <line
                    x1={getTimelineX(hoveredTimelineIndex, frames.length)}
                    y1="25"
                    x2={getTimelineX(hoveredTimelineIndex, frames.length)}
                    y2="215"
                    stroke="rgba(255, 255, 255, 0.7)"
                    stroke-width="1.5"
                    stroke-dasharray="2 2"
                  />
                  <circle
                    cx={getTimelineX(hoveredTimelineIndex, frames.length)}
                    cy={getTimelineY(hoveredFrame.goldDiff, maxGoldLeadVal)}
                    r="5.5"
                    fill="#facc15"
                    stroke="#120a26"
                    stroke-width="2.5"
                  />
                {/if}
              </svg>
            </div>
          </div>

          <!-- COMPARATIVE DAMAGE BREAKDOWN SECTION -->
          <div class="glass flex flex-col gap-6 rounded-2xl p-6 shadow-xl">
            <div class="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <Swords class="h-4 w-4 text-purple-400" />
                  <span>Comparative Damage Breakdown</span>
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">
                  Physical vs Magic vs True damage distribution comparing Blue and Red Teams
                </p>
              </div>
              <div class="flex items-center gap-4 text-xs font-semibold">
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-amber-500"></span>
                  <span class="text-slate-300">Physical</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-sky-500"></span>
                  <span class="text-slate-300">Magic</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded bg-slate-100"></span>
                  <span class="text-slate-300">True Damage</span>
                </span>
              </div>
            </div>

            <!-- Team Level Comparison Bars -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Blue Team -->
              <div class="flex flex-col gap-2 rounded-xl bg-blue-950/20 border border-blue-500/20 p-4">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider text-sky-400">Blue Team Damage</span>
                  <span class="text-sm font-black text-white">{blueGrandTotal.toLocaleString()}</span>
                </div>
                <div class="flex h-3.5 w-full overflow-hidden rounded-md bg-white/5">
                  <div class="h-full bg-amber-500 transition-all duration-500" style="width: {(bluePhysTotal / blueGrandTotal) * 100}%;"></div>
                  <div class="h-full bg-sky-500 transition-all duration-500" style="width: {(blueMagTotal / blueGrandTotal) * 100}%;"></div>
                  <div class="h-full bg-slate-100 transition-all duration-500" style="width: {(blueTrueTotal / blueGrandTotal) * 100}%;"></div>
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-300 pt-1">
                  <span class="text-amber-400 font-bold">{Math.round((bluePhysTotal / blueGrandTotal) * 100)}% AD <span class="text-slate-400 font-normal">({(bluePhysTotal / 1000).toFixed(1)}k)</span></span>
                  <span class="text-sky-400 font-bold">{Math.round((blueMagTotal / blueGrandTotal) * 100)}% AP <span class="text-slate-400 font-normal">({(blueMagTotal / 1000).toFixed(1)}k)</span></span>
                  <span class="text-slate-200 font-bold">{Math.round((blueTrueTotal / blueGrandTotal) * 100)}% True <span class="text-slate-400 font-normal">({(blueTrueTotal / 1000).toFixed(1)}k)</span></span>
                </div>
              </div>

              <!-- Red Team -->
              <div class="flex flex-col gap-2 rounded-xl bg-rose-950/20 border border-rose-500/20 p-4">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black uppercase tracking-wider text-rose-400">Red Team Damage</span>
                  <span class="text-sm font-black text-white">{redGrandTotal.toLocaleString()}</span>
                </div>
                <div class="flex h-3.5 w-full overflow-hidden rounded-md bg-white/5">
                  <div class="h-full bg-amber-500 transition-all duration-500" style="width: {(redPhysTotal / redGrandTotal) * 100}%;"></div>
                  <div class="h-full bg-sky-500 transition-all duration-500" style="width: {(redMagTotal / redGrandTotal) * 100}%;"></div>
                  <div class="h-full bg-slate-100 transition-all duration-500" style="width: {(redTrueTotal / redGrandTotal) * 100}%;"></div>
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-300 pt-1">
                  <span class="text-amber-400 font-bold">{Math.round((redPhysTotal / redGrandTotal) * 100)}% AD <span class="text-slate-400 font-normal">({(redPhysTotal / 1000).toFixed(1)}k)</span></span>
                  <span class="text-sky-400 font-bold">{Math.round((redMagTotal / redGrandTotal) * 100)}% AP <span class="text-slate-400 font-normal">({(redMagTotal / 1000).toFixed(1)}k)</span></span>
                  <span class="text-slate-200 font-bold">{Math.round((redTrueTotal / redGrandTotal) * 100)}% True <span class="text-slate-400 font-normal">({(redTrueTotal / 1000).toFixed(1)}k)</span></span>
                </div>
              </div>
            </div>

            <!-- Per-Player Damage Splits Columns -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <!-- Blue Team Players -->
              <div class="flex flex-col gap-2.5">
                <div class="text-xs font-bold uppercase tracking-wider text-sky-400 pb-1 border-b border-white/5">
                  Blue Team Participant Splits
                </div>
                {#each match.blueTeam.participants as p (p.participantId)}
                  {@const pTotal = Math.max(1, p.totalDamage)}
                  {@const pPhys = (p.physicalDamage / pTotal) * 100}
                  {@const pMag = (p.magicDamage / pTotal) * 100}
                  {@const pTrue = (p.trueDamage / pTotal) * 100}
                  <div class="flex items-center gap-3 text-xs bg-white/[0.02] rounded-lg p-2 border border-white/5 hover:bg-white/[0.04] transition">
                    <img
                      src={squareIconUrl(getChampKey(p.championId, p.championName), $ddragonVersion)}
                      alt=""
                      class="h-7 w-7 rounded-md object-cover ring-1 ring-white/10 shrink-0"
                    />
                    <div class="flex flex-col w-28 shrink-0 min-w-0">
                      <span class="truncate font-semibold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}">{p.summonerName}</span>
                      <span class="text-[10px] text-slate-400">{(p.totalDamage / 1000).toFixed(1)}k dmg</span>
                    </div>
                    <div class="flex-1 flex flex-col gap-1">
                      <div class="flex h-2 w-full overflow-hidden rounded bg-white/5">
                        <div class="h-full bg-amber-500" style="width: {pPhys}%;"></div>
                        <div class="h-full bg-sky-500" style="width: {pMag}%;"></div>
                        <div class="h-full bg-slate-100" style="width: {pTrue}%;"></div>
                      </div>
                      <div class="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                        <span class="text-amber-400/90">{Math.round(pPhys)}% AD</span>
                        <span class="text-sky-400/90">{Math.round(pMag)}% AP</span>
                        <span class="text-slate-300">{Math.round(pTrue)}% True</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Red Team Players -->
              <div class="flex flex-col gap-2.5">
                <div class="text-xs font-bold uppercase tracking-wider text-rose-400 pb-1 border-b border-white/5">
                  Red Team Participant Splits
                </div>
                {#each match.redTeam.participants as p (p.participantId)}
                  {@const pTotal = Math.max(1, p.totalDamage)}
                  {@const pPhys = (p.physicalDamage / pTotal) * 100}
                  {@const pMag = (p.magicDamage / pTotal) * 100}
                  {@const pTrue = (p.trueDamage / pTotal) * 100}
                  <div class="flex items-center gap-3 text-xs bg-white/[0.02] rounded-lg p-2 border border-white/5 hover:bg-white/[0.04] transition">
                    <img
                      src={squareIconUrl(getChampKey(p.championId, p.championName), $ddragonVersion)}
                      alt=""
                      class="h-7 w-7 rounded-md object-cover ring-1 ring-white/10 shrink-0"
                    />
                    <div class="flex flex-col w-28 shrink-0 min-w-0">
                      <span class="truncate font-semibold {p.isLocal ? 'text-purple-300' : 'text-slate-100'}">{p.summonerName}</span>
                      <span class="text-[10px] text-slate-400">{(p.totalDamage / 1000).toFixed(1)}k dmg</span>
                    </div>
                    <div class="flex-1 flex flex-col gap-1">
                      <div class="flex h-2 w-full overflow-hidden rounded bg-white/5">
                        <div class="h-full bg-amber-500" style="width: {pPhys}%;"></div>
                        <div class="h-full bg-sky-500" style="width: {pMag}%;"></div>
                        <div class="h-full bg-slate-100" style="width: {pTrue}%;"></div>
                      </div>
                      <div class="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                        <span class="text-amber-400/90">{Math.round(pPhys)}% AD</span>
                        <span class="text-sky-400/90">{Math.round(pMag)}% AP</span>
                        <span class="text-slate-300">{Math.round(pTrue)}% True</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 5. FLOATING BADGE TOOLTIP -->
  {#if hoveredBadge}
    <div
      class="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full rounded-xl border border-white/20 bg-void-950/95 p-3 shadow-2xl backdrop-blur-xl transition-all duration-150 max-w-xs"
      style="left: {hoveredBadge.x}px; top: {hoveredBadge.y}px;"
    >
      <div class="flex items-center gap-2">
        <BadgeIcon badgeId={hoveredBadge.badge.id} tier={hoveredBadge.badge.tier} className="h-4 w-4 shrink-0" />
        <div class="flex flex-col">
          <span class="text-xs font-black text-white flex items-center gap-1.5">
            {hoveredBadge.badge.name}
            {#if hoveredBadge.badge.tier}
              <span class="rounded bg-white/10 px-1 py-0.2 text-[9px] uppercase font-bold text-amber-300">
                {hoveredBadge.badge.tier}
              </span>
            {/if}
          </span>
          {#if hoveredBadge.badge.valueDisplay}
            <span class="text-[10px] font-bold text-amber-300">{hoveredBadge.badge.valueDisplay}</span>
          {/if}
        </div>
      </div>
      <p class="mt-1.5 text-[11px] leading-relaxed text-slate-300">
        {hoveredBadge.badge.description}
      </p>
    </div>
  {/if}

  <!-- 6. FLOATING EXTRA BADGES POPOVER (Interactive hover + scrolling) -->
  {#if hoveredExtraBadges}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed pointer-events-auto z-50 -translate-x-1/2 rounded-xl border border-white/20 bg-void-950/95 p-3 shadow-2xl backdrop-blur-xl transition-all duration-150 w-72 max-w-sm flex flex-col gap-2 {hoveredExtraBadges.isNearBottom ? '-translate-y-full' : ''}"
      style="left: {hoveredExtraBadges.x}px; top: {hoveredExtraBadges.y}px;"
      on:mouseenter={cancelCloseExtraBadges}
      on:mouseleave={scheduleCloseExtraBadges}
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
          +{hoveredExtraBadges.badges.length} Additional Badges
        </span>
        <span class="text-[9px] text-slate-400">Scroll to view</span>
      </div>
      <div class="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
        {#each sortBadgesByTier(hoveredExtraBadges.badges) as b (b.id)}
          {@const bStyles = getBadgeTierStyles(b.tier)}
          <div class="flex items-start gap-2 rounded-lg border {bStyles.border} {bStyles.bg} p-2 transition-all duration-150 hover:brightness-125">
            <BadgeIcon badgeId={b.id} tier={b.tier} className="h-4 w-4 shrink-0 mt-0.5" />
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold text-white">{b.name}</span>
                {#if b.tier}
                  <span class="rounded bg-white/10 px-1 text-[9px] uppercase font-bold text-amber-300">
                    {b.tier}
                  </span>
                {/if}
                {#if b.valueDisplay}
                  <span class="text-[10px] font-semibold text-amber-300 ml-auto">{b.valueDisplay}</span>
                {/if}
              </div>
              <p class="text-[10px] text-slate-300 leading-snug mt-0.5">{b.description}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
