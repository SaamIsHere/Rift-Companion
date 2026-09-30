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
  } from "lucide-svelte";

  let activeSubTab: "scoreboard" | "damage" | "defense" | "economy" = "scoreboard";
  let hoveredBadge: { badge: PostGameBadge; x: number; y: number } | null = null;
  let hoveredExtraBadges: { badges: PostGameBadge[]; x: number; y: number; isNearBottom: boolean } | null = null;
  let extraBadgesCloseTimer: ReturnType<typeof setTimeout> | null = null;

  $: match = $postGameMatch;
  $: localPart = match?.localParticipant;
  $: isVictory = match?.localPlayerWon ?? false;
  $: mvp = match?.mvp;
  $: ace = match?.ace;
  $: svp = match?.svp ?? match?.ace;
  $: maxMatchDamage = Math.max(
    1,
    match?.mvp?.totalDamage ??
      (match?.allParticipants?.length ? Math.max(...match.allParticipants.map((p) => p.totalDamage || 0)) : 1)
  );

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
            on:click={() => loadMockPostGame(!isVictory)}
            class="flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-950/40 px-3 py-1.5 text-xs font-semibold text-purple-300 transition hover:bg-purple-900/40 hover:text-white"
            title="Toggle between Victory and Defeat Demo"
          >
            <Zap class="h-3.5 w-3.5" />
            <span>Toggle Demo</span>
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
                      <span class="text-slate-500">•</span>
                      <span class="uppercase text-[11px] font-medium text-slate-400">{mvp.role}</span>
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
                  <div class="text-[10px] text-slate-400">{mvp.visionScore} Vision</div>
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

        <!-- Spotlight 2: YOUR PERFORMANCE -->
        {#if localPart}
          <div class="glass relative flex flex-col justify-between overflow-hidden rounded-2xl border border-purple-500/30 p-5 shadow-xl transition hover:border-purple-400/50">
            <!-- Ambient Champion Splash Artwork with Soft Gradient Fade -->
            <div
              class="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none scale-105 filter blur-[1px]"
              style="background-image: url('{splashArtUrl(getChampKey(localPart.championId, localPart.championName))}');"
            ></div>
            <div class="absolute inset-0 bg-gradient-to-t from-void-950/80 via-void-950/40 to-transparent pointer-events-none"></div>

            <div class="relative flex flex-col gap-4">
              <!-- Top Row: Avatar, Names & Score -->
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3.5">
                  <div class="relative shrink-0">
                    <img
                      src={squareIconUrl(getChampKey(localPart.championId, localPart.championName), $ddragonVersion)}
                      alt={getChampName(localPart.championId, localPart.championName)}
                      class="h-14 w-14 rounded-xl object-cover ring-2 ring-purple-400/80 shadow-lg"
                    />
                    <span class="absolute -bottom-1 -right-1 rounded bg-void-950/90 px-1 text-[10px] font-bold text-purple-300 border border-purple-400/40">
                      Lvl {localPart.championLevel}
                    </span>
                  </div>

                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-purple-400">
                      <span>Your Performance</span>
                      <span class="text-slate-500">•</span>
                      <span class="text-slate-400 font-semibold normal-case">Rank #{localPart.rank} of 10</span>
                      {#if localPart.isMvp}
                        <span class="text-amber-400 font-semibold inline-flex items-center gap-1 normal-case">
                          <Crown class="h-3 w-3 stroke-[2.5]" /> MVP
                        </span>
                      {:else if localPart.isSvp || localPart.isAce}
                        <span class="text-purple-300 font-semibold normal-case">SVP</span>
                      {/if}
                    </div>
                    <h3 class="text-base font-extrabold text-white mt-1 truncate">
                      {localPart.summonerName}
                    </h3>
                    <div class="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
                      <span class="capitalize font-semibold text-purple-200">{getChampName(localPart.championId, localPart.championName)}</span>
                      <span class="text-slate-500">•</span>
                      <span class="uppercase text-[11px] font-medium text-slate-400">{localPart.role}</span>
                    </div>
                  </div>
                </div>

                <!-- Score & Rank Badge -->
                <div class="flex flex-col items-end shrink-0">
                  <div class="flex items-baseline gap-1">
                    <span class="text-3xl font-black {getScoreColor(localPart.overallScore)} tracking-tight">{localPart.overallScore.toFixed(1)}</span>
                    <span class="text-xs font-bold text-slate-400">/ 10</span>
                  </div>
                  <span class="text-[11px] font-semibold text-slate-400">Overall Rating</span>
                </div>
              </div>

              <!-- Key Summary Stats -->
              <div class="grid grid-cols-4 gap-2 rounded-xl bg-white/[0.03] border border-white/5 p-2.5 text-center text-xs">
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">KDA</div>
                  <div class="font-black text-slate-100">{localPart.kills}/{localPart.deaths}/{localPart.assists}</div>
                  <div class="text-[10px] text-purple-300 font-bold">{localPart.kda} KDA</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Damage</div>
                  <div class="font-black text-slate-100">{(localPart.totalDamage / 1000).toFixed(1)}k</div>
                  <div class="text-[10px] text-slate-400">{Math.round(localPart.damageShare * 100)}% Share</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Farm</div>
                  <div class="font-black text-slate-100">{localPart.cs} CS</div>
                  <div class="text-[10px] text-slate-400">{localPart.csPerMin}/m</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold text-slate-400 uppercase">Team KP</div>
                  <div class="font-black text-slate-100">{Math.round(localPart.killParticipation * 100)}%</div>
                  <div class="text-[10px] text-slate-400">{localPart.visionScore} Vision</div>
                </div>
              </div>

              <!-- Local Player Badges Row (ALL Badges displayed - NO extra details in pill) -->
              {#if localPart.badges.length > 0}
                <div class="flex flex-col gap-1.5 pt-1">
                  <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Earned Badges ({localPart.badges.length})
                  </span>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    {#each sortBadgesByTier(localPart.badges) as badge (badge.id)}
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
                <span class="flex items-center gap-1.5" title="Dragons Slain">
                  <ObjectiveIcon type="dragon" className="h-4 w-4 text-amber-400" />
                  <span>{match.blueTeam.dragonKills ?? 0}</span>
                </span>
                <span class="flex items-center gap-1.5" title="Baron Nashors Slain">
                  <ObjectiveIcon type="baron" className="h-4 w-4 text-purple-300" />
                  <span>{match.blueTeam.baronKills ?? 0}</span>
                </span>
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
              <div>Farm (CS)</div>
              <div>Damage</div>
              <div>Vision</div>
              <div>Badges</div>
              <div class="text-right pr-2">Items</div>
            </div>

            <!-- Team 1 Participants -->
            <div class="divide-y divide-white/5">
              {#each match.blueTeam.participants as p (p.participantId)}
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
                        <span>•</span>
                        <span class="uppercase text-[9px]">{p.role}</span>
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

                  <!-- Farm -->
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-200">{p.cs} CS</span>
                    <span class="text-[10px] text-slate-400">{p.csPerMin} / Min</span>
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

                  <!-- Vision -->
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-200">{p.visionScore}</span>
                    <span class="text-[10px] text-slate-400">{p.controlWardsBought} Pinks</span>
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

                  <!-- Items (6 inventory slots + 1 trinket) -->
                  <div class="flex items-center justify-end gap-1 w-[196px] shrink-0">
                    {#each p.items as it, i (i)}
                      <div class="h-6 w-6 rounded bg-void-950/80 border border-white/10 overflow-hidden shrink-0 {i === 6 ? 'border-amber-400/30' : ''}">
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
                <span class="flex items-center gap-1.5" title="Dragons Slain">
                  <ObjectiveIcon type="dragon" className="h-4 w-4 text-amber-400" />
                  <span>{match.redTeam.dragonKills ?? 0}</span>
                </span>
                <span class="flex items-center gap-1.5" title="Baron Nashors Slain">
                  <ObjectiveIcon type="baron" className="h-4 w-4 text-purple-300" />
                  <span>{match.redTeam.baronKills ?? 0}</span>
                </span>
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
              <div>Farm (CS)</div>
              <div>Damage</div>
              <div>Vision</div>
              <div>Badges</div>
              <div class="text-right pr-2">Items</div>
            </div>

            <!-- Team 2 Participants -->
            <div class="divide-y divide-white/5">
              {#each match.redTeam.participants as p (p.participantId)}
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
                        <span>•</span>
                        <span class="uppercase text-[9px]">{p.role}</span>
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

                  <!-- Farm -->
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-200">{p.cs} CS</span>
                    <span class="text-[10px] text-slate-400">{p.csPerMin} / Min</span>
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

                  <!-- Vision -->
                  <div class="flex flex-col">
                    <span class="text-xs font-bold text-slate-200">{p.visionScore}</span>
                    <span class="text-[10px] text-slate-400">{p.controlWardsBought} Pinks</span>
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

                  <!-- Items (6 inventory slots + 1 trinket) -->
                  <div class="flex items-center justify-end gap-1 w-[196px] shrink-0">
                    {#each p.items as it, i (i)}
                      <div class="h-6 w-6 rounded bg-void-950/80 border border-white/10 overflow-hidden shrink-0 {i === 6 ? 'border-amber-400/30' : ''}">
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
            <div class="flex items-center gap-4 text-xs">
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

          <div class="flex flex-col gap-3 pt-2">
            {#each match.allParticipants as p (p.participantId)}
              {@const maxDmg = maxMatchDamage}
              {@const totalPct = Math.min(100, (p.totalDamage / maxDmg) * 100)}
              {@const physPct = p.totalDamage > 0 ? (p.physicalDamage / p.totalDamage) * 100 : 0}
              {@const magPct = p.totalDamage > 0 ? (p.magicDamage / p.totalDamage) * 100 : 0}
              {@const truePct = p.totalDamage > 0 ? (p.trueDamage / p.totalDamage) * 100 : 0}

              <div class="flex items-center gap-4 text-xs">
                <!-- Champ & Name -->
                <div class="flex w-44 items-center gap-2.5 shrink-0 min-w-0">
                  <img
                    src={squareIconUrl(getChampKey(p.championId), $ddragonVersion)}
                    alt=""
                    class="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10"
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
            <div class="flex items-center gap-4 text-xs">
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

          <div class="flex flex-col gap-3 pt-2">
            {#each match.allParticipants as p (p.participantId)}
              {@const totalDef = p.damageTaken + p.damageSelfMitigated}
              {@const maxDef = Math.max(1, ...match.allParticipants.map((x) => x.damageTaken + x.damageSelfMitigated))}
              {@const barPct = Math.min(100, (totalDef / maxDef) * 100)}
              {@const takenPct = totalDef > 0 ? (p.damageTaken / totalDef) * 100 : 0}
              {@const mitPct = totalDef > 0 ? (p.damageSelfMitigated / totalDef) * 100 : 0}

              <div class="flex items-center gap-4 text-xs">
                <!-- Champ & Name -->
                <div class="flex w-44 items-center gap-2.5 shrink-0 min-w-0">
                  <img
                    src={squareIconUrl(getChampKey(p.championId), $ddragonVersion)}
                    alt=""
                    class="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10"
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
          </div>

          <div class="flex flex-col gap-3 pt-2">
            {#each match.allParticipants as p (p.participantId)}
              {@const maxGold = Math.max(1, ...match.allParticipants.map((x) => x.goldEarned))}
              {@const goldPct = Math.min(100, (p.goldEarned / maxGold) * 100)}

              <div class="flex items-center gap-4 text-xs">
                <!-- Champ & Name -->
                <div class="flex w-44 items-center gap-2.5 shrink-0 min-w-0">
                  <img
                    src={squareIconUrl(getChampKey(p.championId), $ddragonVersion)}
                    alt=""
                    class="h-7 w-7 rounded-lg object-cover ring-1 ring-white/10"
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
