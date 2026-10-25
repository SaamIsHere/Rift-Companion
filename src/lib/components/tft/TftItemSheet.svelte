<script lang="ts">
  import type { TftItem } from "../../types";
  import {
    tftItems,
    tftInventoryComponents,
    addInventoryComponent,
    removeInventoryComponent,
    clearInventoryComponents,
    tftSearchQuery,
  } from "../../stores/tft";
  import { getTftItemIcon } from "../../utils/tftAssets";

  $: components = $tftItems.filter((i) => i.is_component);
  $: completedItems = $tftItems.filter((i) => !i.is_component);

  // Bench craft calculator: Check which completed items can be forged from a given component list
  function canCraft(recipe: string[] | undefined, inventory: string[]): boolean {
    if (!recipe || recipe.length < 2) return false;
    const invCopy = [...inventory];
    for (const compId of recipe) {
      const idx = invCopy.indexOf(compId);
      if (idx === -1) return false;
      invCopy.splice(idx, 1);
    }
    return true;
  }

  // Planned / Built items state (list of item IDs chosen by the user)
  let plannedItemIds: string[] = [];

  // When $tftInventoryComponents changes, ensure planned items are still feasible
  $: {
    let invTest = [...$tftInventoryComponents];
    let validPlanned: string[] = [];
    for (const pId of plannedItemIds) {
      const item = completedItems.find((i) => i.id === pId);
      if (!item || !item.recipe || item.recipe.length < 2) continue;
      let ok = true;
      let temp = [...invTest];
      for (const rId of item.recipe) {
        const idx = temp.indexOf(rId);
        if (idx === -1) {
          ok = false;
          break;
        }
        temp.splice(idx, 1);
      }
      if (ok) {
        invTest = temp;
        validPlanned.push(pId);
      }
    }
    if (validPlanned.length !== plannedItemIds.length) {
      plannedItemIds = validPlanned;
    }
  }

  // Calculate remaining components on bench after reserving planned items
  let remainingComponents: string[] = [];
  $: {
    let leftovers = [...$tftInventoryComponents];
    for (const pId of plannedItemIds) {
      const item = completedItems.find((i) => i.id === pId);
      if (item && item.recipe) {
        for (const rId of item.recipe) {
          const idx = leftovers.indexOf(rId);
          if (idx !== -1) {
            leftovers.splice(idx, 1);
          }
        }
      }
    }
    remainingComponents = leftovers;
  }

  // What can still be crafted from remaining components
  $: craftableFromRemaining = completedItems.filter((item) =>
    canCraft(item.recipe, remainingComponents)
  );

  // Objects for planned items
  $: plannedItemsList = plannedItemIds
    .map((id) => completedItems.find((i) => i.id === id))
    .filter((i): i is TftItem => i !== undefined);

  function planItem(itemId: string) {
    const item = completedItems.find((i) => i.id === itemId);
    if (!item || !item.recipe) return;
    if (canCraft(item.recipe, remainingComponents)) {
      plannedItemIds = [...plannedItemIds, itemId];
    }
  }

  function refundItem(index: number) {
    plannedItemIds = plannedItemIds.filter((_, i) => i !== index);
  }

  function handleClearAll() {
    plannedItemIds = [];
    clearInventoryComponents();
  }

  function resetPlannedOnly() {
    plannedItemIds = [];
  }

  type CatalogCategory = "all" | "standard" | "radiant" | "artifact" | "emblem";
  let selectedCategory: CatalogCategory = "all";
  let selectedComponentFilter: string | null = null;

  function getItemCategory(item: TftItem): "standard" | "radiant" | "artifact" | "emblem" {
    if (item.name.toLowerCase().includes("radiant") || item.id.toLowerCase().includes("radiant")) return "radiant";
    if (item.id.toLowerCase().includes("artifact") || item.name.toLowerCase().includes("artifact")) return "artifact";
    if (item.name.toLowerCase().includes("emblem") || item.is_spatula) return "emblem";
    return "standard";
  }

  $: filteredCompletedItems = completedItems.filter((item) => {
    const cat = getItemCategory(item);
    if (selectedCategory !== "all" && cat !== selectedCategory) {
      return false;
    }
    // Search query
    const q = $tftSearchQuery.trim().toLowerCase();
    if (q && !item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
      return false;
    }
    // Component filter
    if (selectedComponentFilter && item.recipe && !item.recipe.includes(selectedComponentFilter)) {
      return false;
    }
    return true;
  });

  function getComponentById(id: string): TftItem | undefined {
    return components.find((c) => c.id === id);
  }

  $: componentCounts = $tftInventoryComponents.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  function handleComponentLeftClick(compId: string) {
    addInventoryComponent(compId);
  }

  function handleComponentRightClick(compId: string, event?: MouseEvent) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const idx = $tftInventoryComponents.lastIndexOf(compId);
    if (idx !== -1) {
      removeInventoryComponent(idx);
    }
  }
