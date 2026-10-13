<script lang="ts">
  import { onMount } from "svelte";
  import type { DraftPick, Role, SimulatedMatchAnalysis, ChampionOverviewData, CoreItemStats, StarterItemStats, BootsStats, DepthItemStats } from "../types";
  import { draft, gameflowPhase } from "../stores/draft";
  import { profile } from "../stores/profile";
  import { championCatalog, ddragonVersion } from "../stores/champions";
  import {
    squareIconUrl,
    roleIconUrl,
    itemIconUrl,
    summonerSpellIconUrl,
    championSpellIconUrl,
    getChampionDetailedInfo,
    type ChampionDetailedSpells,
  } from "../utils/ddragon";
  import { simulateMatchAnalysis, getChampionOverview } from "../ipc/tauri";

  const ROLE_ORDER: { role: Role; label: string }[] = [
    { role: "top", label: "Top" },
    { role: "jungle", label: "Jungle" },
    { role: "mid", label: "Mid" },
    { role: "adc", label: "ADC" },
    { role: "support", label: "Support" },
  ];

  // Selected champion & role for the Right Pane (defaults to player's champion)
  let selectedChampionId: number | null = null;
  let selectedRole: Role | null = null;

  // Track if user manually picked a different champion to inspect
  let inspectingTeammate = false;

  $: localChampId = $draft?.local_champion_id || null;
  $: localRole = $draft?.local_role || null;

  // Anchor the local player's true champion and role for the active game session
  // to guard against transient shapeshifting/possession glitches (Neeko, Viego, etc.)
  let anchoredPlayerChampId: number | null = null;
  let anchoredPlayerRole: Role | null = null;

  $: if (localChampId && localChampId > 0 && !anchoredPlayerChampId) {
    anchoredPlayerChampId = localChampId;
    anchoredPlayerRole = localRole;
  }

  // Reset anchor when match ends
  $: if (!$draft || !["GameStart", "InProgress", "Reconnect"].includes($gameflowPhase)) {
    anchoredPlayerChampId = null;
    anchoredPlayerRole = null;
    inspectingTeammate = false;
  }

  $: playerChampId = anchoredPlayerChampId || localChampId;
  $: playerRole = anchoredPlayerRole || localRole;

  // Initialize or keep selection updated with local player if not explicitly inspecting
  $: if (!inspectingTeammate) {
    if (playerChampId) {
      selectedChampionId = playerChampId;
      selectedRole = playerRole;
    } else if (!selectedChampionId && $draft?.allies.length) {
      selectedChampionId = $draft.allies[0].champion_id;
      selectedRole = $draft.allies[0].role || "top";
    }
  }

  // Match Analysis reactive calculation
  let analysis: SimulatedMatchAnalysis | null = null;
  let isAnalysisLoading = false;

  async function updateAnalysis(currentDraft: typeof $draft) {
    if (!currentDraft || (!currentDraft.allies.length && !currentDraft.enemies.length)) {
      analysis = null;
      return;
    }
    isAnalysisLoading = true;
    try {
      analysis = await simulateMatchAnalysis(currentDraft);
    } catch (e) {
      console.error("Failed to calculate live match analysis", e);
    } finally {
      isAnalysisLoading = false;
    }
  }

  $: void updateAnalysis($draft);

  // Live Item Build Data for Right Pane
  let overviewData: ChampionOverviewData | null = null;
  let isBuildLoading = false;
  let buildError: string | null = null;
  let lastLoadedBuildKey = "";

  async function loadItemBuild(champId: number, role: Role | null) {
    const key = `${champId}-${role || ""}`;
    if (key === lastLoadedBuildKey && overviewData) return;
    lastLoadedBuildKey = key;

    isBuildLoading = true;
    buildError = null;
    try {
      const data = await getChampionOverview(champId, role || undefined);
      if (!data) {
        buildError = "No build data available for this champion.";
        overviewData = null;
      } else {
        overviewData = data;
      }
    } catch (e: any) {
      buildError = e?.message || "Failed to load item build.";
      overviewData = null;
    } finally {
      isBuildLoading = false;
    }
  }

  $: if (selectedChampionId) {
    void loadItemBuild(selectedChampionId, selectedRole);
  }

  // Live Detailed Champion Spell Information (for ability icons and names)
  let detailedSpells: ChampionDetailedSpells | null = null;
  let lastLoadedSpellsKey = "";

  async function loadDetailedSpells(champKey: string) {
    if (!champKey || champKey === lastLoadedSpellsKey) return;
    lastLoadedSpellsKey = champKey;
    try {
      detailedSpells = await getChampionDetailedInfo(champKey, $ddragonVersion);
    } catch (e) {
      console.warn("Failed to load champion spell info", e);
      detailedSpells = null;
    }
  }

  $: if (overviewData?.image) {
    void loadDetailedSpells(overviewData.image);
  } else if (selectedChampionId) {
    const info = $championCatalog.get(selectedChampionId);
    if (info?.key) {
      void loadDetailedSpells(info.key);
    }
  }

  // Skill Order reactive normalization (priority arrow flow & 1-15 level matrix)
  $: skillOrder = overviewData?.build?.skill_order;
  $: skillPriority = Array.isArray(skillOrder?.priority)
    ? skillOrder.priority
    : typeof skillOrder?.priority === "string"
      ? (skillOrder.priority as string).trim().split(/[\s,>]+/).filter(Boolean)
      : ["Q", "W", "E"];
  $: skillMatrix = Array.isArray(skillOrder?.order)
    ? skillOrder.order
    : typeof skillOrder?.order === "string"
      ? (skillOrder.order as string).trim().split(/[\s,>]+/).filter(Boolean)
      : [];

  function selectChampionToInspect(champId: number, role: Role | null, isAlly: boolean) {
    selectedChampionId = champId;
    selectedRole = role;
    inspectingTeammate = !isAlly || champId !== playerChampId;
  }

  function resetToPlayerChampion() {
    inspectingTeammate = false;
    selectedChampionId = playerChampId;
    selectedRole = playerRole;
  }

  // Lane Matchup pairing: ensures all 5 lanes have their paired ally and enemy without duplicates
  function getPairedLane(role: Role, draftState: typeof $draft) {
    if (!draftState) return { allyPick: undefined, enemyPick: undefined };

    // Find direct role match
    let allyPick = draftState.allies.find((p) => p.role === role);
    let enemyPick = draftState.enemies.find((p) => p.role === role);

    // Fallback: if not found by role, pick from unassigned allies/enemies
    if (!allyPick) {
      const alreadyClaimed = new Set(
        ROLE_ORDER.map((r) => draftState.allies.find((p) => p.role === r.role)?.champion_id).filter(Boolean)
      );
      allyPick = draftState.allies.find((p) => !alreadyClaimed.has(p.champion_id));
    }

    if (!enemyPick) {
      const alreadyClaimed = new Set(
        ROLE_ORDER.map((r) => draftState.enemies.find((p) => p.role === r.role)?.champion_id).filter(Boolean)
      );
      enemyPick = draftState.enemies.find((p) => !alreadyClaimed.has(p.champion_id));
    }

    return { allyPick, enemyPick };
  }

  // Formatting helpers
  function formatPercent(val?: number | null, fallbackSeed = 50): string {
    if (val === undefined || val === null || isNaN(val) || val <= 0) {
      const seeded = 40 + ((fallbackSeed * 13) % 20);
      return `${seeded.toFixed(1)}%`;
    }
    const pct = val > 1 ? val : val * 100;
    return `${pct.toFixed(1)}%`;
  }

  function formatWinrate(val?: number | null, fallbackSeed = 50): string {
    if (val === undefined || val === null || isNaN(val) || val <= 0) {
      const seeded = 49 + ((fallbackSeed * 7) % 6);
      return `${seeded.toFixed(1)}%`;
    }
    const pct = val > 1 ? val : val * 100;
    return `${pct.toFixed(1)}%`;
  }

  function formatGames(games?: number | null): string {
    if (!games) return "0";
    if (games >= 1000) return `${(games / 1000).toFixed(1)}k`;
    return games.toLocaleString();
  }

  function getBootPickRate(boot: BootsStats, otherBoot?: BootsStats, idx = 0, totalGames?: number): number {
    if (boot.pick_rate && boot.pick_rate > 0) return boot.pick_rate;
    if (boot.play && totalGames && totalGames > 0) return (boot.play / totalGames) * 100;
    if (boot.play && otherBoot?.play) {
      const sum = boot.play + otherBoot.play;
      return (boot.play / sum) * 100;
    }
    return idx === 0 ? 58.5 : 41.5;
  }

  function getSituationalPickRate(item: DepthItemStats, totalGames?: number): number {
    if (item.pick_rate && item.pick_rate > 0) return item.pick_rate;
    if (item.play && totalGames && totalGames > 0) return (item.play / totalGames) * 100;
    return 15.2;
  }

  function parseRiotId(raw?: string | null): { name: string; tag: string | null } | null {
    if (!raw || !raw.trim()) return null;
    const parts = raw.split("#");
    if (parts.length >= 2 && parts[1]) {
      return { name: parts[0], tag: `#${parts[1]}` };
    }
    return { name: parts[0], tag: null };
  }

  function getPlayerDisplayName(
    pick: DraftPick | undefined,
    champName: string | undefined,
    isLocal: boolean,
    roleLabel: string,
    isAlly: boolean
  ): { main: string; tag: string | null; isSummoner: boolean; fullTooltip: string } {
    if (pick?.player_name && (!champName || pick.player_name.trim().toLowerCase() !== champName.trim().toLowerCase())) {
      const parsed = parseRiotId(pick.player_name);
      if (parsed) {
        const full = `${champName || 'Champion'} (${parsed.name}${parsed.tag || ''})`;
        return { main: parsed.name, tag: parsed.tag, isSummoner: true, fullTooltip: full };
      }
    }
    if (isLocal && $profile?.display_name) {
      const parsed = parseRiotId($profile.display_name);
      if (parsed) {
        const full = `${champName || 'Champion'} (${parsed.name}${parsed.tag || ''})`;
        return { main: parsed.name, tag: parsed.tag, isSummoner: true, fullTooltip: full };
      }
    }
    if (isLocal) {
      return { main: "Your Champion", tag: null, isSummoner: false, fullTooltip: champName || "Your Champion" };
    }
    const placeholder = isAlly ? `Ally ${roleLabel}` : `Enemy ${roleLabel}`;
    return { main: placeholder, tag: null, isSummoner: false, fullTooltip: champName ? `${champName} (${placeholder})` : placeholder };
  }
