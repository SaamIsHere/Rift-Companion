<script lang="ts">
  import { tick, onMount, onDestroy } from "svelte";
  import type { TftMetaDeck, TftUnit } from "../../types";
  import { tftMetaDecks, tftSearchQuery, tftSelectedFilterTokens } from "../../stores/tft";
  import {
    getTftChampionIcon,
    getTftChampionFallback,
    getTftItemIcon,
    getTftTraitIcon,
    getTftChampionCost,
    getTftItemRecipe,
    isTftTankItem,
    type TftComponentItem,
  } from "../../utils/tftAssets";
  import TftHexBoard from "./TftHexBoard.svelte";

  // Currently expanded comp ID (null if none expanded)
  let expandedDeckId: string | null = null;
  // Which deck button in the row to insert the expansion card after
  let expandedAfterDeckId: string | null = null;
  // Currently hovered comp for portaled popover preview
  let hoveredDeck: TftMetaDeck | null = null;
  let hoveredAnchorEl: HTMLElement | null = null;
  let popoverEl: HTMLDivElement | null = null;
  let popoverPos = { top: 0, left: 0, visible: false };

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  async function updatePopoverPosition() {
    if (!hoveredDeck || !hoveredAnchorEl) return;
    await tick();
    if (!hoveredDeck || !hoveredAnchorEl || !popoverEl) return;

    const anchor = hoveredAnchorEl.getBoundingClientRect();
    const popWidth = popoverEl.offsetWidth || 288;
    const popHeight = popoverEl.offsetHeight || 240;
    const margin = 12;
    const minTop = 52; // Always stay below TopNavBar (44px)

    const spaceBelow = window.innerHeight - anchor.bottom - margin;
    const spaceAbove = anchor.top - minTop;

    let top: number;
    if (spaceBelow >= popHeight || spaceBelow >= spaceAbove) {
      top = Math.min(anchor.bottom + 10, window.innerHeight - popHeight - margin);
    } else {
      top = Math.max(minTop, anchor.top - popHeight - 10);
    }
    top = Math.max(minTop, top);

    const idealLeft = anchor.left + anchor.width / 2 - popWidth / 2;
    const left = Math.max(margin, Math.min(idealLeft, window.innerWidth - popWidth - margin));

    popoverPos = { top, left, visible: true };
  }

  function showPopover(deck: TftMetaDeck, el: HTMLElement) {
    hoveredDeck = deck;
    hoveredAnchorEl = el;
    popoverPos = { ...popoverPos, visible: false };
    void updatePopoverPosition();
  }

  function hidePopover(deck?: TftMetaDeck) {
    if (deck && hoveredDeck !== deck) return;
    hoveredDeck = null;
    hoveredAnchorEl = null;
    popoverPos = { top: 0, left: 0, visible: false };
  }

  function updateExpandedRowPosition() {
    if (!expandedDeckId) {
      expandedAfterDeckId = null;
      return;
    }
    const targetEl = document.getElementById(`deck-btn-${expandedDeckId}`);
    if (!targetEl) {
      expandedAfterDeckId = expandedDeckId;
      return;
    }

    const group = groupedTiers.find((g) => g.decks.some((d) => d.id === expandedDeckId));
    if (!group) {
      expandedAfterDeckId = expandedDeckId;
      return;
    }

    const targetTop = targetEl.offsetTop;
    const sameRowDecks: string[] = [];
    for (const d of group.decks) {
      const el = document.getElementById(`deck-btn-${d.id}`);
      if (el && Math.abs(el.offsetTop - targetTop) < 20) {
        sameRowDecks.push(d.id);
      }
    }

    if (sameRowDecks.length > 0) {
      expandedAfterDeckId = sameRowDecks[sameRowDecks.length - 1];
    } else {
      expandedAfterDeckId = expandedDeckId;
    }
  }

  function toggleExpand(id: string) {
    if (expandedDeckId === id) {
      expandedDeckId = null;
      expandedAfterDeckId = null;
      return;
    }

    // Determine row position from resting element geometry BEFORE expanding
    const targetEl = document.getElementById(`deck-btn-${id}`);
    const group = groupedTiers.find((g) => g.decks.some((d) => d.id === id));
    if (targetEl && group) {
      const targetTop = targetEl.offsetTop;
      const sameRowDecks: string[] = [];
      for (const d of group.decks) {
        const el = document.getElementById(`deck-btn-${d.id}`);
        if (el && Math.abs(el.offsetTop - targetTop) < 20) {
          sameRowDecks.push(d.id);
        }
      }
      if (sameRowDecks.length > 0) {
        expandedAfterDeckId = sameRowDecks[sameRowDecks.length - 1];
      } else {
        expandedAfterDeckId = id;
      }
    } else {
      expandedAfterDeckId = id;
    }

    expandedDeckId = id;
  }

  onMount(() => {
    window.addEventListener("resize", updateExpandedRowPosition);
  });

  onDestroy(() => {
    window.removeEventListener("resize", updateExpandedRowPosition);
    hidePopover();
  });

  function getUnitCost(unit: TftUnit): number {
    return getTftChampionCost(unit.name, unit.cost);
  }

  function evaluateUnitRole(unit: TftUnit): { offensive: number; defensive: number; isTank: boolean } {
    const items = unit.items || [];
    let offensive = 0;
    let defensive = 0;
    for (const it of items) {
      if (isTftTankItem(it.id || it.name)) {
        defensive++;
      } else {
        offensive++;
      }
    }
    return {
      offensive,
      defensive,
      isTank: defensive > offensive || (defensive >= 1 && offensive === 0),
    };
  }

  /**
   * Algorithmic, maintenance-free true Carry detector:
   * Distinguishes damage carries from pure tanks by scoring items and stats.
   * Pure tanks (e.g. Maokai in "Riftbeast Maokai") are never falsely chosen as carries.
   */
  function getMainCarry(deck: TftMetaDeck): TftUnit | undefined {
    if (!deck.units || deck.units.length === 0) return undefined;

    const deckNameLower = (deck.name || "").toLowerCase();
    const scoredUnits = deck.units.map((u) => {
      const role = evaluateUnitRole(u);
      const inTitle = deckNameLower.includes(u.name.toLowerCase());
      return { unit: u, ...role, inTitle };
    });

    // 1. Offense units whose name is explicitly in the title and NOT a pure tank (e.g. "Elderwood Draven" -> Draven)
    const titleCarries = scoredUnits.filter(
      (su) => su.inTitle && !su.isTank && (su.unit.is_carry || su.offensive > 0)
    );
    if (titleCarries.length > 0) {
      titleCarries.sort((a, b) => b.offensive - a.offensive || getUnitCost(b.unit) - getUnitCost(a.unit));
      return titleCarries[0].unit;
    }

    // 2. Any true offensive carries (not tanks) with offensive damage items
    const offensiveCarries = scoredUnits.filter((su) => !su.isTank && su.offensive > 0);
    if (offensiveCarries.length > 0) {
      offensiveCarries.sort((a, b) => {
        if (b.offensive !== a.offensive) return b.offensive - a.offensive;
        if (getUnitCost(b.unit) !== getUnitCost(a.unit)) return getUnitCost(b.unit) - getUnitCost(a.unit);
        return (b.unit.star || 2) - (a.unit.star || 2);
      });
      return offensiveCarries[0].unit;
    }

    // 3. Any units marked as carry that are not pure tanks
    const nonTankCarries = scoredUnits.filter((su) => !su.isTank && su.unit.is_carry);
    if (nonTankCarries.length > 0) {
      nonTankCarries.sort((a, b) => getUnitCost(b.unit) - getUnitCost(a.unit));
      return nonTankCarries[0].unit;
    }

    // 4. Fallback: Title champion (even if tank) or first unit
    const titleAny = scoredUnits.filter((su) => su.inTitle);
    if (titleAny.length > 0) return titleAny[0].unit;

    return deck.units[0];
  }

  /**
   * Identifies the titular representative champion for the Tier List icon:
   * 1. Extracts the champion explicitly named in the comp title (e.g. "Riftbeast Maokai" -> Maokai).
   * 2. Fallback: If no champion is named in the title (e.g. "Riftbeast Reroll"), uses the algorithmic Main Carry.
   */
  function getCompRepresentative(deck: TftMetaDeck): TftUnit | undefined {
    if (!deck.units || deck.units.length === 0) return undefined;
    const deckNameLower = (deck.name || "").toLowerCase().replace(/[^a-z0-9]/g, " ");

    const titleMatches = deck.units
      .filter((u) => {
        const uNameLower = u.name.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        return deckNameLower.includes(uNameLower);
      })
      .sort((a, b) => b.name.length - a.name.length);

    if (titleMatches.length > 0) {
      return titleMatches[0];
    }

    return getMainCarry(deck) || deck.units[0];
  }

  interface PrioritizedUnit {
    unit: TftUnit;
    roleType: "carry" | "tank" | "flex";
    priorityRank: number;
    priorityTitle: string;
    badgeClass: string;
  }

  function getPrioritizedUnits(deck: TftMetaDeck): PrioritizedUnit[] {
    const mainCarry = getMainCarry(deck);
    const result: PrioritizedUnit[] = [];

    // 1. Main Carry (#1 Priority)
    if (mainCarry) {
      result.push({
        unit: mainCarry,
        roleType: "carry",
        priorityRank: 1,
        priorityTitle: "Main Carry",
        badgeClass: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      });
    }

    // 2. Main Tank (#2 Priority)
    const mainCarryName = mainCarry?.name.toLowerCase();
    const potentialTanks = deck.units.filter((u) => u.name.toLowerCase() !== mainCarryName);

    const sortedTanks = [...potentialTanks].sort((a, b) => {
      const aTankItems = (a.items || []).filter((i) => isTftTankItem(i.id || i.name)).length;
      const bTankItems = (b.items || []).filter((i) => isTftTankItem(i.id || i.name)).length;
      if (bTankItems !== aTankItems) return bTankItems - aTankItems;
      const aItems = a.items?.length || 0;
      const bItems = b.items?.length || 0;
      if (bItems !== aItems) return bItems - aItems;
      const aFront = a.cell?.y === 4 ? 1 : 0;
      const bFront = b.cell?.y === 4 ? 1 : 0;
      if (bFront !== aFront) return bFront - aFront;
      return getUnitCost(b) - getUnitCost(a);
    });

    const mainTank = sortedTanks[0];
    if (mainTank) {
      result.push({
        unit: mainTank,
        roleType: "tank",
        priorityRank: 2,
        priorityTitle: "Main Tank",
        badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
      });
    }

    // 3. Secondary Carries & Utility (#3+ Priority)
    const mainTankName = mainTank?.name.toLowerCase();
    const remaining = deck.units
      .filter(
        (u) =>
          u.name.toLowerCase() !== mainCarryName &&
          u.name.toLowerCase() !== mainTankName &&
          u.items &&
          u.items.length > 0
      )
      .sort((a, b) => (b.items?.length || 0) - (a.items?.length || 0));

    remaining.forEach((u, i) => {
      result.push({
        unit: u,
        roleType: "flex",
        priorityRank: 3 + i,
        priorityTitle: "Secondary",
        badgeClass: "bg-purple-500/20 text-purple-300 border-purple-400/40",
      });
    });

    return result;
  }

  interface UnitItemRecipe {
    itemName: string;
    itemId: string;
    components: [TftComponentItem, TftComponentItem] | null;
  }

  interface UnitItemSection {
    unit: TftUnit;
    roleTitle: string;
    badgeClass: string;
    recipes: UnitItemRecipe[];
  }

  function getCompItemPriorities(deck: TftMetaDeck): {
    groups: UnitItemSection[];
    componentCounts: Array<{ component: TftComponentItem; count: number }>;
  } {
    const prioritized = getPrioritizedUnits(deck);
    const groups: UnitItemSection[] = [];
    const compCounts = new Map<string, { component: TftComponentItem; count: number }>();

    for (const p of prioritized) {
      if (!p.unit.items || p.unit.items.length === 0) continue;
      const recipes: UnitItemRecipe[] = [];
      for (const it of p.unit.items) {
        const recipe = getTftItemRecipe(it.id || it.name);
        recipes.push({
          itemName: it.name,
          itemId: it.id,
          components: recipe,
        });
        if (recipe) {
          for (const comp of recipe) {
            const existing = compCounts.get(comp.id) || { component: comp, count: 0 };
            existing.count += 1;
            compCounts.set(comp.id, existing);
          }
        }
      }

      groups.push({
        unit: p.unit,
        roleTitle: p.priorityTitle,
        badgeClass: p.badgeClass,
        recipes,
      });
    }

    const componentCounts = Array.from(compCounts.values()).sort((a, b) => b.count - a.count);
    return { groups, componentCounts };
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

  function getCostBadgeColor(cost: number): string {
    switch (cost) {
      case 1:
        return "text-[#94a3b8]";
      case 2:
        return "text-[#10b981]";
      case 3:
        return "text-[#3b82f6]";
      case 4:
        return "text-[#c084fc]";
      case 5:
        return "text-[#fbbf24]";
      default:
        return "text-[#94a3b8]";
    }
  }

  interface TierStyle {
    label: string;
    gradient: string;
    shadow: string;
    text: string;
    badgeBg: string;
  }

  function getTierConfig(tier: string): TierStyle {
    switch (tier.toUpperCase()) {
      case "S":
        return {
          label: "S",
          gradient: "bg-gradient-to-b from-[#FE3E4B] to-[#fb1737]",
          shadow: "shadow-md",
          text: "text-white",
          badgeBg: "bg-rose-500/20 border-rose-400/40 text-rose-300",
        };
      case "A":
        return {
          label: "A",
          gradient: "bg-gradient-to-b from-[#ff8d1b] to-[#fd551b]",
          shadow: "shadow-md",
          text: "text-white",
          badgeBg: "bg-orange-500/20 border-orange-400/40 text-orange-300",
        };
      case "B":
        return {
          label: "B",
          gradient: "bg-gradient-to-b from-[#f59e0b] to-[#d97706]",
          shadow: "shadow-md",
          text: "text-white",
          badgeBg: "bg-amber-500/20 border-amber-400/40 text-amber-300",
        };
      case "C":
        return {
          label: "C",
          gradient: "bg-gradient-to-b from-[#3b82f6] to-[#2563eb]",
          shadow: "shadow-md",
          text: "text-white",
          badgeBg: "bg-blue-500/20 border-blue-400/40 text-blue-300",
        };
      case "D":
      default:
        return {
          label: "D",
          gradient: "bg-gradient-to-b from-[#64748b] to-[#475569]",
          shadow: "shadow-md",
          text: "text-white",
          badgeBg: "bg-slate-500/20 border-slate-400/40 text-slate-300",
        };
    }
  }

  const TIERS_ORDER = ["S", "A", "B", "C", "D"];

  function normalizeKey(str: string): string {
    return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  $: filteredDecks = $tftMetaDecks.filter((deck) => {
    // 1. Check selected filter tokens (must match ALL selected tokens)
    if ($tftSelectedFilterTokens.length > 0) {
      const unitTokens = $tftSelectedFilterTokens.filter((t) => t.type === "unit");
      const itemTokens = $tftSelectedFilterTokens.filter((t) => t.type === "item");

      // All unit tokens must be present in this deck
      const hasAllUnits = unitTokens.every((uTok) => {
        const uKey = normalizeKey(uTok.name);
        return deck.units.some((u) => {
          const nameKey = normalizeKey(u.name);
          const idKey = normalizeKey(u.id);
          return (
            nameKey === uKey ||
            idKey === uKey ||
            nameKey.includes(uKey) ||
            uKey.includes(nameKey)
          );
        });
      });
      if (!hasAllUnits) return false;

      // If both Champion and Item tokens are selected:
      if (unitTokens.length > 0 && itemTokens.length > 0) {
        // Specifically check if the selected champion has the selected items equipped
        const unitHoldsItems = unitTokens.some((uTok) => {
          const uKey = normalizeKey(uTok.name);
          const unitInDeck = deck.units.find((u) => {
            const nameKey = normalizeKey(u.name);
            const idKey = normalizeKey(u.id);
            return (
              nameKey === uKey ||
              idKey === uKey ||
              nameKey.includes(uKey) ||
              uKey.includes(nameKey)
            );
          });
          if (!unitInDeck || !unitInDeck.items || unitInDeck.items.length === 0) return false;
          return itemTokens.every((iTok) => {
            const iKey = normalizeKey(iTok.name);
            return unitInDeck.items.some((it) => {
              const itKey = normalizeKey(it.name);
              const itId = normalizeKey(it.id);
              return (
                itKey === iKey ||
                itId === iKey ||
                itKey.includes(iKey) ||
                iKey.includes(itKey)
              );
            });
          });
        });

        if (unitHoldsItems) return true;

        // Fallback: If no meta deck has this item equipped on that specific champion,
        // check if the deck has both the champion AND the item equipped on any team unit
        const compHasAllItems = itemTokens.every((iTok) => {
          const iKey = normalizeKey(iTok.name);
          return deck.units.some((u) =>
            (u.items || []).some((it) => {
              const itKey = normalizeKey(it.name);
              const itId = normalizeKey(it.id);
              return (
                itKey === iKey ||
                itId === iKey ||
                itKey.includes(iKey) ||
                iKey.includes(itKey)
              );
            })
          );
        });
        return compHasAllItems;
      }

      // Only item tokens selected:
      if (itemTokens.length > 0) {
        const compHasAllItems = itemTokens.every((iTok) => {
          const iKey = normalizeKey(iTok.name);
          return deck.units.some((u) =>
            (u.items || []).some((it) => {
              const itKey = normalizeKey(it.name);
              const itId = normalizeKey(it.id);
              return (
                itKey === iKey ||
                itId === iKey ||
                itKey.includes(iKey) ||
                iKey.includes(itKey)
              );
            })
          );
        });
        if (!compHasAllItems) return false;
      }

      return true;
    }

    // 2. Free-text search query (only if no tokens are selected)
    const q = $tftSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      deck.name.toLowerCase().includes(q) ||
      (deck.play_style && deck.play_style.toLowerCase().includes(q)) ||
      deck.traits.some((t) => t.name.toLowerCase().includes(q)) ||
      deck.units.some((u) => u.name.toLowerCase().includes(q)) ||
      deck.units.some((u) =>
        (u.items || []).some((it) => it.name.toLowerCase().includes(q))
      )
    );
  });

  // Group decks by Tier (S, A, B, C)
  $: groupedTiers = TIERS_ORDER.map((tierKey) => {
    const list = filteredDecks.filter((d) => d.tier.toUpperCase() === tierKey);
    return {
      tierKey,
      decks: list,
      config: getTierConfig(tierKey),
    };
  }).filter((group) => group.decks.length > 0);
</script>

<svelte:window
  on:resize={() => {
    updateExpandedRowPosition();
    if (hoveredDeck) void updatePopoverPosition();
  }}
  on:scroll|capture={() => {
    if (hoveredDeck) hidePopover();
  }}
/>

<div class="flex flex-col gap-6 w-full animate-fade-in select-none">
  {#if groupedTiers.length === 0}
    <div class="flex flex-col items-center justify-center rounded-xl border border-purple-500/20 bg-void-950/60 p-12 text-center">
      <p class="text-sm font-semibold text-slate-400">No meta compositions matching your search query.</p>
    </div>
  {:else}
    {#each groupedTiers as group (group.tierKey)}
      <div
        class="flex flex-col gap-3 relative hover:z-[60] focus-within:z-[60]"
      >
        <!-- Tier Section Row: Left Badge + Horizontal Champion Icons (TFT Academy Layout) -->
        <div
          class="flex flex-col md:flex-row items-stretch gap-3.5 relative hover:z-[60] focus-within:z-[60]"
        >
          <!-- Left Tier Badge Block (S, A, B, C) with md:self-start md:sticky md:top-4 -->
          <div
            class="relative flex md:w-28 shrink-0 md:self-start flex-row md:flex-col items-center justify-center rounded-2xl {group.config.gradient} {group.config.shadow} p-4 shadow-lg overflow-hidden md:sticky md:top-4"
          >
            <div class="text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-md">
              {group.config.label}
            </div>
            <div class="text-[11px] font-black uppercase tracking-widest text-black/60 md:mt-1 ml-2 md:ml-0">
              Tier {group.config.label}
            </div>
            <div class="text-[10px] font-bold text-white/80 hidden md:block mt-0.5">
              {group.decks.length} {group.decks.length === 1 ? 'Comp' : 'Comps'}
            </div>
          </div>

          <!-- Right: Horizontal Row of Champion Icons ("von links nach rechts nebeneinander gelistet") -->
          <div
            class="relative flex flex-1 min-w-0 w-full flex-row flex-wrap items-center gap-3.5 rounded-2xl border border-purple-500/20 bg-void-950/80 p-3.5 backdrop-blur-md shadow-xl hover:z-[60] focus-within:z-[60]"
          >
            {#each group.decks as deck (deck.id)}
              {@const compLead = getCompRepresentative(deck)}
              {@const isExpanded = expandedDeckId === deck.id}

              {#if compLead}
                <!-- Champion Icon Button -->
                <div
                  id="deck-btn-{deck.id}"
                  class="group relative"
                  on:mouseenter={(e) => showPopover(deck, e.currentTarget)}
                  on:mouseleave={() => hidePopover(deck)}
                  role="presentation"
                >
                  <button
                    type="button"
                    on:click={() => {
                      hidePopover();
                      toggleExpand(deck.id);
                    }}
                    class="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-4 {getCostBorderColor(
                      getUnitCost(compLead)
                    )} bg-transparent transition-transform duration-200 hover:-translate-y-1 hover:scale-105 focus:outline-none {isExpanded
                      ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-void-950 scale-105'
                      : ''}"
                    title={deck.name}
                    aria-expanded={isExpanded}
                  >
                    <!-- Champion Portrait Image (scale-[1.04] tucked cleanly behind the border without any 1px gap) -->
                    <img
                      src={compLead.image_url || getTftChampionIcon(compLead.id || compLead.name)}
                      alt={compLead.name}
                      class="h-full w-full object-cover object-top scale-[1.04]"
                      on:error={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.src = getTftChampionFallback(compLead.name);
                      }}
                    />
                  </button>
                </div>
              {/if}

              <!-- AUSKLAPPEN: In-Place Unfolded Comp Details DIRECTLY AFTER THE CLICKED ROW! -->
              {#if expandedDeckId && expandedAfterDeckId === deck.id}
                {@const activeDeck = group.decks.find((d) => d.id === expandedDeckId)}
                {#if activeDeck}
                  {@const itemPriorityData = getCompItemPriorities(activeDeck)}
                  <div class="w-full basis-full min-w-0 my-2.5">
                    {#key activeDeck.id}
                      <div
                        class="flex flex-col gap-6 rounded-2xl border border-purple-400/50 bg-void-950/95 p-5 shadow-2xl backdrop-blur-xl animate-fade-in ring-1 ring-purple-500/30"
                      >
                      <!-- Expanded Comp Header Bar -->
                      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-purple-500/20 pb-4">
                        <div>
                          <div class="flex items-center gap-3">
                            <span class="rounded-lg border px-2.5 py-0.5 text-xs font-black uppercase tracking-wider {group.config.badgeBg}">
                              Tier {activeDeck.tier}
                            </span>
                            <h3 class="text-lg font-black tracking-wide text-white">
                              {activeDeck.name}
                            </h3>
                          </div>

                          <div class="flex items-center gap-3 mt-1.5">
                            {#if activeDeck.play_style}
                              <span class="rounded bg-purple-900/50 border border-purple-400/30 px-2 py-0.5 text-xs font-bold text-purple-200">
                                {activeDeck.play_style}
                              </span>
                            {/if}
                            {#if activeDeck.difficulty}
                              <span class="text-xs text-purple-300/70 font-medium">
                                Difficulty: {activeDeck.difficulty}
                              </span>
                            {/if}
                            <span class="text-xs text-emerald-400 font-bold">
                              Avg #{activeDeck.avg_placement.toFixed(2)}
                            </span>
                            <span class="text-xs text-white/80 font-bold">
                              {activeDeck.top4_rate.toFixed(1)}% Top 4
                            </span>
                          </div>
                        </div>

                        <!-- Close / Collapse Button -->
                        <button
                          type="button"
                          on:click={() => { expandedDeckId = null; expandedAfterDeckId = null; }}
                          class="flex items-center gap-1.5 self-start md:self-auto rounded-lg border border-purple-500/20 bg-void-900/80 px-3 py-1.5 text-xs font-bold text-purple-200 transition hover:border-red-400/50 hover:bg-red-950/30 hover:text-white"
                        >
                          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>Close Comp</span>
                        </button>
                      </div>

                      <!-- Main Content: 4x7 Hex Board & Redesigned Leveling Tempo Guide -->
                      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Left 2 Cols: The REAL 4x7 Hexagon Board Grid -->
                        <div class="lg:col-span-2 rounded-xl border border-purple-500/20 bg-void-900/50 p-4 shadow-inner flex flex-col">
                          <div class="mb-3 border-b border-purple-500/15 pb-2">
                            <h4 class="text-base font-black tracking-wide text-white">
                              End Game Composition
                            </h4>
                          </div>
                          <div class="flex-1 flex items-center justify-center">
                            <TftHexBoard units={activeDeck.units} />
                          </div>
                        </div>

                        <!-- Right Col: Visual TFT Stage Progression & Economy Roadmap -->
                        <div class="rounded-xl border border-purple-500/20 bg-void-950/70 p-3.5 flex flex-col justify-between">
                          <!-- Header with Playstyle Badge -->
                          <div class="flex items-center justify-between border-b border-purple-500/20 pb-2 mb-2.5">
                            <h4 class="text-xs font-black uppercase tracking-wider text-white">
                              Tempo & Economy Guide
                            </h4>
                            {#if activeDeck.play_style}
                              <span class="rounded border border-purple-500/30 bg-purple-900/30 px-2 py-0.5 text-[10px] font-bold text-purple-200">
                                {activeDeck.play_style}
                              </span>
                            {/if}
                          </div>

                          <!-- Connected Vertical Milestone Roadmap (Zahlenstrahl) -->
                          <div class="relative flex-1 flex flex-col justify-between gap-2 py-0.5">
                            <!-- Connecting Background Line (starts from lower half of Stage 2 button down to upper half of Stage 5) -->
                            <div class="absolute z-0 left-[31px] top-[26px] bottom-[26px] w-0.5 bg-gradient-to-b from-emerald-500 via-cyan-500 via-purple-500 to-amber-500 opacity-40"></div>

                            {#each activeDeck.leveling_guide as step, sIdx}
                              {@const isEarly = sIdx === 0}
                              {@const isMid = sIdx === 1}
                              {@const isLate = sIdx === 2}
                              {@const isCap = sIdx >= 3}
                              {@const colorTheme = isEarly
                                ? { border: 'border-emerald-500/50', text: 'text-emerald-400' }
                                : isMid
                                ? { border: 'border-cyan-500/50', text: 'text-cyan-400' }
                                : isLate
                                ? { border: 'border-purple-500/50', text: 'text-purple-300' }
                                : { border: 'border-amber-500/50', text: 'text-amber-300' }}

                              <div class="relative flex items-center gap-2.5 z-10">
                                <!-- Milestone Node Box on the Line (Stage + Level directly inside this box) -->
                                <div class="relative flex flex-col items-center justify-center shrink-0 w-16 py-1 rounded-lg border {colorTheme.border} bg-void-950 text-center shadow-sm">
                                  <span class="text-[10px] font-black uppercase tracking-tight text-white leading-none">
                                    {step.stage}
                                  </span>
                                  <span class="text-[9px] font-extrabold {colorTheme.text} mt-0.5 leading-none">
                                    Lvl {step.level}
                                  </span>
                                </div>

                                <!-- Compact Description Text Box -->
                                <div class="flex-1 rounded-lg border border-purple-500/15 bg-void-900/60 px-2.5 py-1.5 text-[11px] text-slate-300 leading-snug">
                                  {step.description}
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      </div>

                      <!-- Item Build & Component Recipes (Sorted by Champion Role: Main Carry -> Main Tank -> Secondary) -->
                      {#if itemPriorityData.groups.length > 0}
                        <div class="rounded-xl border border-purple-500/20 bg-void-900/50 p-4 shadow-inner flex flex-col gap-3.5">
                          <!-- Section Header with Carousel Component Counts -->
                          <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-purple-500/15 pb-2.5">
                            <div class="flex items-center gap-2">
                              <span class="text-xs font-black uppercase tracking-wider text-purple-200">
                                Item Build & Component Recipes
                              </span>
                              <span class="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-300">
                                Carry &rarr; Tank &rarr; Flex
                              </span>
                            </div>

                            <!-- Carousel Component Count Badges -->
                            <div class="flex flex-wrap items-center gap-1.5">
                              <span class="text-[10px] font-bold uppercase tracking-wider text-purple-300/70 mr-0.5">
                                Carousel:
                              </span>
                              {#each itemPriorityData.componentCounts as cc}
                                <div
                                  class="flex items-center gap-1 rounded-md bg-[#160e33] border border-purple-500/30 px-1.5 py-0.5 text-xs font-bold text-white shadow-sm transition hover:border-purple-400"
                                  title="{cc.component.name}: {cc.count} needed"
                                >
                                  <img src={cc.component.icon} alt={cc.component.name} class="h-4 w-4 rounded object-cover" />
                                  <span class="text-amber-300 font-extrabold text-[11px]">×{cc.count}</span>
                                </div>
                              {/each}
                            </div>
                          </div>

                          <!-- Champion-Sorted Visual Recipe Rows (Visual-first without text clutter) -->
                          <div class="flex flex-col gap-2.5">
                            {#each itemPriorityData.groups as g}
                              {@const uCost = getUnitCost(g.unit)}
                              <div class="flex flex-wrap items-center gap-3.5 rounded-lg border border-purple-500/15 bg-white/[0.02] p-2.5">
                                <!-- Left: Champion Avatar & Role Badge -->
                                <div class="flex items-center gap-2.5 shrink-0 min-w-[140px]">
                                  <div class="relative h-9 w-9 shrink-0 rounded-md border-2 {getCostBorderColor(uCost)} bg-void-900 overflow-hidden shadow">
                                    <img
                                      src={g.unit.image_url || getTftChampionIcon(g.unit.id || g.unit.name)}
                                      alt={g.unit.name}
                                      class="h-full w-full object-cover object-top"
                                      on:error={(e) => {
                                        const target = e.currentTarget as HTMLImageElement;
                                        target.src = getTftChampionFallback(g.unit.name);
                                      }}
                                    />
                                    <span class="absolute bottom-0 right-0 rounded bg-black/85 px-1 text-[8px] font-bold text-amber-300">
                                      {uCost}g
                                    </span>
                                  </div>
                                  <div class="flex flex-col">
                                    <span class="text-xs font-bold text-white leading-tight">
                                      {g.unit.name}
                                    </span>
                                    <span class="inline-block self-start rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider mt-0.5 {g.badgeClass}">
                                      {g.roleTitle}
                                    </span>
                                  </div>
                                </div>

                                <!-- Right: Visual Completed Items + Components Recipe Chips -->
                                <div class="flex flex-wrap items-center gap-2.5">
                                  {#each g.recipes as r}
                                    <div
                                      class="flex items-center gap-1.5 rounded-md bg-void-950/90 border border-purple-500/25 px-2 py-1 shadow-sm transition hover:border-purple-400/50"
                                      title="{r.itemName} on {g.unit.name}"
                                    >
                                      <!-- Completed Item Icon -->
                                      <img
                                        src={getTftItemIcon(r.itemId || r.itemName)}
                                        alt={r.itemName}
                                        class="h-6 w-6 rounded object-cover ring-1 ring-black/80 shrink-0"
                                      />

                                      <!-- 2 Required Components: [C1] + [C2] -->
                                      {#if r.components}
                                        <span class="text-[9px] text-purple-400 font-bold leading-none">=</span>
                                        <div class="flex items-center gap-1 bg-void-900 px-1 py-0.5 rounded border border-purple-500/20 shrink-0">
                                          <img
                                            src={r.components[0].icon}
                                            alt={r.components[0].name}
                                            title={r.components[0].name}
                                            class="h-4 w-4 rounded object-cover"
                                          />
                                          <span class="text-[8px] text-purple-400 font-bold leading-none">+</span>
                                          <img
                                            src={r.components[1].icon}
                                            alt={r.components[1].name}
                                            title={r.components[1].name}
                                            class="h-4 w-4 rounded object-cover"
                                          />
                                        </div>
                                      {/if}
                                    </div>
                                  {/each}
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/key}
                </div>
              {/if}
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Portaled Fixed Hover Preview (never clipped by scroll containers, sticky bars, or stacking contexts) -->
{#if hoveredDeck}
  {@const tierConfig = getTierConfig(hoveredDeck.tier)}
  {@const carryUnit = getMainCarry(hoveredDeck)}
  {@const tankUnit = getPrioritizedUnits(hoveredDeck).find((p) => p.roleType === 'tank')?.unit}
  <div
    use:portal
    bind:this={popoverEl}
    style="background-color: #0b071a; top: {popoverPos.top}px; left: {popoverPos.left}px; opacity: {popoverPos.visible ? 1 : 0};"
    class="pointer-events-none fixed z-[9999] w-72 rounded-xl border-2 border-purple-400/80 p-3.5 shadow-[0_20px_40px_rgba(0,0,0,0.98)] flex flex-col gap-2.5 transition-opacity duration-100 ease-out"
  >
    <!-- Header: Title + Playstyle -->
    <div class="border-b border-purple-500/25 pb-2">
      <div class="flex items-center justify-between gap-1">
        <h4 class="text-xs font-black text-white truncate">{hoveredDeck.name}</h4>
        <span class="rounded px-1.5 py-0.5 text-[9px] font-black uppercase {tierConfig.badgeBg}">
          Tier {hoveredDeck.tier}
        </span>
      </div>
      <div class="flex items-center gap-2 mt-1">
        {#if hoveredDeck.play_style}
          <span class="text-[10px] font-semibold text-purple-300">
            {hoveredDeck.play_style}
          </span>
        {/if}
        {#if hoveredDeck.difficulty}
          <span class="text-[9px] text-purple-300/70 font-medium">
            • {hoveredDeck.difficulty}
          </span>
        {/if}
      </div>
    </div>

    <!-- Traits preview -->
    {#if hoveredDeck.traits && hoveredDeck.traits.length > 0}
      <div class="flex flex-wrap items-center gap-1">
        {#each hoveredDeck.traits as trait}
          <div class="flex items-center gap-1 rounded bg-[#160e33] border border-purple-500/35 px-1.5 py-0.5 text-[9px] font-bold text-slate-100 shadow-sm">
            <span class="text-amber-300 font-extrabold">{trait.count}</span>
            <span>{trait.name}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Full comp units lineup (all units shown!) -->
    <div class="flex flex-wrap items-center gap-1.5 py-1">
      {#each hoveredDeck.units as unit}
        {@const cost = getUnitCost(unit)}
        {@const isCarry = carryUnit && carryUnit.name === unit.name}
        {@const isTank = !isCarry && tankUnit && tankUnit.name === unit.name}
        <div class="relative flex flex-col items-center">
          <img
            src={unit.image_url || getTftChampionIcon(unit.id || unit.name)}
            alt={unit.name}
            title="{unit.name} ({cost}g){isCarry ? ' - Main Carry' : isTank ? ' - Main Tank' : ''}"
            class="h-7 w-7 rounded-md border-2 {getCostBorderColor(cost)} bg-[#160e33] object-cover"
            on:error={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.src = getTftChampionFallback(unit.name);
            }}
          />
          {#if isCarry}
            <span
              class="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 border border-amber-200 text-[8px] font-black text-black shadow"
              title="Main Carry"
            >
              C
            </span>
          {:else if isTank}
            <span
              class="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 border border-emerald-200 text-[8px] font-black text-black shadow"
              title="Main Tank"
            >
              T
            </span>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Placement Stats & Click hint footer -->
    <div class="flex items-center justify-between border-t border-purple-500/20 pt-1.5 text-[10px]">
      <span class="text-emerald-400 font-bold">Avg #{hoveredDeck.avg_placement.toFixed(2)}</span>
      <span class="text-purple-200 font-semibold">{hoveredDeck.top4_rate.toFixed(1)}% Top 4</span>
      <span class="text-[9px] text-purple-300/70 italic">Click to open</span>
    </div>
  </div>
{/if}
