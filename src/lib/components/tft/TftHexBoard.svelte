<script lang="ts">
  import type { TftUnit } from "../../types";
  import {
    getTftChampionIcon,
    getTftChampionFallback,
    getTftItemIcon,
    getTftChampionCost,
    isTftTankItem,
  } from "../../utils/tftAssets";

  export let units: TftUnit[] = [];

  // 4 rows (0 = Frontline .. 3 = Backline), 7 columns (0..6)
  const ROWS = [0, 1, 2, 3];
  const COLS = [0, 1, 2, 3, 4, 5, 6];

  /**
   * Sanitizes board units to guarantee all units are placed on distinct cells.
   * If any comp has duplicate cells (e.g. collapsed (1,1)) or missing coordinates,
   * it intelligently places frontline units in rows 4/3 and backline units in rows 1/2.
   */
  function sanitizeBoardUnits(rawUnits: TftUnit[]): TftUnit[] {
    if (!rawUnits || rawUnits.length === 0) return [];

    const usedCells = new Set<string>();
    const sanitized: TftUnit[] = [];

    // Pass 1: Keep units that already have unique, valid cells (1..7, 1..4)
    for (const u of rawUnits) {
      if (
        u.cell &&
        typeof u.cell.x === "number" &&
        typeof u.cell.y === "number" &&
        u.cell.x >= 1 &&
        u.cell.x <= 7 &&
        u.cell.y >= 1 &&
        u.cell.y <= 4
      ) {
        const key = `${u.cell.x},${u.cell.y}`;
        if (!usedCells.has(key)) {
          usedCells.add(key);
          sanitized.push({ ...u, cell: { ...u.cell } });
          continue;
        }
      }
      sanitized.push({ ...u, cell: null as any });
    }

    // If every unit was valid and unique, return
    if (sanitized.every((u) => u.cell)) {
      return sanitized;
    }

    // Pass 2: Place any overlapping or missing units
    const frontCols = [4, 3, 5, 2, 6, 1, 7];
    const backCols = [1, 7, 2, 6, 3, 5, 4];

    for (const u of sanitized) {
      if (u.cell) continue;

      const isTank =
        (u.items && u.items.some((it) => isTftTankItem(it.id || it.name))) ||
        (!u.is_carry && (!u.items || u.items.length === 0));

      const preferredRows = isTank ? [4, 3, 2, 1] : [1, 2, 3, 4];
      const preferredCols = isTank ? frontCols : backCols;

      let placed = false;
      for (const y of preferredRows) {
        for (const x of preferredCols) {
          const key = `${x},${y}`;
          if (!usedCells.has(key)) {
            usedCells.add(key);
            u.cell = { x, y };
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }

    return sanitized;
  }

  $: sanitizedUnits = sanitizeBoardUnits(units);

  // Generate a unique board ID per instance so SVG clipPath and gradient IDs never collide
  const boardId = `board-${Math.random().toString(36).slice(2, 8)}`;

  /**
   * Precompute a 2D reactive grid of placed units [row][col] so that Svelte tracks changes
   * to `sanitizedUnits` and reactively re-renders all occupied cells when `units` prop changes.
   */
  $: grid = ROWS.map((r) =>
    COLS.map((c) => {
      const targetX = c + 1;
      const targetY = 4 - r;
      return sanitizedUnits.find((u) => u.cell && u.cell.x === targetX && u.cell.y === targetY);
    })
  );

  function getUnitCost(unit: TftUnit): number {
    return getTftChampionCost(unit.name, unit.cost);
  }

  function getCostStroke(cost: number): string {
    switch (cost) {
      case 1:
        return "#94a3b8"; // Slate
      case 2:
        return "#10b981"; // Emerald
      case 3:
        return "#3b82f6"; // Blue
      case 4:
        return "#c084fc"; // Purple
      case 5:
        return "#fbbf24"; // Amber / Gold
      default:
        return "#94a3b8";
    }
  }
</script>

<div class="relative w-full overflow-x-auto select-none pt-4 pb-2">
  <!-- Centered 4x7 Hexagon Arena Board Grid with Interlocking Honeycomb -->
  <div class="flex flex-col items-center min-w-[560px]">
    {#each ROWS as r}
      <!-- Alternating honeycomb rows with strictly descending z-index so upper rows are in front of lower rows -->
      <div
        class="relative flex items-center gap-1 hover:z-40 transition-all {r % 2 === 1 ? 'pl-[34px]' : 'pr-[34px]'} {r > 0 ? '-mt-[17px]' : ''}"
        style="z-index: {40 - r * 10};"
      >
        {#each COLS as c}
          {@const unit = grid[r] ? grid[r][c] : undefined}
          {@const cellId = `${boardId}-hex-${r}-${c}`}
          {@const cost = unit ? getUnitCost(unit) : 1}

          <div class="group relative flex h-[72px] w-[64px] items-center justify-center transition-transform duration-150 hover:scale-110 hover:z-50">
            {#if unit}
              <!-- Occupied Hexagon Cell -->
              <svg class="h-[72px] w-[64px] overflow-visible" viewBox="0 0 64 72">
                <defs>
                  <clipPath id="{cellId}-clip">
                    <polygon points="32,2 62,18.5 62,53.5 32,70 2,53.5 2,18.5" />
                  </clipPath>
                  <linearGradient id="{cellId}-fade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="50%" stop-color="#000000" stop-opacity="0" />
                    <stop offset="100%" stop-color="#000000" stop-opacity="0.8" />
                  </linearGradient>
                </defs>

                <!-- Base background -->
                <polygon
                  points="32,2 62,18.5 62,53.5 32,70 2,53.5 2,18.5"
                  fill="#0b0819"
                />

                <!-- Champion Portrait Image -->
                <image
                  href={unit.image_url || getTftChampionIcon(unit.id || unit.name)}
                  x="0"
                  y="0"
                  width="64"
                  height="72"
                  preserveAspectRatio="xMidYMid slice"
                  clip-path="url(#{cellId}-clip)"
                />

                <!-- Bottom gradient overlay for item readability -->
                <polygon
                  points="32,2 62,18.5 62,53.5 32,70 2,53.5 2,18.5"
                  fill="url(#{cellId}-fade)"
                  clip-path="url(#{cellId}-clip)"
                />

                <!-- Cost-colored Hexagon Border Stroke -->
                <polygon
                  points="32,2 62,18.5 62,53.5 32,70 2,53.5 2,18.5"
                  fill="none"
                  stroke={getCostStroke(cost)}
                  stroke-width="2"
                  class="transition-all duration-150 group-hover:stroke-white"
                />
              </svg>

              <!-- 3-Star Rating Tag ONLY: Striking Gold Badge (No 1-star or 2-star tags) -->
              {#if unit.star === 3}
                <div class="pointer-events-none absolute top-1 z-30 flex items-center justify-center leading-none">
                  <span class="rounded-full bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 px-1.5 py-0.5 text-[9px] font-black tracking-tight text-black ring-1 ring-amber-200">
                    ★★★
                  </span>
                </div>
              {/if}

              <!-- Bottom: Equipped Items mini strip - raised to bottom-2 and z-30 so it never gets clipped -->
              {#if unit.items && unit.items.length > 0}
                <div class="pointer-events-none absolute bottom-2 z-30 flex items-center justify-center gap-0.5">
                  {#each unit.items as item}
                    <img
                      src={getTftItemIcon(item.id || item.name)}
                      alt={item.name}
                      class="h-3.5 w-3.5 rounded-sm object-cover ring-1 ring-black/90 shadow-[0_2px_4px_rgba(0,0,0,0.95)]"
                    />
                  {/each}
                </div>
              {/if}
            {:else}
              <!-- Empty Hexagon Arena Tile -->
              <svg class="h-[72px] w-[64px] overflow-visible" viewBox="0 0 64 72">
                <polygon
                  points="32,2 62,18.5 62,53.5 32,70 2,53.5 2,18.5"
                  fill="rgba(20, 14, 38, 0.6)"
                  stroke="rgba(168, 85, 247, 0.2)"
                  stroke-width="1.5"
                  class="transition-colors duration-150 group-hover:fill-purple-900/30 group-hover:stroke-purple-400/50"
                />
              </svg>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
