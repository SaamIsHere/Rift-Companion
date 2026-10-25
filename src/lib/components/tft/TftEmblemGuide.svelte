<script lang="ts">
  import {
    tftMetaDecks,
    tftSelectedEmblems,
    addSelectedEmblem,
    removeSelectedEmblem,
    clearSelectedEmblems,
  } from "../../stores/tft";
  import {
    SET18_EMBLEMS,
    EMBLEM_CATEGORY_ICONS,
    optimizeCompsForEmblems,
    getEmblemById,
    type AdaptedComp,
    type AdaptedVariant,
  } from "../../utils/emblemOptimizer";
  import {
    getTftChampionFallback,
    getTftItemIcon,
    getTftTraitIcon,
  } from "../../utils/tftAssets";

  type EmblemCategory = "all" | "spatula" | "pan" | "uncraftable";

  let selectedCategory: EmblemCategory = "all";
  let emblemSearchQuery = "";

  // Track which variant index is selected per comp ID (defaults to 0 = highest-scored variant)
  let selectedVariantByComp: Record<string, number> = {};

  // Count how many times each emblem is selected
  $: emblemCounts = $tftSelectedEmblems.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  // Unique selected emblems with their counts for top bar summary
  $: groupedSelectedEmblems = Object.entries(emblemCounts)
    .map(([id, count]) => ({ emblem: getEmblemById(id), count }))
    .filter((entry): entry is { emblem: NonNullable<ReturnType<typeof getEmblemById>>; count: number } =>
      Boolean(entry.emblem)
    );

  $: filteredEmblems = SET18_EMBLEMS.filter((e) => {
    if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
    if (!emblemSearchQuery.trim()) return true;
    const q = emblemSearchQuery.toLowerCase().trim();
    return e.name.toLowerCase().includes(q) || e.trait.toLowerCase().includes(q);
  });

  // Calculate adapted compositions reactively whenever selected emblems or meta decks change
  $: adaptedComps = optimizeCompsForEmblems($tftMetaDecks, $tftSelectedEmblems);

  // Reset variant index if out of bounds when emblems change
  function getActiveVariant(comp: AdaptedComp, map: Record<string, number>): AdaptedVariant {
    const idx = map[comp.id] ?? 0;
    return comp.variants[idx] || comp.variants[0];
  }

  function selectVariant(compId: string, idx: number) {
    selectedVariantByComp = { ...selectedVariantByComp, [compId]: idx };
  }

  function handleEmblemLeftClick(emblemId: string) {
    addSelectedEmblem(emblemId);
  }

  function handleEmblemRightClick(emblemId: string, event: MouseEvent) {
    event.preventDefault();
    removeSelectedEmblem(emblemId);
  }

  function getCostBorderColor(cost: number): string {
    switch (cost) {
      case 1:
        return "border-[#94a3b8]";
      case 2:
        return "border-[#10b981]";
      case 3:
        return "border-[#3b82f6]";
      case 4:
        return "border-[#c084fc]";
      case 5:
        return "border-[#fbbf24]";
      default:
        return "border-[#94a3b8]";
    }
  }

  function getTierBadgeColor(tier: string): { border: string; text: string; bg: string } {
    switch (tier.toUpperCase()) {
      case "S":
        return { border: "border-amber-400/50", text: "text-amber-300", bg: "bg-amber-500/20" };
      case "A":
        return { border: "border-purple-400/50", text: "text-purple-300", bg: "bg-purple-500/20" };
      case "B":
        return { border: "border-blue-400/50", text: "text-blue-300", bg: "bg-blue-500/20" };
      case "C":
        return { border: "border-emerald-400/50", text: "text-emerald-300", bg: "bg-emerald-500/20" };
      default:
        return { border: "border-slate-500/50", text: "text-slate-300", bg: "bg-slate-700/30" };
    }
  }
</script>

