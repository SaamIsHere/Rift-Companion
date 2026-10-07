<script lang="ts">
  import type { FullPlayerProfile, PlayerMatch } from "../types";
  import {
    TIER_BANDS,
    getHybridRankHistory,
    getShortRankCode,
    eloToTierInfo,
    getProfileKey,
  } from "../stores/rankHistory";
  import { tierMedalUrl, squareIconUrl } from "../utils/ddragon";
  import { championCatalog, ddragonVersion } from "../stores/champions";

  export let profile: FullPlayerProfile | null = null;
  export let matches: PlayerMatch[] = [];

  let activeQueue: "solo" | "flex" = "solo";
  let hoveredIndex: number | null = null;

  $: profileKey = profile
    ? getProfileKey(profile.game_name, profile.tag_line, profile.region || "EUW")
    : "default";

  $: currentQueueRank = activeQueue === "solo" ? profile?.solo_rank : profile?.flex_rank;

  $: activePoints = profile
    ? getHybridRankHistory(
        profileKey,
        activeQueue,
        currentQueueRank,
        matches,
        profile.lp_histories || []
      )
    : [];

  // SVG coordinate system (Full bleed: zero padding, completely fills the card box)
  const svgWidth = 380;
  const svgHeight = 150;

  // Elo scale bounds (snapped to 100-LP division lines with vertical headroom)
  $: eloBounds = (() => {
    if (activePoints.length === 0) {
      const fallbackElo = currentQueueRank?.tier ? 1200 : 800;
      return { min: fallbackElo - 200, max: fallbackElo + 200 };
    }
    const elos = activePoints.map((p) => p.elo);
    const minVal = Math.min(...elos);
    const maxVal = Math.max(...elos);

    const minPadded = Math.max(0, Math.floor((minVal - 30) / 100) * 100);
    const maxPadded = Math.ceil((maxVal + 70) / 100) * 100;
    const span = Math.max(200, maxPadded - minPadded);

    return { min: minPadded, max: minPadded + span };
  })();

  function getY(elo: number): number {
    const { min, max } = eloBounds;
    if (max <= min) return svgHeight / 2;
    const ratio = (elo - min) / (max - min);
    return (1 - ratio) * svgHeight;
  }

  function getX(index: number, total: number): number {
    if (total <= 1) return svgWidth / 2;
    return (index / (total - 1)) * svgWidth;
  }

  // Pre-calculated point coordinates
  $: pointCoords = activePoints.map((p, idx) => ({
    ...p,
    x: getX(idx, activePoints.length),
    y: getY(p.elo),
  }));

  // Catmull-Rom smooth spline path (spanning edge-to-edge)
  $: splinePath = (() => {
    if (pointCoords.length === 0) return { line: "", area: "" };

    const pts = pointCoords;

    if (pts.length === 1) {
      const p = pts[0];
      const line = `M 0 ${p.y.toFixed(1)} L ${svgWidth} ${p.y.toFixed(1)}`;
      const area = `M 0 ${svgHeight} L 0 ${p.y.toFixed(1)} L ${svgWidth} ${p.y.toFixed(1)} L ${svgWidth} ${svgHeight} Z`;
      return { line, area };
    }

    let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;

      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      line += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const first = pts[0];
    const last = pts[pts.length - 1];
    const area = `${line} L ${last.x.toFixed(1)} ${svgHeight} L ${first.x.toFixed(1)} ${svgHeight} Z`;

    return { line, area };
  })();

  // Tier Background Bands filling 100% of the box vertically from 0 to svgHeight
  $: visibleBands = TIER_BANDS.map((b) => {
    const topElo = Math.min(eloBounds.max, b.maxElo);
    const bottomElo = Math.max(eloBounds.min, b.minElo);
    if (topElo <= bottomElo) return null;

    let yTop = getY(topElo);
    let yBottom = getY(bottomElo);

    // Extend topmost band to top edge of container
    if (topElo === eloBounds.max) {
      yTop = 0;
    }
    // Extend bottommost band to bottom edge of container
    if (bottomElo === eloBounds.min) {
      yBottom = svgHeight;
    }

    const h = Math.max(1, yBottom - yTop);

    return {
      tier: b.tier,
      bgFill: b.bgFill,
      y: yTop,
      height: h,
    };
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  // Division Bands & Labels (e.g. P4, G1, G2, G3 placed directly inside the box on the left)
  $: divisionBands = (() => {
    const bands: {
      label: string;
      tier: string;
      color: string;
      minElo: number;
      maxElo: number;
      yTop: number;
      yBottom: number;
      labelY: number;
    }[] = [];

    const start = Math.floor(eloBounds.min / 100) * 100;
    const end = Math.ceil(eloBounds.max / 100) * 100;

    for (let elo = start; elo < end; elo += 100) {
      const divMin = Math.max(eloBounds.min, elo);
      const divMax = Math.min(eloBounds.max, elo + 100);
      if (divMax <= divMin) continue;

      const midElo = elo + 50;
      const info = eloToTierInfo(midElo);
      const code = getShortRankCode(info.tier, info.division);
      const bandConfig = TIER_BANDS.find((b) => b.tier === info.tier);
      const color = bandConfig?.color || "#94a3b8";

      const yTop = getY(divMax);
      const yBottom = getY(divMin);

      // Label sits inside the division band on the left, right above the lower boundary
      const labelY =
        yBottom >= svgHeight - 2
          ? svgHeight - 5
          : yBottom - yTop >= 18
          ? yBottom - 4
          : (yTop + yBottom) / 2 + 3.5;

      bands.push({
        label: code,
        tier: info.tier,
        color,
        minElo: divMin,
        maxElo: divMax,
        yTop,
        yBottom,
        labelY,
      });
    }

    return bands;
  })();

  // Dashed horizontal division guidelines across 100% of the box
  $: divisionGuidelines = (() => {
    const lines: { elo: number; y: number; color: string }[] = [];
    const start = Math.ceil(eloBounds.min / 100) * 100;
    const end = Math.floor(eloBounds.max / 100) * 100;

    for (let elo = start; elo <= end; elo += 100) {
      // Skip bottom-most line since container border is already there
      if (elo === eloBounds.min) continue;

      const infoAbove = eloToTierInfo(elo < eloBounds.max ? elo + 10 : elo - 10);
      const bandConfig = TIER_BANDS.find((b) => b.tier === infoAbove.tier);
      const color = bandConfig?.color || "#94a3b8";

      lines.push({
        elo,
        y: getY(elo),
        color,
      });
    }
    return lines;
  })();

  // Net LP Progress
  $: netLp = (() => {
    if (activePoints.length <= 1) return 0;
    const first = activePoints[0];
    const last = activePoints[activePoints.length - 1];
    return last.elo - first.elo;
  })();

  // Primary accent color based on current tier
  $: currentTierColor = (() => {
    const tier = (currentQueueRank?.tier || activePoints[activePoints.length - 1]?.tier || "GOLD").toUpperCase();
    const band = TIER_BANDS.find((b) => b.tier === tier);
    return band?.color || "#f59e0b";
  })();

  function formatTierDisplay(rank: any): string {
    if (!rank || !rank.tier || rank.tier === "UNRANKED" || rank.tier === "NONE") {
      return "Unranked";
    }
    const t = rank.tier.charAt(0) + rank.tier.slice(1).toLowerCase();
    const d = rank.division ? String(rank.division).trim() : "";
    const dNum =
      d === "I" || d === "1"
        ? "1"
        : d === "II" || d === "2"
        ? "2"
        : d === "III" || d === "3"
        ? "3"
        : d === "IV" || d === "4"
        ? "4"
        : d;
    return dNum ? `${t} ${dNum}` : t;
  }

  function getChampionKey(champId?: number, champName?: string): string {
    if (!$championCatalog) return "";
    if (champId && $championCatalog.has(champId)) {
      return $championCatalog.get(champId)?.key || "";
    }
    if (champName) {
      const lower = champName.toLowerCase();
      for (const info of $championCatalog.values()) {
        if (info.name.toLowerCase() === lower || info.key.toLowerCase() === lower) {
          return info.key;
        }
      }
    }
    return "";
  }

  function getFallbackChampionKeyForPoint(pt: (typeof pointCoords)[0]): string {
    const directKey = getChampionKey(pt.champion_id, pt.champion_name);
    if (directKey) return directKey;

    // Search matches list for the closest played game in this queue
    if (!matches || matches.length === 0) return "";
    const isTargetQueue = (m: PlayerMatch) => {
      const q = (m.queue_label || "").toLowerCase();
      const gt = (m.game_type || "").toLowerCase();
      if (activeQueue === "solo") {
        return q.includes("solo") || gt.includes("solo");
      }
      return q.includes("flex") || gt.includes("flex");
    };

    let bestChampKey = "";
    let minDiff = 4 * 3600 * 1000; // 4 hours window
    for (const m of matches) {
      if (!isTargetQueue(m) || !m.game_creation) continue;
      const diff = Math.abs(m.game_creation - pt.timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        bestChampKey = getChampionKey(m.champion_id, m.champion_name);
      }
    }
    return bestChampKey;
  }

  // Mousemove handler for smooth horizontal tracking across the entire chart
  function handleSvgMouseMove(e: MouseEvent) {
    if (pointCoords.length === 0) return;
    const svgEl = e.currentTarget as SVGSVGElement;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return;
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * svgWidth;

    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < pointCoords.length; i++) {
      const dist = Math.abs(pointCoords[i].x - svgX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    hoveredIndex = closestIdx;
  }

  // Dynamic Tooltip Placement:
  // - Prefers ABOVE if there is room (pt.y >= 50)
  // - Flips to BELOW if there is no room above (pt.y < 50)
  // - Anchors to left / right boundaries to prevent horizontal clipping
  $: tooltipPlacement = (() => {
    if (hoveredIndex === null || !pointCoords[hoveredIndex]) return null;
    const pt = pointCoords[hoveredIndex];
    const xRatio = pt.x / svgWidth;
    const showBelow = pt.y < 50;

    let style = "";
    if (xRatio < 0.18) {
      style += "left: 8px; right: auto; ";
    } else if (xRatio > 0.82) {
      style += "right: 8px; left: auto; ";
    } else {
      style += `left: ${(xRatio * 100).toFixed(1)}%; right: auto; `;
    }

    if (showBelow) {
      style += `top: calc(${((pt.y / svgHeight) * 100).toFixed(1)}% + 10px); `;
    } else {
      style += `top: calc(${((pt.y / svgHeight) * 100).toFixed(1)}% - 10px); `;
    }

    const xTransform = xRatio < 0.18 ? "0%" : xRatio > 0.82 ? "0%" : "-50%";
    const yTransform = showBelow ? "0%" : "-100%";
    const transform = `transform: translate(${xTransform}, ${yTransform});`;

    return {
      style: `${style} ${transform}`,
      showBelow,
      pt,
    };
  })();
</script>

<div class="glass rounded-2xl p-4 mb-4 border border-purple-500/20 bg-void-950/70 shadow-lg">
  <!-- CARD TOP HEADER (with blue vertical accent bar & queue toggle pills) -->
  <div class="flex items-center justify-between gap-2 mb-3">
    <div class="flex items-center gap-2">
      <!-- Blue vertical accent pill line (as in mock) -->
      <div class="h-4 w-1 rounded-full bg-blue-500 shrink-0"></div>
      <h2 class="text-sm font-extrabold tracking-wide text-white">
        {activeQueue === "solo" ? "Ranked Solo" : "Ranked Flex"}
      </h2>
    </div>

    <!-- QUEUE FILTER BUTTONS (Solo/Duo & Flex only) -->
    <div class="flex items-center rounded-lg border border-purple-500/20 bg-purple-950/50 p-0.5">
      <button
        type="button"
        on:click={() => {
          activeQueue = "solo";
          hoveredIndex = null;
        }}
        class="rounded-md px-2.5 py-1 text-center text-[11px] font-bold transition {activeQueue === 'solo'
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-purple-300/70 hover:text-white'}"
      >
        Solo/Duo
      </button>
      <button
        type="button"
        on:click={() => {
          activeQueue = "flex";
          hoveredIndex = null;
        }}
        class="rounded-md px-2.5 py-1 text-center text-[11px] font-bold transition {activeQueue === 'flex'
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-purple-300/70 hover:text-white'}"
      >
        Flex
      </button>
    </div>
  </div>

  <!-- CURRENT RANK BANNER (Medal + Tier + LP on left, W/L + Winrate on right) -->
  <div class="flex items-center justify-between mb-3 px-1">
    <div class="flex items-center gap-3 min-w-0">
      <img
        src={currentQueueRank ? tierMedalUrl(currentQueueRank.tier) : tierMedalUrl("UNRANKED")}
        alt={currentQueueRank?.tier || "UNRANKED"}
        class="h-10 w-10 object-contain drop-shadow-md shrink-0"
      />
      <div class="min-w-0">
        <div class="text-base font-black text-white leading-tight truncate">
          {formatTierDisplay(currentQueueRank)}
        </div>
        <div class="text-xs font-semibold text-slate-400 mt-0.5">
          {currentQueueRank?.league_points || 0} LP
        </div>
      </div>
    </div>

    <!-- Win/Loss & Win Rate -->
    {#if currentQueueRank && (currentQueueRank.wins || currentQueueRank.losses)}
      <div class="text-right shrink-0">
        <div class="text-xs font-medium text-slate-300">
          <span class="text-slate-200">{currentQueueRank.wins}W</span>
          <span class="text-slate-400">{currentQueueRank.losses}L</span>
        </div>
        <div class="text-xs font-bold text-slate-200 mt-0.5">
          {Math.round((currentQueueRank.win_rate || 0) * 100)}% Win Rate
        </div>
      </div>
    {:else}
      <div class="text-right shrink-0 text-xs font-semibold text-slate-500">
        0 Games
      </div>
    {/if}
  </div>

  <!-- DIVIDER LINE -->
  <div class="border-t border-purple-500/15 my-2.5"></div>

  <!-- GRAPH SECTION SUB-HEADER (Queue-specific game count) -->
  <div class="flex items-center justify-between mb-2 px-1">
    <div class="flex items-center gap-1.5">
      <span class="text-xs font-bold text-slate-200">
        {#if activePoints.length > 0}
          {activeQueue === "solo" ? "Ranked Solo" : "Ranked Flex"}: Last {activePoints.length} games
        {:else}
          {activeQueue === "solo" ? "Ranked Solo" : "Ranked Flex"}: Season Progression
        {/if}
      </span>
      <span class="text-[10px] text-slate-500 font-medium">
        ({activeQueue === "solo" ? "Solo/Duo" : "Flex"})
      </span>
    </div>
  </div>

  <!-- THE GRAPH CONTAINER (Edge-to-edge box with color-coded tier background bands) -->
  <div class="relative w-full h-[150px] rounded-xl border border-purple-500/20 bg-[#0d111d] overflow-hidden p-0">
    <svg
      viewBox="0 0 {svgWidth} {svgHeight}"
      preserveAspectRatio="none"
      class="w-full h-full select-none block"
      role="img"
      aria-label="Rank progression chart"
      on:mousemove={handleSvgMouseMove}
      on:mouseleave={() => (hoveredIndex = null)}
    >
      <defs>
        <!-- Soft gradient fill under curve -->
        <linearGradient id="rankAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={currentTierColor} stop-opacity="0.20" />
          <stop offset="100%" stop-color={currentTierColor} stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- 1. COLOR-CODED TIER BACKGROUND BANDS (Filling 100% of the box from top to bottom) -->
      {#each visibleBands as band (band.tier)}
        <rect
          x="0"
          y={band.y}
          width={svgWidth}
          height={band.height}
          fill={band.bgFill}
          pointer-events="none"
        />
      {/each}

      <!-- 2. HORIZONTAL DIVISION GUIDELINES (Full-width dashed lines) -->
      {#each divisionGuidelines as line (line.elo)}
        <line
          x1="0"
          y1={line.y}
          x2={svgWidth}
          y2={line.y}
          stroke={line.color}
          stroke-width="1"
          stroke-dasharray="4,4"
          opacity="0.32"
          pointer-events="none"
        />
      {/each}

      <!-- 3. DIVISION LABELS (Rendered inside the box on the left: P4, G1, G2, G3) -->
      {#each divisionBands as divBand (divBand.label + divBand.minElo)}
        <text
          x="10"
          y={divBand.labelY}
          fill={divBand.color}
          font-size="10"
          font-weight="800"
          font-family="monospace"
          text-anchor="start"
          opacity="0.9"
          class="select-none pointer-events-none"
        >
          {divBand.label}
        </text>
      {/each}

      <!-- 4. CURVE & AREA -->
      {#if activePoints.length === 0}
        <text
          x={svgWidth / 2}
          y={svgHeight / 2}
          fill="rgba(148, 163, 184, 0.5)"
          font-size="11"
          font-weight="600"
          text-anchor="middle"
        >
          No ranked games recorded for this queue
        </text>
      {:else}
        <!-- Area fill under spline -->
        {#if splinePath.area}
          <path d={splinePath.area} fill="url(#rankAreaGrad)" pointer-events="none" />
        {/if}

        <!-- Glowing Spline Line -->
        {#if splinePath.line}
          <path
            d={splinePath.line}
            fill="none"
            stroke={currentTierColor}
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            pointer-events="none"
          />
        {/if}

      {/if}
    </svg>

    <!-- 4b. HTML HOVER CIRCLE (Guaranteed 100% perfectly round, immune to SVG non-uniform aspect scaling) -->
    {#if hoveredIndex !== null && pointCoords[hoveredIndex]}
      {@const pt = pointCoords[hoveredIndex]}
      {@const dotBg = pt.win === true ? "#10b981" : pt.win === false ? "#f43f5e" : currentTierColor}
      <div
        class="pointer-events-none absolute w-3.5 h-3.5 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 z-20 shadow-md transition-colors"
        style="left: {(pt.x / svgWidth) * 100}%; top: {(pt.y / svgHeight) * 100}%; background-color: {dotBg};"
      ></div>
    {:else if activePoints.length === 1 && pointCoords[0]}
      {@const pt = pointCoords[0]}
      <div
        class="pointer-events-none absolute w-2.5 h-2.5 rounded-full border border-white -translate-x-1/2 -translate-y-1/2 z-20 shadow"
        style="left: {(pt.x / svgWidth) * 100}%; top: {(pt.y / svgHeight) * 100}%; background-color: {currentTierColor};"
      ></div>
    {/if}

    <!-- 5. FLOATING INTERACTIVE TOOLTIP (Dynamically flips above/below, clamped horizontally) -->
    {#if hoveredIndex !== null && pointCoords[hoveredIndex] && tooltipPlacement}
      {@const activePt = pointCoords[hoveredIndex]}
      {@const champKey = getFallbackChampionKeyForPoint(activePt)}
      {@const champImg = champKey ? squareIconUrl(champKey, $ddragonVersion) : ""}
      {@const shortCode = getShortRankCode(activePt.tier, activePt.division)}
      {@const isWin = activePt.win === true}
      {@const isLoss = activePt.win === false}

      <div
        class="pointer-events-none absolute z-30 rounded-lg border px-2.5 py-1.5 shadow-lg backdrop-blur-md flex items-center gap-2.5 transition-all {isWin
          ? 'bg-emerald-950/95 border-emerald-500/80'
          : isLoss
          ? 'bg-rose-950/95 border-rose-500/80'
          : 'bg-[#161b2e]/95 border-slate-700/80'}"
        style={tooltipPlacement.style}
      >
        <!-- Champion Avatar thumbnail (like mockup) -->
        {#if champImg}
          <img
            src={champImg}
            alt={activePt.champion_name || "Champion"}
            class="h-8 w-8 rounded-lg object-cover border {isWin
              ? 'border-emerald-400/80'
              : isLoss
              ? 'border-rose-400/80'
              : 'border-slate-600/60'} shrink-0 bg-slate-900 shadow"
          />
        {:else}
          <img
            src={tierMedalUrl(activePt.tier)}
            alt={activePt.tier}
            class="h-8 w-8 object-contain shrink-0"
          />
        {/if}

        <!-- Text details: Rank + LP only (no champion name, clean & compact) -->
        <div class="leading-tight pr-0.5">
          <div class="text-xs font-black {isWin ? 'text-emerald-100' : isLoss ? 'text-rose-100' : 'text-white'} whitespace-nowrap">
            {shortCode} {activePt.lp} LP
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- BOTTOM AXIS LABELS ("X games ago" on left, "Latest game" on right) -->
  {#if activePoints.length > 0}
    <div class="flex items-center justify-between mt-2 px-1 text-[11px] font-medium text-slate-500">
      <span>{activePoints.length} games ago</span>
      <span>Latest game</span>
    </div>
  {/if}
</div>