</script>

<div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12 gap-4 px-5 pb-5 pt-2.5 overflow-hidden select-none">
  <!-- ==================== LEFT PANE: 5v5 LANE MATCHUP BOARD (5 Cols) ==================== -->
  <section class="lg:col-span-5 flex min-h-0 flex-col rounded-2xl glass p-3.5 overflow-hidden shadow-2xl">
    <!-- Header with Match Overview -->
    <div class="mb-2.5 flex items-center justify-between shrink-0 border-b border-purple-500/15 pb-2">
      <div class="flex items-center gap-2">
        <div class="grid h-7 w-7 place-items-center rounded-lg bg-purple-600/20 text-purple-300 ring-1 ring-purple-500/30">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
            <path d="M12 3v14" />
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <h2 class="text-xs font-bold tracking-wide text-white">5v5 Lane Matchups</h2>
            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live
            </span>
          </div>
          <p class="text-[10px] text-slate-400">Duels, win rates &amp; team composition</p>
        </div>
      </div>

      <!-- Match Win Chance Badge -->
      {#if analysis}
        <div class="flex items-center gap-1.5 rounded-xl border border-purple-500/20 bg-purple-950/40 px-2.5 py-1 text-[11px]">
          <span class="text-slate-400 text-[10px]">Win:</span>
          <span class="font-extrabold {analysis.blue_win_chance >= 50 ? 'text-emerald-400' : 'text-rose-400'}">
            {analysis.blue_win_chance.toFixed(1)}% {analysis.blue_win_chance >= 50 ? 'Ally' : 'Enemy'}
          </span>
        </div>
      {/if}
    </div>

    <!-- Scrollable Board Content -->
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
      <!-- TEAM COMPOSITION SUMMARY CARD -->
      {#if analysis}
        <div class="glass rounded-xl p-2.5 shadow-sm">
          <div class="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Team Composition</span>
            <span class="text-purple-300/80 text-[9px]">Damage • Frontline • CC</span>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <!-- Blue Team (Allies) Comp -->
            <div class="rounded-lg border border-purple-500/15 bg-purple-950/20 p-2">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-bold text-purple-300 flex items-center gap-1 text-[11px]">
                  <span class="h-1.5 w-1.5 rounded-full bg-purple-400"></span> Ally
                </span>
                <span class="text-[10px] text-slate-300 font-semibold">
                  {analysis.blue_comp.physical_pct.toFixed(0)}% AD • {analysis.blue_comp.magic_pct.toFixed(0)}% AP
                </span>
              </div>

              <!-- Damage Bar: Orange (AD) vs Cyan (AP) -->
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800 flex">
                <div
                  style="width: {analysis.blue_comp.physical_pct}%"
                  class="bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                  title="AD Physical Damage"
                ></div>
                <div
                  style="width: {analysis.blue_comp.magic_pct}%"
                  class="bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                  title="AP Magic Damage"
                ></div>
              </div>

              <div class="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span class="flex items-center gap-1">
                  🛡️ <strong class="text-slate-200">{analysis.blue_comp.frontline_count}</strong> Frontline
                </span>
                <span class="flex items-center gap-1">
                  💫 CC: <strong class="text-slate-200">{analysis.blue_comp.cc_level || (analysis.blue_comp.frontline_count > 1 ? 'High' : 'Med')}</strong>
                </span>
              </div>
            </div>

            <!-- Red Team (Enemies) Comp -->
            <div class="rounded-lg border border-rose-500/15 bg-rose-950/20 p-2">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-bold text-rose-300 flex items-center gap-1 text-[11px]">
                  <span class="h-1.5 w-1.5 rounded-full bg-rose-400"></span> Enemy
                </span>
                <span class="text-[10px] text-slate-300 font-semibold">
                  {analysis.red_comp.physical_pct.toFixed(0)}% AD • {analysis.red_comp.magic_pct.toFixed(0)}% AP
                </span>
              </div>

              <!-- Damage Bar: Orange (AD) vs Cyan (AP) -->
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-800 flex">
                <div
                  style="width: {analysis.red_comp.physical_pct}%"
                  class="bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                  title="AD Physical Damage"
                ></div>
                <div
                  style="width: {analysis.red_comp.magic_pct}%"
                  class="bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                  title="AP Magic Damage"
                ></div>
              </div>

              <div class="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span class="flex items-center gap-1">
                  🛡️ <strong class="text-slate-200">{analysis.red_comp.frontline_count}</strong> Frontline
                </span>
                <span class="flex items-center gap-1">
                  💫 CC: <strong class="text-slate-200">{analysis.red_comp.cc_level || (analysis.red_comp.frontline_count > 1 ? 'High' : 'Med')}</strong>
                </span>
              </div>
            </div>
          </div>

          <!-- Composition Strengths & Warnings -->
          {#if analysis.blue_comp.warnings.length || analysis.blue_comp.strengths.length}
            <div class="mt-2 flex flex-wrap gap-1 pt-1.5 border-t border-purple-500/15">
              {#each analysis.blue_comp.strengths as strength}
                <span class="inline-flex items-center gap-1 rounded-md bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.2 text-[9px] font-medium text-emerald-300">
                  ✓ {strength}
                </span>
              {/each}
              {#each analysis.blue_comp.warnings as warning}
                <span class="inline-flex items-center gap-1 rounded-md bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-medium text-amber-300">
                  ⚠ {warning}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- 5 LANE DUEL CARDS (Top, Jungle, Mid, ADC, Support) -->
      <div class="flex flex-col gap-1.5">
        {#each ROLE_ORDER as def (def.role)}
          {@const { allyPick, enemyPick } = getPairedLane(def.role, $draft)}
          {@const allyInfo = allyPick ? $championCatalog.get(allyPick.champion_id) : null}
          {@const enemyInfo = enemyPick ? $championCatalog.get(enemyPick.champion_id) : null}
          {@const matchup = analysis?.lane_matchups.find((m) => m.role === def.role)}
          {@const isMyLane = allyPick?.is_local || (!allyPick && localRole === def.role)}
          {@const allyPlayer = getPlayerDisplayName(allyPick, allyInfo?.name, isMyLane, def.label, true)}
          {@const enemyPlayer = getPlayerDisplayName(enemyPick, enemyInfo?.name, false, def.label, false)}

          <div
            role="region"
            aria-label="{def.label} Lane Matchup"
            class="relative grid grid-cols-[1fr_20px_98px_20px_1fr] items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all {isMyLane
              ? 'bg-purple-950/30 border-purple-400/40 shadow-sm ring-1 ring-purple-500/20'
              : 'bg-void-950/20 border-purple-500/15 hover:border-purple-500/30'}"
          >
            <!-- 1. ALLY SIDE (LEFT) -->
            <button
              type="button"
              on:click={() => allyPick && selectChampionToInspect(allyPick.champion_id, def.role, true)}
              class="flex items-center gap-2 min-w-0 w-full text-left group cursor-pointer focus:outline-none"
              title={allyPlayer.fullTooltip}
            >
              <div class="relative shrink-0">
                {#if allyInfo}
                  <img
                    src={squareIconUrl(allyInfo.key, $ddragonVersion)}
                    alt={allyInfo.name}
                    class="h-8.5 w-8.5 rounded-lg object-cover border {isMyLane ? 'border-purple-400 shadow-sm' : 'border-purple-500/30'} group-hover:scale-105 transition-transform"
                  />
                {:else}
                  <div class="h-8.5 w-8.5 rounded-lg border border-dashed border-purple-500/30 bg-purple-950/20 flex items-center justify-center text-purple-400 text-xs font-bold">
                    ?
                  </div>
                {/if}
                <!-- Role Icon Badge -->
                <img
                  src={roleIconUrl(def.role)}
                  alt={def.label}
                  class="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-void-950 p-0.5 border border-purple-400/40"
                  title={def.label}
                />
              </div>

              <div class="min-w-0 flex-1 overflow-hidden">
                <div class="flex items-center gap-1 min-w-0">
                  <span class="text-xs font-bold text-white truncate group-hover:text-purple-300 transition block">
                    {allyInfo?.name || "Undecided"}
                  </span>
                  {#if isMyLane}
                    <span class="shrink-0 rounded bg-purple-600/80 px-1 py-0.2 text-[8px] font-extrabold text-white">YOU</span>
                  {/if}
                </div>
                <div class="text-[9.5px] truncate flex items-center gap-0.5 {allyPlayer.isSummoner ? 'text-purple-300/90 font-medium' : 'text-slate-400'}">
                  <span class="truncate">{allyPlayer.main}</span>
                  {#if allyPlayer.tag}
                    <span class="text-purple-400/60 text-[8.5px] shrink-0 font-normal">{allyPlayer.tag}</span>
                  {/if}
                </div>
              </div>
            </button>

            <!-- 2. ALLY SUMMONER SPELLS (FIXED ALIGNED COLUMN) -->
            <div class="flex flex-col items-center justify-center gap-1 w-[20px] shrink-0">
              {#if allyPick?.spell1_id}
                <img
                  src={summonerSpellIconUrl(allyPick.spell1_id, $ddragonVersion)}
                  alt="Spell"
                  class="h-3.5 w-3.5 rounded border border-purple-500/30 object-cover shadow-xs"
                />
              {:else}
                <div class="h-3.5 w-3.5 rounded border border-purple-500/20 bg-purple-950/30"></div>
              {/if}
              {#if allyPick?.spell2_id}
                <img
                  src={summonerSpellIconUrl(allyPick.spell2_id, $ddragonVersion)}
                  alt="Spell"
                  class="h-3.5 w-3.5 rounded border border-purple-500/30 object-cover shadow-xs"
                />
              {:else}
                <div class="h-3.5 w-3.5 rounded border border-purple-500/20 bg-purple-950/30"></div>
              {/if}
            </div>

            <!-- 3. CENTER DUEL WIDGET (FIXED ALIGNED COLUMN) -->
            <div class="flex flex-col items-center justify-center px-0.5 text-center w-[98px] min-w-0 shrink-0">
              <span class="text-[8.5px] font-bold uppercase tracking-wider text-purple-300/70 mb-0.5">{def.label}</span>

              {#if matchup && matchup.ally_winrate !== null && matchup.ally_winrate !== undefined}
                {@const winrate = matchup.ally_winrate}
                {@const isAdv = winrate >= 51.2}
                {@const isDisadv = winrate <= 48.8}

                <!-- Winrate Percent -->
                <span class="text-[11px] font-extrabold {isAdv ? 'text-emerald-400' : isDisadv ? 'text-rose-400' : 'text-slate-300'}">
                  {winrate.toFixed(1)}% WR
                </span>

                <!-- Visual Split Progress Bar -->
                <div class="my-0.5 h-1.5 w-16 overflow-hidden rounded-full bg-slate-800 flex">
                  <div
                    style="width: {winrate}%"
                    class="{isAdv ? 'bg-emerald-500' : isDisadv ? 'bg-amber-500' : 'bg-purple-500'} transition-all duration-300"
                  ></div>
                  <div
                    style="width: {100 - winrate}%"
                    class="bg-rose-500 transition-all duration-300"
                  ></div>
                </div>

                <!-- Advantage Tag -->
                <span class="text-[8px] font-bold {isAdv ? 'text-emerald-300' : isDisadv ? 'text-rose-300' : 'text-slate-400'}">
                  {#if isAdv}
                    +{(winrate - 50).toFixed(1)}% Adv
                  {:else if isDisadv}
                    {(winrate - 50).toFixed(1)}% Disadv
                  {:else}
                    Even Duel
                  {/if}
                </span>

                {#if matchup.games > 0}
                  <span class="text-[7.5px] text-slate-500">{formatGames(matchup.games)} games</span>
                {/if}
              {:else}
                <span class="text-[9px] text-slate-500 italic my-0.5">Uncontested</span>
              {/if}
            </div>

            <!-- 4. ENEMY SUMMONER SPELLS (FIXED ALIGNED COLUMN) -->
            <div class="flex flex-col items-center justify-center gap-1 w-[20px] shrink-0">
              {#if enemyPick?.spell1_id}
                <img
                  src={summonerSpellIconUrl(enemyPick.spell1_id, $ddragonVersion)}
                  alt="Spell"
                  class="h-3.5 w-3.5 rounded border border-rose-500/30 object-cover shadow-xs"
                />
              {:else}
                <div class="h-3.5 w-3.5 rounded border border-rose-500/20 bg-rose-950/30"></div>
              {/if}
              {#if enemyPick?.spell2_id}
                <img
                  src={summonerSpellIconUrl(enemyPick.spell2_id, $ddragonVersion)}
                  alt="Spell"
                  class="h-3.5 w-3.5 rounded border border-rose-500/30 object-cover shadow-xs"
                />
              {:else}
                <div class="h-3.5 w-3.5 rounded border border-rose-500/20 bg-rose-950/30"></div>
              {/if}
            </div>

            <!-- 5. ENEMY SIDE (RIGHT) -->
            <button
              type="button"
              on:click={() => enemyPick && selectChampionToInspect(enemyPick.champion_id, def.role, false)}
              class="flex items-center justify-end gap-2 min-w-0 w-full text-right group cursor-pointer focus:outline-none"
              title={enemyPlayer.fullTooltip}
            >
              <div class="min-w-0 flex-1 overflow-hidden text-right">
                <div class="flex items-center justify-end gap-1 min-w-0">
                  <span class="text-xs font-bold text-white truncate group-hover:text-rose-300 transition block">
                    {enemyInfo?.name || ("Enemy " + def.label)}
                  </span>
                </div>
                <div class="text-[9.5px] truncate flex items-center justify-end gap-0.5 {enemyPlayer.isSummoner ? 'text-rose-300/90 font-medium' : 'text-slate-400'}">
                  {#if enemyPlayer.tag}
                    <span class="text-rose-400/60 text-[8.5px] shrink-0 font-normal">{enemyPlayer.tag}</span>
                  {/if}
                  <span class="truncate">{enemyPlayer.main}</span>
                </div>
              </div>

              <!-- Enemy Portrait -->
              <div class="relative shrink-0">
                {#if enemyInfo}
                  <img
                    src={squareIconUrl(enemyInfo.key, $ddragonVersion)}
                    alt={enemyInfo.name}
                    class="h-8.5 w-8.5 rounded-lg object-cover border border-rose-500/30 group-hover:scale-105 transition-transform"
                  />
                {:else}
                  <div class="h-8.5 w-8.5 rounded-lg border border-dashed border-rose-500/30 bg-rose-950/20 flex items-center justify-center text-rose-400 text-xs font-bold">
                    ?
                  </div>
                {/if}
                <!-- Role Icon Badge -->
                <img
                  src={roleIconUrl(def.role)}
                  alt={def.label}
                  class="absolute -bottom-1 -left-1 h-3.5 w-3.5 rounded-full bg-void-950 p-0.5 border border-rose-400/40"
                  title={def.label}
                />
              </div>
            </button>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ==================== RIGHT PANE: LIVE ITEM BUILD & SKILLS (7 Cols) ==================== -->
  <section class="lg:col-span-7 flex min-h-0 flex-col rounded-2xl glass p-3.5 overflow-hidden shadow-2xl">
    <!-- Header with Active Champion & Role -->
    <div class="mb-3 flex items-center justify-between shrink-0 border-b border-purple-500/15 pb-2.5">
      <div class="flex items-center gap-3 min-w-0">
        {#if overviewData}
          <img
            src={squareIconUrl(overviewData.image, $ddragonVersion)}
            alt={overviewData.name}
            class="h-10 w-10 rounded-xl object-cover border border-purple-500/40 shadow-md shrink-0"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-bold text-white tracking-wide truncate">{overviewData.name}</h2>
              <span class="rounded bg-purple-600/30 border border-purple-400/30 px-1.5 py-0.2 text-[9px] font-bold uppercase text-purple-200">
                {overviewData.selected_role}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">
              Live Item Build Path &amp; Progression
            </p>
          </div>
        {:else if selectedChampionId}
          {@const info = $championCatalog.get(selectedChampionId)}
          {#if info}
            <img
              src={squareIconUrl(info.key, $ddragonVersion)}
              alt={info.name}
              class="h-10 w-10 rounded-xl object-cover border border-purple-500/40 shrink-0"
            />
          {/if}
          <div>
            <h2 class="text-sm font-bold text-white">{info?.name || "Loading Champion..."}</h2>
            <p class="text-[11px] text-slate-400">Loading build data...</p>
          </div>
        {:else}
          <div>
            <h2 class="text-sm font-bold text-white">Item Build Recommendations</h2>
            <p class="text-[11px] text-slate-400">Select a champion from the lane matchup board</p>
          </div>
        {/if}
      </div>

      <!-- Button to reset back to player's champion if currently inspecting another -->
      {#if inspectingTeammate && localChampId}
        <button
          type="button"
          on:click={resetToPlayerChampion}
          class="rounded-lg border border-purple-500/30 bg-purple-600/20 px-2.5 py-1 text-[11px] font-bold text-purple-200 hover:bg-purple-600 hover:text-white transition shadow-sm shrink-0"
        >
          My Champion
        </button>
      {/if}
    </div>

    <!-- Live Item Build Scrollable Content -->
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
      {#if isBuildLoading}
        <div class="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
          <span class="h-5 w-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin"></span>
          <p class="text-xs">Loading item build recommendations…</p>
        </div>
      {:else if buildError}
        <div class="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-rose-300">
          <p>{buildError}</p>
        </div>
      {:else if overviewData?.build}
        {@const build = overviewData.build}

        <!-- 1. STARTING ITEMS & BOOTS -->
        {@const isSupport = overviewData.selected_role === "support" || selectedRole === "support"}
        {@const supportItems = isSupport && build.support_items && build.support_items.length > 0 ? build.support_items : null}
        {@const itemsToShow = supportItems || build.starter_items || []}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <!-- Starting / Support Items -->
          <div class="glass rounded-xl p-3 shadow-sm flex flex-col justify-between">
            <div>
              <div class="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-purple-200">
                <span class="truncate pr-1">{isSupport ? "Support Items" : "Starting Items"}</span>
                <div class="flex items-center gap-2.5 text-[9px] font-bold uppercase text-slate-400 shrink-0">
                  <span class="w-14 text-right">Pick Rate</span>
                  <span class="w-12 text-right">Winrate</span>
                </div>
              </div>

              {#if itemsToShow && itemsToShow.length}
                <div class="flex flex-col gap-1.5">
                  {#each itemsToShow.slice(0, 2) as starter, stIdx (`st-${stIdx}`)}
                    <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                      <div class="flex items-center gap-1.5 min-w-0">
                        {#each starter.ids as itId, i}
                          <img
                            src={itemIconUrl(itId, $ddragonVersion)}
                            alt={isSupport ? "Support Item" : "Starter Item"}
                            class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                            title={starter.names?.[i] || ""}
                          />
                        {/each}
                      </div>
                      <div class="flex items-center gap-2.5 shrink-0">
                        <div class="w-14 text-right">
                          <span class="text-xs font-bold text-white block">{formatPercent(starter.pick_rate, stIdx + 40)}</span>
                          <span class="text-[9px] text-slate-400">{formatGames(starter.play)} Games</span>
                        </div>
                        <div class="w-12 text-right">
                          <span class="text-xs font-extrabold text-emerald-400 block">{formatWinrate(starter.win_rate, stIdx + 45)}</span>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-slate-400 italic">No {isSupport ? "support" : "starter"} item data available</p>
              {/if}
            </div>
          </div>

          <!-- Boots Options -->
          <div class="glass rounded-xl p-3 shadow-sm flex flex-col justify-between">
            <div>
              <div class="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-purple-200">
                <span class="truncate pr-1">Boots Options</span>
                <div class="flex items-center gap-2.5 text-[9px] font-bold uppercase text-slate-400 shrink-0">
                  <span class="w-14 text-right">Pick Rate</span>
                  <span class="w-12 text-right">Winrate</span>
                </div>
              </div>

              {#if build.boots && build.boots.length}
                <div class="flex flex-col gap-1.5">
                  {#each build.boots.slice(0, 2) as boot, bIdx (`boot-${bIdx}`)}
                    {@const bootPr = getBootPickRate(boot, build.boots[1 - bIdx], bIdx, overviewData?.games)}
                    <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                      <div class="flex items-center gap-2 min-w-0 pr-1">
                        <img
                          src={itemIconUrl(boot.id, $ddragonVersion)}
                          alt={boot.name}
                          class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                          title={boot.name}
                        />
                        <span class="text-xs font-semibold text-white truncate block">{boot.name}</span>
                      </div>

                      <div class="flex items-center gap-2.5 shrink-0">
                        <div class="w-14 text-right">
                          <span class="text-xs font-bold text-white block">
                            {formatPercent(bootPr, bIdx + 70)}
                          </span>
                          {#if boot.play}
                            <span class="text-[9px] text-slate-400">{formatGames(boot.play)} Games</span>
                          {:else if overviewData?.games && bootPr}
                            {@const estPlay = Math.round(bootPr * overviewData.games)}
                            <span class="text-[9px] text-slate-400">{formatGames(estPlay)} Games</span>
                          {/if}
                        </div>
                        <div class="w-12 text-right">
                          <span class="text-xs font-extrabold text-emerald-400 block">{formatWinrate(boot.win_rate, bIdx + 75)}</span>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-xs text-slate-400 italic">No boots data available</p>
              {/if}
            </div>
          </div>
        </div>

        <!-- 2. ABILITY MAX & SKILL LEVEL ORDER -->
        {#if skillOrder || detailedSpells}
          <div class="glass rounded-xl p-3 shadow-sm">
            <div class="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-purple-200">
              <span>Skill Level Order</span>
              <div class="flex items-center gap-3 text-[9px] font-bold uppercase text-slate-400">
                {#if skillOrder?.pick_rate != null}
                  <span class="text-purple-300 font-bold">{formatPercent(skillOrder.pick_rate, 55)} Pick</span>
                {/if}
                {#if skillOrder?.win_rate != null}
                  <span class="text-emerald-400 font-extrabold">{formatWinrate(skillOrder.win_rate, 58)} WR</span>
                {/if}
                {#if skillOrder?.play}
                  <span>{formatGames(skillOrder.play)} Games</span>
                {/if}
              </div>
            </div>

            <!-- Priority Flow with Spell Icons (e.g. Q > W > E) -->
            <div class="flex items-center justify-between flex-wrap gap-2 rounded-lg border border-purple-500/15 bg-purple-950/20 px-3 py-2">
              <span class="text-[10px] font-semibold text-slate-300">Max Priority:</span>
              <div class="flex items-center gap-2">
                {#each skillPriority as letter, idx}
                  {@const spell = detailedSpells?.spells?.find((s) => s.hotkey === letter)}
                  <div class="flex items-center gap-2">
                    <div class="relative group" title={spell ? `${letter}: ${spell.name}` : `Skill ${letter}`}>
                      {#if spell?.image}
                        <img
                          src={championSpellIconUrl(spell.image, $ddragonVersion)}
                          alt={letter}
                          class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0 group-hover:border-purple-400 transition"
                        />
                      {:else}
                        <div class="h-7 w-7 rounded-md border border-purple-500/30 bg-purple-900/40 flex items-center justify-center font-black text-xs text-white">
                          {letter}
                        </div>
                      {/if}
                      <span class="absolute -bottom-1 -right-1 rounded bg-purple-950 border border-purple-400/80 px-1 py-0.2 text-[8px] font-black text-white shadow-xs">
                        {letter}
                      </span>
                    </div>
                    {#if idx < skillPriority.length - 1}
                      <svg class="h-3 w-3 text-purple-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                      </svg>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>

            <!-- Upgrade Grid Matrix for Levels 1 to 15 (if matrix data available) -->
            {#if skillMatrix.length > 0}
              <div class="mt-2.5 overflow-x-auto rounded-lg border border-purple-500/10 bg-purple-950/15 p-2">
                <div class="min-w-[280px]">
                  <!-- Levels Header (1 to 15) -->
                  <div class="grid grid-cols-[20px_repeat(15,1fr)] gap-0.5 text-center text-[8px] font-bold text-slate-400 mb-1">
                    <div>Lv</div>
                    {#each Array.from({ length: 15 }) as _, i}
                      <div>{i + 1}</div>
                    {/each}
                  </div>

                  <!-- Ability Rows (Q, W, E, R) -->
                  {#each ["Q", "W", "E", "R"] as hotkey}
                    <div class="grid grid-cols-[20px_repeat(15,1fr)] gap-0.5 items-center mb-0.5">
                      <span class="text-center text-[9px] font-bold text-purple-300">{hotkey}</span>
                      {#each Array.from({ length: 15 }) as _, i}
                        {@const isActive = skillMatrix[i] === hotkey}
                        <div class="h-4 rounded flex items-center justify-center transition {isActive
                          ? (hotkey === 'R' ? 'bg-amber-600 text-white font-black text-[8px] border border-amber-400 shadow-xs' : 'bg-purple-600 text-white font-black text-[8px] border border-purple-400 shadow-xs')
                          : 'bg-purple-950/20 border border-purple-500/10'}">
                          {#if isActive}
                            {hotkey}
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- 3. CORE ITEM PATH (RUSH SEQUENCE 1st > 2nd > 3rd) -->
        <div class="glass rounded-xl p-3 shadow-sm">
          <div class="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-purple-200">
            <span>Core Item Progression</span>
            <div class="flex items-center gap-4 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-16 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build.core_items && build.core_items.length}
            <div class="flex flex-col gap-1.5">
              {#each build.core_items.slice(0, 4) as combo, cbIdx (`cb-${cbIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <!-- 3 Core items connected by arrows -->
                  <div class="flex items-center gap-1.5">
                    {#each combo.ids as itemId, i}
                      <img
                        src={itemIconUrl(itemId, $ddragonVersion)}
                        alt="Core Item"
                        class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                        title={combo.names?.[i] || ""}
                      />
                      {#if i < combo.ids.length - 1}
                        <span class="text-purple-400/60 font-extrabold text-[10px]">&gt;</span>
                      {/if}
                    {/each}
                  </div>

                  <!-- Pick / Win Rates -->
                  <div class="flex items-center gap-4 shrink-0">
                    <div class="w-16 text-right">
                      <span class="text-xs font-bold text-white block">{formatPercent(combo.pick_rate, cbIdx + 50)}</span>
                      <span class="text-[9px] text-slate-400">{formatGames(combo.play)} Games</span>
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">{formatWinrate(combo.win_rate, cbIdx + 55)}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400 italic">No core item path data available</p>
          {/if}
        </div>

        <!-- 4. SITUATIONAL & DEFENSIVE OPTIONS (4th, 5th, 6th Items) -->
        <div class="glass rounded-xl p-3 shadow-sm">
          <div class="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-purple-200">
            <span>Situational &amp; Defensive Items</span>
            <div class="flex items-center gap-4 text-[9px] font-bold uppercase text-slate-400">
              <span class="w-16 text-right">Pick Rate</span>
              <span class="w-14 text-right">Winrate</span>
            </div>
          </div>

          {#if build.fourth_items && build.fourth_items.length}
            <div class="flex flex-col gap-1.5">
              {#each build.fourth_items.slice(0, 5) as item, itmIdx (`sit-${itmIdx}`)}
                <div class="flex items-center justify-between rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 transition hover:bg-purple-900/25">
                  <div class="flex items-center gap-2 min-w-0 pr-2">
                    <img
                      src={itemIconUrl(item.id, $ddragonVersion)}
                      alt={item.name}
                      class="h-7 w-7 rounded-md border border-purple-500/30 object-cover bg-black shrink-0"
                      title={item.name}
                    />
                    <div class="min-w-0">
                      <span class="text-xs font-semibold text-white truncate block">{item.name}</span>
                      <span class="text-[9px] text-purple-300/70 block">Situational Option</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-4 shrink-0">
                    <div class="w-16 text-right">
                      <span class="text-xs font-bold text-white block">
                        {formatPercent(getSituationalPickRate(item, overviewData?.games), itmIdx + 60)}
                      </span>
                      {#if item.play}
                        <span class="text-[9px] text-slate-400">{formatGames(item.play)} Games</span>
                      {/if}
                    </div>
                    <div class="w-14 text-right">
                      <span class="text-xs font-extrabold text-emerald-400 block">{formatWinrate(item.win_rate, itmIdx + 65)}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-slate-400 italic">No situational item data available</p>
          {/if}
        </div>
      {:else}
        <div class="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-slate-400">
          <p>Select an ally or enemy champion from the lane board to view build paths.</p>
        </div>
      {/if}
    </div>
  </section>
</div>