<div class="space-y-5">
  <!-- Top Emblem Selector & Filter Section -->
  <div class="rounded-xl border border-purple-500/25 bg-void-900/80 p-4 shadow-xl backdrop-blur-md">
    <!-- Clean Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-purple-500/15">
      <div>
        <h2 class="text-base font-black tracking-wider uppercase text-white">
          Emblem Guide &amp; Comp Optimizer
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">
          Left-click an emblem to add (+1), right-click to remove (-1). Supports stacking duplicate emblems (up to 4 total).
        </p>
      </div>

      <!-- Active Selected Emblem Chips -->
      {#if groupedSelectedEmblems.length > 0}
        <div class="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          {#each groupedSelectedEmblems as { emblem, count }}
            <button
              type="button"
              on:click={() => handleEmblemLeftClick(emblem.id)}
              on:contextmenu|preventDefault|stopPropagation={(e) => handleEmblemRightClick(emblem.id, e)}
              class="flex items-center gap-1.5 rounded-lg border border-purple-400/50 bg-purple-950/50 px-2 py-1 hover:border-purple-300 transition"
              title="Left-click: +1 | Right-click: -1"
            >
              <img
                src={emblem.icon}
                alt={emblem.name}
                class="h-5 w-5 rounded object-cover border border-purple-400/30"
                on:error={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.src = getTftItemIcon(emblem.id);
                }}
              />
              <span class="text-xs font-bold text-white">{emblem.trait}</span>
              <span class="rounded bg-purple-600 px-1 py-0.2 text-[10px] font-black text-white">
                ×{count}
              </span>
            </button>
          {/each}

          <button
            type="button"
            on:click={clearSelectedEmblems}
            class="rounded-lg border border-red-500/30 bg-red-950/20 px-2.5 py-1 text-xs font-bold text-red-300 hover:bg-red-500/20 hover:border-red-400 transition ml-1"
            title="Clear all selected emblems"
          >
            Clear ({$tftSelectedEmblems.length})
          </button>
        </div>
      {/if}
    </div>

    <!-- Category Filters (Segmented Pill) & Search -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div class="relative inline-flex items-center rounded-lg border border-purple-500/25 bg-void-950/80 p-0.5">
        <button
          type="button"
          on:click={() => (selectedCategory = "all")}
          class="flex h-7 items-center justify-center rounded-md px-3 text-xs font-bold transition {selectedCategory === 'all' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-purple-950/30'}"
          title="All Emblems ({SET18_EMBLEMS.length})"
        >
          All
        </button>

        <button
          type="button"
          on:click={() => (selectedCategory = "spatula")}
          class="flex h-7 w-8 items-center justify-center rounded-md p-1 transition {selectedCategory === 'spatula' ? 'bg-purple-600' : 'opacity-70 hover:opacity-100 hover:bg-purple-950/30'}"
          title="Spatula Emblems"
        >
          <img
            src={EMBLEM_CATEGORY_ICONS.spatula}
            alt="Spatula"
            class="h-4.5 w-4.5 rounded object-cover"
          />
        </button>

        <button
          type="button"
          on:click={() => (selectedCategory = "pan")}
          class="flex h-7 w-8 items-center justify-center rounded-md p-1 transition {selectedCategory === 'pan' ? 'bg-purple-600' : 'opacity-70 hover:opacity-100 hover:bg-purple-950/30'}"
          title="Frying Pan Emblems"
        >
          <img
            src={EMBLEM_CATEGORY_ICONS.pan}
            alt="Frying Pan"
            class="h-4.5 w-4.5 rounded object-cover"
          />
        </button>

        <button
          type="button"
          on:click={() => (selectedCategory = "uncraftable")}
          class="flex h-7 w-8 items-center justify-center rounded-md p-1 transition {selectedCategory === 'uncraftable' ? 'bg-purple-600' : 'opacity-70 hover:opacity-100 hover:bg-purple-950/30'}"
          title="Tome of Traits / Uncraftable Emblems"
        >
          <img
            src={EMBLEM_CATEGORY_ICONS.uncraftable}
            alt="Tome of Traits"
            class="h-4.5 w-4.5 rounded object-cover"
          />
        </button>
      </div>

      <!-- Search input -->
      <div class="relative min-w-[180px]">
        <input
          type="text"
          placeholder="Search emblem or trait..."
          bind:value={emblemSearchQuery}
          class="w-full rounded-lg border border-purple-500/20 bg-void-950/80 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none"
        />
      </div>
    </div>

    <!-- Emblem Grid Picker with Left-Click (+1) & Right-Click (-1) -->
    <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2">
      {#each filteredEmblems as emblem}
        {@const count = emblemCounts[emblem.id] ?? 0}
        <button
          type="button"
          on:click={() => handleEmblemLeftClick(emblem.id)}
          on:contextmenu|preventDefault|stopPropagation={(e) => handleEmblemRightClick(emblem.id, e)}
          class="group relative flex flex-col items-center justify-center rounded-lg border p-2 text-center transition select-none {count > 0 ? 'border-purple-400 bg-purple-900/40' : 'border-purple-500/20 bg-white/[0.03] hover:border-purple-400/40 hover:bg-white/[0.06]'} active:scale-95 focus:outline-none"
          title="{emblem.name} (Count: {count} — Left-click: +1, Right-click: -1)"
        >
          {#if count > 0}
            <span
              class="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 border border-purple-300 px-1 text-[9px] font-black text-white"
            >
              ×{count}
            </span>
          {/if}

          <div class="relative">
            <img
              src={emblem.icon}
              alt={emblem.name}
              class="h-8 w-8 rounded-md object-cover border {count > 0 ? 'border-purple-300/50' : 'border-purple-500/20'}"
              on:error={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.src = getTftItemIcon(emblem.id);
              }}
            />
            <img
              src={EMBLEM_CATEGORY_ICONS[emblem.category]}
              alt={emblem.category}
              class="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-void-950 p-0.5 border border-purple-500/40 object-cover"
            />
          </div>

          <span class="mt-1.5 text-[10px] font-bold text-white truncate w-full" title={emblem.trait}>
            {emblem.trait}
          </span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Results Section -->
  {#if $tftSelectedEmblems.length === 0}
    <!-- Empty State -->
    <div class="rounded-xl border border-purple-500/20 bg-void-900/50 p-7 text-center shadow-lg">
      <h3 class="text-sm font-bold text-white mb-1.5">
        No Emblems Selected
      </h3>
      <p class="text-xs text-slate-400 max-w-lg mx-auto mb-5">
        Left-click any emblem above to add it (right-click to decrease count). The optimizer computes multiple adaptation paths per comp: vertical breakpoint pushes (no cuts) as well as 1-unit and 2-unit flex upgrades.
      </p>

      <!-- Quick Select Chips -->
      <div class="flex flex-wrap items-center justify-center gap-2">
        <span class="text-xs font-semibold text-slate-400 mr-1">Quick Select:</span>
        {#each ["inferno_emblem", "juggernaut_emblem", "hunter_emblem", "lunar_emblem", "elderwood_emblem"] as quickId}
          {@const emb = getEmblemById(quickId)}
          {#if emb}
            <button
              type="button"
              on:click={() => addSelectedEmblem(emb.id)}
              class="flex items-center gap-1.5 rounded-lg border border-purple-500/25 bg-white/[0.03] px-2.5 py-1.5 text-xs font-bold text-purple-200 hover:border-purple-400 hover:bg-purple-950/40 transition"
            >
              <img src={emb.icon} alt={emb.name} class="h-4 w-4 rounded object-cover" />
              <span>{emb.trait}</span>
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {:else if adaptedComps.length === 0}
    <div class="rounded-xl border border-purple-500/20 bg-void-900/50 p-7 text-center">
      <p class="text-xs font-semibold text-slate-300">
        No viable meta compositions found that can legally equip and activate this emblem combination.
      </p>
    </div>
  {:else}
    <!-- Comps Found Header -->
    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-purple-200">
          {adaptedComps.length} Recommended Compositions
        </span>
      </div>
      <span class="text-[11px] text-slate-400">
        Switch tabs inside each comp to compare adaptation paths (No Cut vs. Unit Swaps)
      </span>
    </div>

    <!-- Adapted Comps List -->
    <div class="space-y-4">
      {#each adaptedComps as comp (comp.id)}
        {@const tierTheme = getTierBadgeColor(comp.tier)}
        {@const activeVariant = getActiveVariant(comp, selectedVariantByComp)}
        {@const activeIdx = selectedVariantByComp[comp.id] ?? 0}

        <div class="rounded-xl border border-purple-500/25 bg-void-900/85 p-4 shadow-lg transition hover:border-purple-400/40">
          <!-- ROW 1: Comp Header & Adaptation Variant Selector Tabs -->
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 mb-3 border-b border-purple-500/15">
            <div class="flex items-center gap-2.5">
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border {tierTheme.border} {tierTheme.bg} text-xs font-black {tierTheme.text}">
                {comp.tier}
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-extrabold text-white">
                    {comp.originalDeck.name}
                  </h3>
                  <span class="rounded bg-purple-500/15 border border-purple-400/30 px-1.5 py-0.5 text-[10px] font-bold text-purple-200">
                    {comp.matchRatingPercent}% Match
                  </span>
                </div>
              </div>
            </div>

            <!-- Connected Variant Switcher Pill: [ Option 1 | Option 2 ] -->
            {#if comp.variants.length > 1}
              <div
                class="relative inline-flex items-center rounded-lg border border-purple-500/25 bg-void-950/80 p-0.5 shadow-inner"
                role="group"
                aria-label="Adaptation variant switcher"
              >
                {#each comp.variants as variant, vIdx}
                  {@const isCurrent = (comp.variants[activeIdx] ? activeIdx : 0) === vIdx}
                  <button
                    type="button"
                    on:click={() => selectVariant(comp.id, vIdx)}
                    class="relative z-10 flex items-center justify-center rounded-md px-3 py-1 text-xs font-bold transition-colors duration-150 focus:outline-none {isCurrent
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-purple-200 hover:bg-purple-950/30'}"
                  >
                    <span>{variant.label}</span>
                  </button>
                {/each}
              </div>
            {:else if comp.variants.length === 1}
              <span class="rounded-md border border-purple-500/20 bg-void-950/60 px-2.5 py-1 text-xs font-semibold text-purple-200">
                {comp.variants[0].label}
              </span>
            {/if}
          </div>

          <!-- ROW 2: Structured 3-Part Tactical Summary Bar -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3.5">
            <!-- Part 1: Emblem Carrier(s) -->
            <div class="rounded-lg border border-purple-500/20 bg-void-950/60 px-3 py-2 flex flex-col justify-center">
              <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Emblem Carrier{activeVariant.emblemAssignments.length > 1 ? 's' : ''}
              </span>
              <div class="flex flex-wrap items-center gap-2">
                {#each activeVariant.emblemAssignments as assign}
                  <div class="flex items-center gap-1.5 rounded-md bg-purple-950/60 border border-purple-400/30 px-2 py-0.5">
                    <img
                      src={assign.emblem.icon}
                      alt={assign.emblem.name}
                      class="h-4 w-4 rounded object-cover"
                    />
                    <span class="text-[10px] text-slate-400">➔</span>
                    <img
                      src={assign.holderIconUrl}
                      alt={assign.holderUnitName}
                      class="h-4 w-4 rounded-full object-cover border border-amber-400/60"
                      on:error={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.src = getTftChampionFallback(assign.holderUnitName);
                      }}
                    />
                    <span class="text-xs font-bold text-white">{assign.holderUnitName}</span>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Part 2: Unit Adjustments (No Cut vs Cut/Add) -->
            <div class="rounded-lg border border-purple-500/20 bg-void-950/60 px-3 py-2 flex flex-col justify-center">
              <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Board Adjustment
              </span>
              {#if activeVariant.cuts.length === 0}
                <div class="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <span>Keep standard 8/9-unit roster intact</span>
                </div>
              {:else}
                <div class="flex flex-wrap items-center gap-1.5">
                  <div class="flex items-center gap-1 rounded bg-red-950/40 border border-red-500/30 px-1.5 py-0.5">
                    <span class="text-[10px] font-bold text-red-400">Cut:</span>
                    {#each activeVariant.cuts as cut, ci}
                      <img
                        src={cut.image_url}
                        alt={cut.name}
                        class="h-4 w-4 rounded-full object-cover grayscale"
                        on:error={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.src = getTftChampionFallback(cut.name);
                        }}
                      />
                      <span class="text-[11px] font-bold text-red-200">{cut.name}{ci < activeVariant.cuts.length - 1 ? ',' : ''}</span>
                    {/each}
                  </div>

                  <span class="text-xs text-slate-400">➔</span>

                  <div class="flex items-center gap-1 rounded bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5">
                    <span class="text-[10px] font-bold text-emerald-400">Add:</span>
                    {#each activeVariant.additions as add, ai}
                      <img
                        src={add.image_url}
                        alt={add.name}
                        class="h-4 w-4 rounded-full object-cover"
                        on:error={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.src = getTftChampionFallback(add.name);
                        }}
                      />
                      <span class="text-[11px] font-bold text-emerald-200">{add.name}{ai < activeVariant.additions.length - 1 ? ',' : ''}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- Part 3: Synergy Impact -->
            <div class="rounded-lg border border-purple-500/20 bg-void-950/60 px-3 py-2 flex flex-col justify-center">
              <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Synergy Impact
              </span>
              <div class="flex flex-wrap items-center gap-1.5">
                {#each activeVariant.traitUpgrades as upg}
                  <div class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold {upg.isBreakpoint ? 'bg-amber-500/20 border border-amber-400/50 text-amber-200' : 'bg-purple-500/15 border border-purple-400/30 text-purple-200'}">
                    <img
                      src={getTftTraitIcon(upg.trait)}
                      alt={upg.trait}
                      class="h-3.5 w-3.5 object-contain"
                      on:error={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                    <span>{upg.trait}</span>
                    <span class="text-white font-black">{upg.from} ➔ {upg.to}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- ROW 3: Champion Lineup & Active Traits -->
          <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pt-1">
            <!-- Units Row -->
            <div class="flex flex-wrap items-start gap-2">
              {#each activeVariant.units as unit}
                {@const isAddedUnit = unit.status === 'added'}
                {@const hasEmblem = unit.emblemsEquipped.length > 0}

                <div class="relative flex flex-col items-center w-13 shrink-0">
                  <!-- Champion Portrait (Clean cost border, no double border) -->
                  <div class="relative h-11 w-11 rounded-lg overflow-hidden border-2 {getCostBorderColor(unit.cost)} bg-[#160e33] shrink-0">
                    <img
                      src={unit.image_url}
                      alt={unit.name}
                      class="h-full w-full object-cover"
                      on:error={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.src = getTftChampionFallback(unit.name);
                      }}
                    />
                  </div>

                  <!-- Name Slot -->
                  <div class="h-3.5 flex items-center justify-center w-full mt-1">
                    <span class="text-[10px] font-bold {isAddedUnit ? 'text-emerald-300' : 'text-slate-200'} truncate text-center max-w-[52px]" title={unit.name}>
                      {unit.name}
                    </span>
                  </div>

                  <!-- Items / Status Slot (Regular Items + Equipped Emblems) -->
                  <div class="flex items-center justify-center gap-0.5 h-4 mt-0.5">
                    {#if unit.items && unit.items.length > 0}
                      {#each unit.items as item}
                        <img
                          src={item.image_url || getTftItemIcon(item.id || item.name)}
                          alt={item.name}
                          class="h-3.5 w-3.5 rounded object-cover border border-purple-500/30"
                          title={item.name}
                          on:error={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.src = getTftItemIcon(item.id || item.name);
                          }}
                        />
                      {/each}
                    {/if}

                    {#if unit.emblemsEquipped && unit.emblemsEquipped.length > 0}
                      {#each unit.emblemsEquipped as eqEmb}
                        <img
                          src={eqEmb.icon}
                          alt={eqEmb.name}
                          class="h-3.5 w-3.5 rounded object-cover border border-amber-400/70"
                          title="{eqEmb.name} (Emblem)"
                          on:error={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.src = getTftItemIcon(eqEmb.id);
                          }}
                        />
                      {/each}
                    {/if}

                    {#if isAddedUnit && (!unit.items || unit.items.length === 0) && (!unit.emblemsEquipped || unit.emblemsEquipped.length === 0)}
                      <span class="rounded bg-emerald-500/25 border border-emerald-400/50 px-1 text-[8px] font-black uppercase text-emerald-300 leading-tight">
                        NEW
                      </span>
                    {/if}
                  </div>
                </div>
              {/each}

              <!-- Cut Units Comparison (if 1 or 2 units were swapped out) -->
              {#if activeVariant.cuts.length > 0}
                <div class="flex items-start gap-1.5 pl-2.5 ml-1 border-l border-purple-500/20">
                  {#each activeVariant.cuts as cut}
                    <div class="flex flex-col items-center w-12 shrink-0 opacity-55">
                      <div class="relative h-11 w-11 rounded-lg overflow-hidden border border-red-500/40 bg-red-950/20 shrink-0">
                        <img
                          src={cut.image_url}
                          alt={cut.name}
                          class="h-full w-full object-cover grayscale"
                          on:error={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.src = getTftChampionFallback(cut.name);
                          }}
                        />
                        <div class="absolute inset-0 flex items-center justify-center bg-black/50 text-red-400 font-black text-xs">
                          ✕
                        </div>
                      </div>
                      <div class="h-3.5 flex items-center justify-center w-full mt-1">
                        <span class="text-[9px] text-slate-400 truncate max-w-[46px]">{cut.name}</span>
                      </div>
                      <div class="flex items-center justify-center h-4 mt-0.5">
                        <span class="rounded bg-red-500/20 border border-red-400/40 px-1 text-[8px] font-black text-red-300 leading-tight">
                          CUT
                        </span>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Active Traits Summary -->
            <div class="flex flex-wrap items-center gap-1.5 xl:justify-end xl:max-w-[360px]">
              {#each activeVariant.traits as trait}
                <div class="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition {trait.breakpointHit ? 'bg-amber-500/20 border border-amber-400/50 text-amber-200' : trait.isUpgraded ? 'bg-purple-500/20 border border-purple-400/50 text-purple-200' : 'bg-[#160e33] border border-purple-500/25 text-slate-300'}">
                  <img
                    src={getTftTraitIcon(trait.name)}
                    alt={trait.name}
                    class="h-3.5 w-3.5 object-contain"
                    on:error={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  <span class="font-extrabold {trait.breakpointHit ? 'text-amber-300' : 'text-white'}">
                    {trait.count}
                  </span>
                  <span>{trait.name}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