</script>

<div class="flex flex-col gap-6 w-full animate-fade-in select-none">
  <!-- Interactive Bench Crafting & Simulation Section -->
  <div class="rounded-xl border border-purple-500/25 bg-void-950/80 p-5 backdrop-blur-md shadow-xl">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-purple-500/15 pb-4 mb-4">
      <div>
        <h2 class="text-sm font-black uppercase tracking-wider text-white">
          Item Builder & Simulation
        </h2>
        <p class="text-xs text-purple-300/70">
          Click component icons to add them to your bench. Click any completed item to build it and simulate remaining leftovers.
        </p>
      </div>

      <div class="flex items-center gap-2 self-start md:self-auto">
        {#if plannedItemIds.length > 0}
          <button
            type="button"
            on:click={resetPlannedOnly}
            class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
          >
            Reset Built ({plannedItemIds.length})
          </button>
        {/if}
        {#if $tftInventoryComponents.length > 0}
          <button
            type="button"
            on:click={handleClearAll}
            class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300 transition hover:bg-red-500/20"
          >
            Clear Bench ({$tftInventoryComponents.length})
          </button>
        {/if}
      </div>
    </div>

    <!-- Base Components Palette with in-place badge counter & right-click decrement -->
    <div class="mb-5">
      <div class="flex items-center justify-between mb-2">
        <div class="text-[10px] font-bold uppercase tracking-wider text-purple-300/60">
          Components Palette
        </div>
        <span class="text-[10px] text-purple-300/50">
          Left-click: +1 | Right-click: -1
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        {#each components as comp (comp.id)}
          {@const count = componentCounts[comp.id] ?? 0}
          <button
            type="button"
            on:click={() => handleComponentLeftClick(comp.id)}
            on:contextmenu|preventDefault|stopPropagation={(e) => handleComponentRightClick(comp.id, e)}
            class="group relative flex h-11 w-11 items-center justify-center rounded-xl border {count > 0 ? 'border-purple-400 bg-purple-900/40' : 'border-purple-500/25 bg-void-900/90'} p-1 transition-all duration-150 hover:scale-105 hover:border-purple-400 active:scale-95 focus:outline-none"
            title="{comp.name} (Count: {count} - Left-click: +1, Right-click: -1)"
          >
            <img
              src={getTftItemIcon(comp.id)}
              alt={comp.name}
              class="h-8 w-8 rounded-lg object-cover"
              on:error={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.src = comp.image_url;
              }}
            />

            <!-- In-place Counter Badge (e.g. ×1, ×2) -->
            {#if count > 0}
              <span
                class="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 border border-purple-300 px-1 text-[9px] font-black text-white shadow-sm"
              >
                ×{count}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- PLANNED / BUILT ITEMS TRAY (Interactive Reservation) -->
    {#if plannedItemsList.length > 0}
      <div class="rounded-xl border border-purple-500/30 bg-void-950/90 p-3.5 mb-5 shadow-xl backdrop-blur-md animate-fade-in">
        <div class="flex items-center justify-between mb-2.5 border-b border-purple-500/15 pb-2">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-emerald-400"></span>
            <span class="text-xs font-black uppercase tracking-wider text-purple-200">
              Planned Items Queue ({plannedItemsList.length})
            </span>
          </div>
          <span class="text-[10px] text-purple-300/60 font-medium">
            Click any item to refund
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {#each plannedItemsList as item, idx}
            <button
              type="button"
              on:click={() => refundItem(idx)}
              class="group flex items-center justify-between rounded-lg border border-purple-500/25 bg-void-900/80 p-2 text-left transition hover:border-red-400/50 hover:bg-red-950/20 active:scale-95 focus:outline-none"
              title="Click to refund {item.name}"
            >
              <div class="flex items-center gap-2 min-w-0">
                <img
                  src={getTftItemIcon(item.id)}
                  alt={item.name}
                  class="h-8 w-8 shrink-0 rounded-md object-cover ring-1 ring-purple-400/40 shadow group-hover:ring-red-400/50"
                  on:error={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.src = item.image_url;
                  }}
                />
                <div class="min-w-0">
                  <div class="text-xs font-bold text-white group-hover:text-red-200 transition truncate">
                    {item.name}
                  </div>
                  <div class="flex items-center gap-1 text-[9px] text-purple-300/70 truncate mt-0.5">
                    {#if item.recipe}
                      {#each item.recipe as rId, rIdx}
                        {@const rc = getComponentById(rId)}
                        <span class="truncate">{rc ? rc.name : rId}</span>
                        {#if rIdx === 0}<span class="text-purple-400 font-bold">+</span>{/if}
                      {/each}
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Refund hint icon -->
              <span class="shrink-0 ml-1.5 rounded bg-white/[0.04] border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-purple-300/70 transition group-hover:border-red-400/40 group-hover:bg-red-500/20 group-hover:text-red-300">
                ✕
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- REMAINING LEFTOVER COMPONENTS STRIP -->
    {#if $tftInventoryComponents.length > 0}
      <div class="rounded-lg border border-purple-500/20 bg-void-950/70 p-3 mb-5">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70">
            Remaining Leftovers on Bench ({remainingComponents.length})
          </span>
          {#if plannedItemsList.length > 0}
            <span class="text-[10px] text-purple-300/50">
              ({$tftInventoryComponents.length - remainingComponents.length} used in planned items)
            </span>
          {/if}
        </div>

        {#if remainingComponents.length === 0}
          <div class="text-xs text-amber-300/80 italic font-medium">
            All bench components are currently allocated to your planned items! Add more components or refund an item.
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2">
            {#each remainingComponents as compId}
              {@const comp = getComponentById(compId)}
              <div
                class="flex items-center gap-1.5 rounded-md border border-purple-500/25 bg-void-900/90 px-2 py-1 shadow-sm"
              >
                {#if comp}
                  <img
                    src={getTftItemIcon(comp.id)}
                    alt={comp.name}
                    class="h-5 w-5 rounded object-cover"
                    on:error={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = comp.image_url;
                    }}
                  />
                  <span class="text-xs font-semibold text-slate-200">{comp.name}</span>
                {:else}
                  <span class="text-xs font-semibold text-slate-200">{compId}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- CRAFTABLE FROM REMAINING LEFTOVERS -->
    {#if remainingComponents.length >= 2}
      <div class="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 animate-fade-in shadow-lg">
        <div class="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black uppercase tracking-wider text-emerald-300">
              Craftable from Leftovers ({craftableFromRemaining.length})
            </span>
          </div>
          <span class="text-[10px] text-emerald-300/70 font-semibold">
            Click any item to build & simulate remaining leftovers
          </span>
        </div>

        {#if craftableFromRemaining.length === 0}
          <div class="text-xs text-slate-300">
            No completed items can be forged with current leftover components. Add more components to forge.
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each craftableFromRemaining as item}
              <button
                type="button"
                on:click={() => planItem(item.id)}
                class="group flex items-center justify-between rounded-lg border border-emerald-500/30 bg-void-950/90 p-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-950/40 hover:scale-102 hover:shadow-lg focus:outline-none"
                title="Click to build {item.name}"
              >
                <div class="flex items-center gap-2.5">
                  <img
                    src={getTftItemIcon(item.id)}
                    alt={item.name}
                    class="h-9 w-9 rounded-md object-cover ring-2 ring-emerald-400/50 shadow"
                    on:error={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = item.image_url;
                    }}
                  />
                  <div>
                    <div class="text-xs font-bold text-white group-hover:text-emerald-300 transition">
                      {item.name}
                    </div>
                    <div class="flex items-center gap-1 text-[10px] text-purple-300/80 mt-0.5">
                      {#if item.recipe}
                        {#each item.recipe as rId, rIdx}
                          {@const rc = getComponentById(rId)}
                          <span>{rc ? rc.name : rId}</span>
                          {#if rIdx === 0}<span class="text-purple-400 font-bold">+</span>{/if}
                        {/each}
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Build action badge -->
                <span class="rounded bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 transition group-hover:bg-emerald-500 group-hover:text-white">
                  + Build
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Complete Items Catalog Section -->
  <div class="rounded-xl border border-purple-500/20 bg-void-950/80 p-5 backdrop-blur-md shadow-lg">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-purple-500/15 pb-4 mb-4">
      <div>
        <h3 class="text-sm font-black uppercase tracking-wider text-white">
          Item Catalog & Cheat-Sheet
        </h3>
        <p class="text-xs text-purple-300/70">
          Complete recipe matrix and stats for all completed items.
        </p>
      </div>

      <!-- Category & Component Filter controls -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <!-- Category switch tabs -->
        <div class="flex items-center gap-1 rounded-lg border border-purple-500/20 bg-void-900/60 p-1">
          {#each [
            { id: 'all', label: 'All' },
            { id: 'standard', label: 'Standard' },
            { id: 'radiant', label: 'Radiant' },
            { id: 'artifact', label: 'Artifact' },
            { id: 'emblem', label: 'Emblems' },
          ] as cat}
            <button
              type="button"
              on:click={() => {
                selectedCategory = cat.id as CatalogCategory;
                if (cat.id !== 'all' && cat.id !== 'standard') {
                  selectedComponentFilter = null;
                }
              }}
              class="rounded px-2 py-1 text-[11px] font-bold tracking-wide transition {selectedCategory === cat.id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'}"
            >
              {cat.label}
            </button>
          {/each}
        </div>

        <!-- Component filter buttons (when All or Standard active) - Icon-only for maximum compactness -->
        {#if selectedCategory === 'all' || selectedCategory === 'standard'}
          <div class="flex items-center gap-1 overflow-x-auto max-w-full py-0.5">
            <button
              type="button"
              on:click={() => (selectedComponentFilter = null)}
              class="rounded-md px-2 py-1 text-[11px] font-bold transition border {selectedComponentFilter === null
                ? 'bg-purple-600 text-white border-purple-400/50'
                : 'border border-purple-500/20 bg-void-900/60 text-slate-400 hover:text-white'}"
            >
              All
            </button>
            {#each components as comp}
              <button
                type="button"
                on:click={() => (selectedComponentFilter = comp.id)}
                class="flex items-center justify-center rounded-md p-1 transition border {selectedComponentFilter === comp.id
                  ? 'bg-purple-600/40 border-purple-400 text-white'
                  : 'border border-purple-500/20 bg-void-900/60 hover:bg-white/[0.08] hover:border-purple-400/40'}"
                title="{comp.name}"
              >
                <img
                  src={getTftItemIcon(comp.id)}
                  alt={comp.name}
                  class="h-5 w-5 rounded object-cover"
                  on:error={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.src = comp.image_url;
                  }}
                />
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Items Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {#each filteredCompletedItems as item (item.id)}
        {@const itemCat = getItemCategory(item)}
        {@const isRadiant = itemCat === 'radiant'}
        {@const isArtifact = itemCat === 'artifact'}
        {@const isEmblem = itemCat === 'emblem'}
        <div class="flex flex-col justify-between rounded-lg border {isRadiant ? 'border-amber-500/30 bg-amber-950/10' : isArtifact ? 'border-cyan-500/30 bg-cyan-950/10' : isEmblem ? 'border-purple-500/30 bg-purple-950/10' : 'border-purple-500/15 bg-white/[0.02]'} p-2.5 transition hover:border-purple-400/40 hover:bg-white/[0.04]">
          <div>
            <div class="flex items-start justify-between gap-2 mb-1.5">
              <div class="flex items-center gap-2 min-w-0">
                <img
                  src={getTftItemIcon(item.id)}
                  alt={item.name}
                  class="h-8 w-8 shrink-0 rounded-md object-cover ring-1 {isRadiant ? 'ring-amber-400/50' : isArtifact ? 'ring-cyan-400/50' : isEmblem ? 'ring-purple-400/50' : 'ring-purple-400/30'} shadow"
                  on:error={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.src = item.image_url;
                  }}
                />
                <div class="min-w-0">
                  <h4 class="text-xs font-bold text-white truncate" title={item.name}>{item.name}</h4>
                  {#if item.stats}
                    <div class="text-[9px] font-semibold {isRadiant ? 'text-amber-300' : isArtifact ? 'text-cyan-300' : 'text-emerald-400'} truncate">{item.stats}</div>
                  {/if}
                </div>
              </div>

              <!-- Item Type Pill (No +Build button) -->
              {#if isRadiant}
                <span class="shrink-0 rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                  ✨ Radiant
                </span>
              {:else if isArtifact}
                <span class="shrink-0 rounded bg-cyan-500/20 border border-cyan-400/40 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                  ⚡ Artifact
                </span>
              {:else if isEmblem}
                <span class="shrink-0 rounded bg-purple-500/20 border border-purple-400/40 px-1.5 py-0.5 text-[9px] font-bold text-purple-300">
                  ✦ Emblem
                </span>
              {/if}
            </div>

            <p class="text-[11px] text-slate-300 leading-snug line-clamp-2 mb-2">
              {item.description}
            </p>
          </div>

          <!-- Recipe Footer -->
          <div class="border-t border-purple-500/15 pt-1.5 mt-auto flex items-center justify-between gap-1.5 text-[10px]">
            <span class="text-[9px] font-bold uppercase tracking-wider text-purple-300/60 shrink-0">Recipe:</span>
            <div class="flex items-center gap-1 shrink-0">
              {#if item.recipe && item.recipe.length > 0}
                {#each item.recipe as rId, rIdx}
                  {@const rc = getComponentById(rId)}
                  {#if rc}
                    <div
                      class="flex items-center gap-1 rounded bg-void-900/90 border border-purple-500/20 px-1 py-0.5"
                      title={rc.name}
                    >
                      <img
                        src={getTftItemIcon(rc.id)}
                        alt={rc.name}
                        class="h-3.5 w-3.5 rounded object-cover"
                        on:error={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.src = rc.image_url;
                        }}
                      />
                      <span class="text-[9px] font-medium text-slate-300 max-w-[65px] truncate">{rc.name}</span>
                    </div>
                  {/if}
                  {#if rIdx === 0}<span class="text-[10px] text-purple-400 font-bold">+</span>{/if}
                {/each}
              {:else if isRadiant}
                <span class="text-[9px] font-semibold text-amber-300/90">Radiant Blessing / Armory</span>
              {:else if isArtifact}
                <span class="text-[9px] font-semibold text-cyan-300/90">Artifact Anvil / Forge</span>
              {:else if isEmblem}
                <span class="text-[9px] font-semibold text-purple-300/90">Tome / Augment Special</span>
              {:else}
                <span class="text-[9px] font-semibold text-slate-400">Special Drop</span>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
