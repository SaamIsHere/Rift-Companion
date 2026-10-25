import type { TftMetaDeck, TftUnit } from "../types";
import {
  getTftChampionIcon,
  getTftChampionCost,
  getTftTraitIcon,
} from "./tftAssets";
import set18ChampsRaw from "../data/set18_champions.json";
import set18TraitsRaw from "../data/set18_traits.json";

interface Set18ChampData {
  name: string;
  cost: number;
  traits: string[];
  apiName?: string;
}

interface Set18TraitData {
  name: string;
  apiName?: string;
  breakpoints: number[];
  icon?: string;
}

const SET18_CHAMPS: Record<string, Set18ChampData> = set18ChampsRaw as Record<string, Set18ChampData>;
const SET18_TRAITS: Record<string, Set18TraitData> = set18TraitsRaw as Record<string, Set18TraitData>;

/**
 * Official Category Icons for Filter Buttons (Spatula, Frying Pan, Tome of Traits)
 */
export const EMBLEM_CATEGORY_ICONS = {
  spatula: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_Spatula.png",
  pan: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_FryingPan.png",
  uncraftable:
    "https://raw.communitydragon.org/latest/game/assets/characters/tft5_emblemarmorykey/hud/tft5_emblemarmorykey_square.png",
} as const;

/**
 * Unique 1-unit personal traits that should NEVER grant synergy bonus points
 */
const UNIQUE_PERSONAL_TRAITS = new Set([
  "Avatar",
  "Bounty Seeker",
  "Old Growth",
  "Monolith",
  "Greenfather",
  "Attuned",
  "Apex Predator",
  "Caustic",
  "Thornmaiden",
  "Emerald Aspect",
  "Eclipse",
  "Rival",
]);

/**
 * Frontline / Tank traits used to match tank emblems to frontline carriers
 */
const TANK_TRAITS = new Set([
  "Defender",
  "Juggernaut",
  "Vanguard",
  "Brawler",
  "Elderwood",
]);

/**
 * Champion name aliases used in deck data
 */
const CHAMP_ALIAS_MAP: Record<string, string> = {
  Sentry: "Pebbles",
  GnarSmall: "Gnar",
  CrimsonRaptor: "Mama Beak",
  RekSai: "Rek'Sai",
  KogMaw: "Kog'Maw",
};

export interface EmblemInfo {
  id: string;
  name: string;
  trait: string;
  category: "spatula" | "pan" | "uncraftable";
  recipe: [string, string] | null;
  icon: string;
  description: string;
}

/**
 * Authentic Set 18 Emblems (8 Spatula + 8 Frying Pan + 4 Uncraftable)
 */
export const SET18_EMBLEMS: EmblemInfo[] = [
  // Spatula Emblems
  {
    id: "fae_emblem",
    name: "Fae Emblem",
    trait: "Fae",
    category: "spatula",
    recipe: ["spatula", "bf_sword"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemFae.png",
    description: "Holder gains the Fae trait. Fae units gain bonus Max Health and amplified ability effects.",
  },
  {
    id: "elderwood_emblem",
    name: "Elderwood Emblem",
    trait: "Elderwood",
    category: "spatula",
    recipe: ["spatula", "chain_vest"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemElderwood.png",
    description: "Holder gains the Elderwood trait. Grows every 2 seconds, gaining Armor, MR, AD, and AP.",
  },
  {
    id: "blackthorn_emblem",
    name: "Blackthorn Emblem",
    trait: "Blackthorn",
    category: "spatula",
    recipe: ["spatula", "giants_belt"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBlackthorn.png",
    description: "Holder gains the Blackthorn trait. Summons an Ancient Corruptor after casting abilities.",
  },
  {
    id: "blossom_emblem",
    name: "Blossom Emblem",
    trait: "Blossom",
    category: "spatula",
    recipe: ["spatula", "needlessly_large_rod"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBlossom.png",
    description: "Holder gains the Blossom trait. Grants teamwide healing and bonus Ability Power.",
  },
  {
    id: "sprykin_emblem",
    name: "Sprykin Emblem",
    trait: "Sprykin",
    category: "spatula",
    recipe: ["spatula", "negatron_cloak"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSprykin.png",
    description: "Holder gains the Sprykin trait. Grants a shield and bonus movement speed at combat start.",
  },
  {
    id: "inferno_emblem",
    name: "Inferno Emblem",
    trait: "Inferno",
    category: "spatula",
    recipe: ["spatula", "recurve_bow"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemInferno.png",
    description: "Holder gains the Inferno trait. Attacks and spells ignite targets, dealing burn damage and granting AP.",
  },
  {
    id: "lunar_emblem",
    name: "Lunar Emblem",
    trait: "Lunar",
    category: "spatula",
    recipe: ["spatula", "tear_of_the_goddess"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemLunar.png",
    description: "Holder gains the Lunar trait. Every lunar cycle grants massive teamwide combat buffs.",
  },
  {
    id: "primal_emblem",
    name: "Primal Emblem",
    trait: "Primal",
    category: "spatula",
    recipe: ["spatula", "sparring_gloves"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemPrimal.png",
    description: "Holder gains the Primal trait. Transforms into a primal beast with bonus Physical Damage.",
  },

  // Frying Pan Emblems
  {
    id: "hunter_emblem",
    name: "Hunter Emblem",
    trait: "Hunter",
    category: "pan",
    recipe: ["frying_pan", "bf_sword"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemHunter.png",
    description: "Holder gains the Hunter trait. Periodically fires coordinated volleys at lowest-health enemies.",
  },
  {
    id: "vanguard_emblem",
    name: "Vanguard Emblem",
    trait: "Vanguard",
    category: "pan",
    recipe: ["frying_pan", "chain_vest"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemVanguard.png",
    description: "Holder gains the Vanguard trait. Grants massive bonus Armor and Magic Resist.",
  },
  {
    id: "brawler_emblem",
    name: "Brawler Emblem",
    trait: "Brawler",
    category: "pan",
    recipe: ["frying_pan", "giants_belt"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBrawler.png",
    description: "Holder gains the Brawler trait. Grants percent bonus Max Health to the entire team.",
  },
  {
    id: "spellweaver_emblem",
    name: "Spellweaver Emblem",
    trait: "Spellweaver",
    category: "pan",
    recipe: ["frying_pan", "needlessly_large_rod"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSpellweaver.png",
    description: "Holder gains the Spellweaver trait. Stacks AP whenever any ally casts an ability.",
  },
  {
    id: "ravager_emblem",
    name: "Ravager Emblem",
    trait: "Ravager",
    category: "pan",
    recipe: ["frying_pan", "negatron_cloak"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSlayer.png",
    description: "Holder gains the Ravager trait. Grants Omnivamp and bonus damage against low-health enemies.",
  },
  {
    id: "rapidfire_emblem",
    name: "Rapidfire Emblem",
    trait: "Rapidfire",
    category: "pan",
    recipe: ["frying_pan", "recurve_bow"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemRapidfire.png",
    description: "Holder gains the Rapidfire trait. Stacks Attack Speed on basic attacks.",
  },
  {
    id: "invoker_emblem",
    name: "Invoker Emblem",
    trait: "Invoker",
    category: "pan",
    recipe: ["frying_pan", "tear_of_the_goddess"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemInvoker.png",
    description: "Holder gains the Invoker trait. Restores Mana to the entire team every 3 seconds.",
  },
  {
    id: "executioner_emblem",
    name: "Executioner Emblem",
    trait: "Executioner",
    category: "pan",
    recipe: ["frying_pan", "sparring_gloves"],
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemExecutioner.png",
    description: "Holder gains the Executioner trait. Spells can critically strike with bonus Critical Damage.",
  },

  // Uncraftable Emblems
  {
    id: "defender_emblem",
    name: "Defender Emblem",
    trait: "Defender",
    category: "uncraftable",
    recipe: null,
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemDefender.png",
    description: "Holder gains the Defender trait. Grants bonus Armor and taunts nearby enemies at combat start.",
  },
  {
    id: "juggernaut_emblem",
    name: "Juggernaut Emblem",
    trait: "Juggernaut",
    category: "uncraftable",
    recipe: null,
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemJuggernaut.png",
    description: "Holder gains the Juggernaut trait. Grants damage reduction that scales as Health drops.",
  },
  {
    id: "coven_emblem",
    name: "Coven Emblem",
    trait: "Coven",
    category: "uncraftable",
    recipe: null,
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemCoven.png",
    description: "Holder gains the Coven trait. Selects a Coven Leader and feeds her Mana and bonus AP.",
  },
  {
    id: "flora_fatalis_emblem",
    name: "Flora Fatalis Emblem",
    trait: "Flora Fatalis",
    category: "uncraftable",
    recipe: null,
    icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemFloraFatalis.png",
    description: "Holder gains the Flora Fatalis trait. Summons grasping vines and thorns onto the hexes.",
  },
];

export function getEmblemById(id: string): EmblemInfo | undefined {
  return SET18_EMBLEMS.find((e) => e.id === id || e.id === `${id}_emblem`);
}

/**
 * Checks if a meta deck already requires/has an emblem item pre-baked in any unit's items.
 * Such decks are excluded from the Emblem Guide as requested.
 */
export function hasNativeEmblem(deck: TftMetaDeck): boolean {
  for (const u of deck.units) {
    if (u.items) {
      for (const it of u.items) {
        const name = typeof it === "string" ? it : (it.name || it.id || "");
        if (/emblem/i.test(name)) return true;
      }
    }
  }
  return false;
}

function lookupChampData(name: string): Set18ChampData | null {
  if (SET18_CHAMPS[name]) return SET18_CHAMPS[name];
  const alias = CHAMP_ALIAS_MAP[name];
  if (alias && SET18_CHAMPS[alias]) return SET18_CHAMPS[alias];
  const clean = name.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(SET18_CHAMPS)) {
    if (k.toLowerCase().replace(/[^a-z]/g, "") === clean) {
      return v;
    }
  }
  return null;
}

function getCanonicalChampKey(name: string): string {
  if (name.startsWith("Lux")) return "Lux";
  const c = lookupChampData(name);
  return c ? c.name : name;
}

export function getChampTraits(name: string): string[] {
  const c = lookupChampData(name);
  return c ? c.traits : [];
}

/**
 * Returns exact trait count contributions for a champion.
 * Handles Lux's Avatar mechanic (+2 to her origin trait) and Elder Dragon's Apex Predator (+2 Riftbeast).
 */
export function getChampTraitContributions(name: string): Record<string, number> {
  const c = lookupChampData(name);
  if (!c) return {};
  const isAvatar = c.traits.includes("Avatar");
  const isApex = c.traits.includes("Apex Predator");
  const map: Record<string, number> = {};
  for (const t of c.traits) {
    if (isAvatar && t !== "Avatar") {
      map[t] = 2;
    } else if (isApex && t === "Riftbeast") {
      map[t] = 2;
    } else {
      map[t] = 1;
    }
  }
  return map;
}

export function getChampCost(name: string): number {
  const c = lookupChampData(name);
  if (c?.cost) return c.cost;
  return getTftChampionCost(name, 3);
}

export function isPersonalTrait(traitName: string): boolean {
  if (UNIQUE_PERSONAL_TRAITS.has(traitName)) return true;
  const t = SET18_TRAITS[traitName];
  if (t && t.breakpoints.length === 1 && t.breakpoints[0] === 1) return true;
  return false;
}

export function getTraitBreakpoints(traitName: string): number[] {
  const direct = SET18_TRAITS[traitName];
  if (direct?.breakpoints?.length) return direct.breakpoints;
  const clean = traitName.toLowerCase().replace(/[\s-]/g, "");
  for (const [k, v] of Object.entries(SET18_TRAITS)) {
    if (k.toLowerCase().replace(/[\s-]/g, "") === clean) {
      return v.breakpoints;
    }
  }
  return [2, 4, 6];
}

export function getActiveBreakpoint(count: number, breakpoints: number[]): number {
  let active = 0;
  for (const bp of breakpoints) {
    if (count >= bp) active = bp;
    else break;
  }
  return active;
}

export function getTraitTier(
  count: number,
  breakpoints: number[]
): "bronze" | "silver" | "gold" | "prismatic" | null {
  if (!breakpoints || breakpoints.length === 0) return null;
  let activeIndex = -1;
  for (let i = 0; i < breakpoints.length; i++) {
    if (count >= breakpoints[i]) {
      activeIndex = i;
    } else {
      break;
    }
  }
  if (activeIndex === -1) return null;
  const total = breakpoints.length;
  if (activeIndex === total - 1 && total >= 3) return "prismatic";
  if (activeIndex >= Math.floor(total * 0.6)) return "gold";
  if (activeIndex >= 1) return "silver";
  return "bronze";
}

export interface AdaptedUnit {
  name: string;
  cost: number;
  image_url: string;
  is_carry: boolean;
  items: { id: string; name: string; image_url?: string }[];
  emblemsEquipped: EmblemInfo[];
  status: "kept" | "added" | "cut";
}

export interface AdaptedTrait {
  name: string;
  count: number;
  tier: "bronze" | "silver" | "gold" | "prismatic";
  icon_url: string;
  isUpgraded: boolean;
  previousCount: number;
  breakpointHit: boolean;
}

export interface EmblemHolderAssignment {
  emblem: EmblemInfo;
  holderUnitName: string;
  holderIconUrl: string;
}

export interface TraitUpgradeSummary {
  trait: string;
  from: number;
  to: number;
  isBreakpoint: boolean;
}

export interface AdaptedVariant {
  id: "no_cut" | "cut_1" | "cut_2";
  label: string;
  shortBadge: string;
  score: number;
  traitUpgrades: TraitUpgradeSummary[];
  emblemAssignments: EmblemHolderAssignment[];
  cuts: { name: string; cost: number; image_url: string }[];
  additions: { name: string; cost: number; image_url: string; traits: string[] }[];
  units: AdaptedUnit[];
  traits: AdaptedTrait[];
}

export interface AdaptedComp {
  id: string;
  originalDeck: TftMetaDeck;
  tier: string;
  bestScore: number;
  matchRatingPercent: number;
  variants: AdaptedVariant[];
}

function calculateBoardTraitCounts(
  unitNames: string[],
  emblems: EmblemInfo[] = []
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of unitNames) {
    const contrib = getChampTraitContributions(name);
    for (const [tr, val] of Object.entries(contrib)) {
      counts[tr] = (counts[tr] || 0) + val;
    }
  }
  for (const emb of emblems) {
    counts[emb.trait] = (counts[emb.trait] || 0) + 1;
  }
  return counts;
}

/**
 * STRICT CHECK:
 * 1. A champion can NEVER hold an emblem if they already have 3 items!
 * 2. A champion can NEVER hold an emblem for a trait they already innately possess!
 * 3. A champion can NEVER hold two emblems of the same trait!
 */
function canUnitHoldEmblem(
  unit: { name: string; items?: unknown[] },
  emblem: EmblemInfo,
  alreadyEquipped: EmblemInfo[]
): boolean {
  const currentItemsCount = (unit.items ? unit.items.length : 0) + alreadyEquipped.length;
  if (currentItemsCount >= 3) return false;

  const innateTraits = getChampTraits(unit.name);
  if (innateTraits.includes(emblem.trait)) return false;
  if (alreadyEquipped.some((e) => e.trait === emblem.trait)) return false;
  return true;
}

function isFrontlineUnit(u: { name: string; cell?: { x: number; y: number } }): boolean {
  const tr = getChampTraits(u.name);
  if (tr.some((t) => TANK_TRAITS.has(t))) return true;
  if (u.cell && u.cell.y >= 3) return true;
  return false;
}

/**
 * Assigns every selected emblem to a strictly valid carrier on the board.
 * Returns null if any emblem cannot be legally equipped!
 */
function assignEmblemsToUnits(
  units: { name: string; is_carry?: boolean; items?: unknown[]; cell?: { x: number; y: number }; image_url?: string }[],
  emblems: EmblemInfo[],
  preferredHolderNames: string[] = []
): EmblemHolderAssignment[] | null {
  const equippedByUnit = new Map<string, EmblemInfo[]>();
  const assignments: EmblemHolderAssignment[] = [];

  for (const emb of emblems) {
    const isTankEmblem = TANK_TRAITS.has(emb.trait);

    const validCandidates = units
      .filter((u) => {
        const eq = equippedByUnit.get(u.name) || [];
        return canUnitHoldEmblem(u, emb, eq);
      })
      .sort((a, b) => {
        const prefA = preferredHolderNames.includes(a.name) ? 8 : 0;
        const prefB = preferredHolderNames.includes(b.name) ? 8 : 0;
        const costA = getChampCost(a.name) * 3;
        const costB = getChampCost(b.name) * 3;
        const carryA = a.is_carry || (a.items && a.items.length >= 2) ? 10 : 0;
        const carryB = b.is_carry || (b.items && b.items.length >= 2) ? 10 : 0;
        const roleA = isTankEmblem === isFrontlineUnit(a) ? 8 : 0;
        const roleB = isTankEmblem === isFrontlineUnit(b) ? 8 : 0;
        const eqPenaltyA = (equippedByUnit.get(a.name) || []).length * 30;
        const eqPenaltyB = (equippedByUnit.get(b.name) || []).length * 30;

        return (
          prefB + costB + carryB + roleB - eqPenaltyB -
          (prefA + costA + carryA + roleA - eqPenaltyA)
        );
      });

    if (validCandidates.length === 0) {
      return null;
    }

    const holder = validCandidates[0];
    const currentEq = equippedByUnit.get(holder.name) || [];
    currentEq.push(emb);
    equippedByUnit.set(holder.name, currentEq);

    assignments.push({
      emblem: emb,
      holderUnitName: holder.name,
      holderIconUrl: holder.image_url || getTftChampionIcon(holder.name),
    });
  }

  return assignments;
}

/**
 * Scores the board's active synergies (ignoring 1-unit personal traits and 1-count Flora Fatalis).
 */
function scoreBoardSynergies(
  baseCounts: Record<string, number>,
  finalCounts: Record<string, number>,
  uniqueEmblemTraits: string[],
  baseTierScore: number,
  matchedTraitsCount: number
): { score: number; traitUpgrades: TraitUpgradeSummary[]; realSynergyGain: boolean } {
  let score = baseTierScore + matchedTraitsCount * 35;
  const traitUpgrades: TraitUpgradeSummary[] = [];
  let realSynergyGain = false;

  for (const [tr, newCnt] of Object.entries(finalCounts)) {
    if (isPersonalTrait(tr)) continue;
    const bp = getTraitBreakpoints(tr);
    const maxBp = bp[bp.length - 1] || 6;
    const oldCnt = baseCounts[tr] || 0;
    const oldBp = getActiveBreakpoint(oldCnt, bp);
    const newBp = getActiveBreakpoint(newCnt, bp);

    // Only count real multi-unit breakpoints (newBp >= 2)
    if (newBp > oldBp && newBp >= 2) {
      const isSelectedTrait = uniqueEmblemTraits.includes(tr);
      const bpBonus = isSelectedTrait ? 60 + newBp * 14 : 35 + newBp * 5;
      score += bpBonus;
      realSynergyGain = true;
      traitUpgrades.push({
        trait: tr,
        from: oldCnt,
        to: newCnt,
        isBreakpoint: true,
      });
    } else if (
      uniqueEmblemTraits.includes(tr) &&
      newCnt > oldCnt &&
      newCnt <= maxBp &&
      newBp >= 2
    ) {
      score += 15 + newBp * 5;
      traitUpgrades.push({
        trait: tr,
        from: oldCnt,
        to: newCnt,
        isBreakpoint: false,
      });
    }
  }

  traitUpgrades.sort(
    (a, b) => Number(b.isBreakpoint) - Number(a.isBreakpoint) || b.to - a.to
  );

  return { score, traitUpgrades, realSynergyGain };
}

/**
 * Main Optimization Engine:
 * Evaluates meta decks against the user's selected emblems.
 * 1. Excludes meta decks that already require native emblems.
 * 2. Never equips emblems on champions who already have 3 items.
 * 3. Enforces that Lux additions MUST hit an exact active breakpoint threshold (no wasteful ungerade counts like Solar 4).
 * 4. Produces up to 3 clean adaptation variants per comp.
 */
export function optimizeCompsForEmblems(
  allDecks: TftMetaDeck[],
  selectedEmblemIds: string[]
): AdaptedComp[] {
  if (
    !allDecks ||
    allDecks.length === 0 ||
    !selectedEmblemIds ||
    selectedEmblemIds.length === 0
  ) {
    return [];
  }

  const emblems: EmblemInfo[] = selectedEmblemIds
    .map(getEmblemById)
    .filter((e): e is EmblemInfo => Boolean(e));

  if (emblems.length === 0) return [];

  // Exclude comps that already natively require emblems
  const eligibleDecks = allDecks.filter((d) => !hasNativeEmblem(d));

  const uniqueEmblemTraits = [...new Set(emblems.map((e) => e.trait))];
  const candidates: AdaptedComp[] = [];

  for (const deck of eligibleDecks) {
    const unitNames = deck.units.map((u) => u.name);
    const baseCounts = calculateBoardTraitCounts(unitNames, []);

    // Check affinity: deck must naturally run at least 1 unit of a selected emblem trait
    // and reach its minimum breakpoint with the selected emblems
    let matchedTraitsCount = 0;
    for (const tr of uniqueEmblemTraits) {
      const embCountForTrait = emblems.filter((e) => e.trait === tr).length;
      const baseCnt = baseCounts[tr] || 0;
      const minBp = getTraitBreakpoints(tr)[0] || 2;
      if (baseCnt >= 1 && baseCnt + embCountForTrait >= minBp) {
        matchedTraitsCount++;
      }
    }
    if (matchedTraitsCount === 0) continue;

    const tierScores: Record<string, number> = { S: 55, A: 42, B: 28, C: 18, D: 8 };
    const baseTierScore = tierScores[deck.tier] || 15;
    const variants: AdaptedVariant[] = [];

    // =========================================================================
    // VARIANT 1: NO CUT (Direct Fit / Vertical Push)
    // =========================================================================
    const noCutAssignments = assignEmblemsToUnits(deck.units, emblems);
    if (noCutAssignments) {
      const finalCounts = calculateBoardTraitCounts(unitNames, emblems);
      let allEmblemsActive = true;
      for (const tr of uniqueEmblemTraits) {
        if (getActiveBreakpoint(finalCounts[tr] || 0, getTraitBreakpoints(tr)) === 0) {
          allEmblemsActive = false;
          break;
        }
      }

      if (allEmblemsActive) {
        const { score, traitUpgrades } = scoreBoardSynergies(
          baseCounts,
          finalCounts,
          uniqueEmblemTraits,
          baseTierScore,
          matchedTraitsCount
        );

        const adaptedUnits: AdaptedUnit[] = deck.units.map((u) => ({
          name: u.name,
          cost: getChampCost(u.name),
          image_url: u.image_url || getTftChampionIcon(u.id || u.name),
          is_carry: Boolean(u.is_carry),
          items: u.items || [],
          emblemsEquipped: noCutAssignments
            .filter((a) => a.holderUnitName === u.name)
            .map((a) => a.emblem),
          status: "kept",
        }));

        variants.push({
          id: "no_cut",
          label: "No Cut",
          shortBadge: "No Cut",
          score: score + 15,
          traitUpgrades,
          emblemAssignments: noCutAssignments,
          cuts: [],
          additions: [],
          units: adaptedUnits,
          traits: buildAdaptedTraits(finalCounts, baseCounts),
        });
      }
    }

    // Identify low-cost non-carry units that can be cut (cost <= 3, not main carry)
    const cuttableUnits = deck.units.filter((u) => {
      const cost = getChampCost(u.name);
      const isCarry = u.is_carry || (u.items && u.items.length >= 2);
      return cost <= 3 && !isCarry;
    });

    const existingCanonKeys = new Set(
      deck.units.map((u) => getCanonicalChampKey(u.name))
    );
    const flexPool = Object.entries(SET18_CHAMPS).filter(([name, data]) => {
      if (data.cost < 4) return false;
      if (existingCanonKeys.has(getCanonicalChampKey(name))) return false;
      if (name === "Lux") return false;
      return true;
    });

    // =========================================================================
    // VARIANT 2: 1-UNIT SWAP (Cut 1 Trait-Bot -> Add 1 High-Cost Unit)
    // =========================================================================
    let best1Swap: AdaptedVariant | null = null;

    for (const cutUnit of cuttableUnits) {
      const remainingUnits = deck.units.filter((u) => u.name !== cutUnit.name);

      for (const [addName, addData] of flexPool) {
        const testBoardUnits = [
          ...remainingUnits,
          {
            name: addName,
            cost: addData.cost,
            is_carry: addData.cost >= 5,
            items: [],
            image_url: getTftChampionIcon(addName),
          },
        ];
        const testUnitNames = testBoardUnits.map((u) => u.name);
        const finalCounts = calculateBoardTraitCounts(testUnitNames, emblems);

        // Strict Lux validation: Lux's +2 addition MUST land EXACTLY on an active breakpoint threshold!
        // No ungerade/wasteful numbers (e.g. Solar 4 when threshold is 3, or Blossom 4 when threshold is 3,5)
        if (addName.startsWith("Lux (")) {
          const luxTrait = addData.traits.find((t) => t !== "Avatar");
          if (!luxTrait) continue;
          const bp = getTraitBreakpoints(luxTrait);
          const finalCount = finalCounts[luxTrait] || 0;
          if (!bp.includes(finalCount)) continue;
        }

        // Rule 1: All selected emblems MUST be active
        let allActive = true;
        for (const tr of uniqueEmblemTraits) {
          if (getActiveBreakpoint(finalCounts[tr] || 0, getTraitBreakpoints(tr)) === 0) {
            allActive = false;
            break;
          }
        }
        if (!allActive) continue;

        // Rule 2: No active non-personal trait breakpoint from the original deck may be broken
        let breaksTrait = false;
        for (const [tr, origCount] of Object.entries(baseCounts)) {
          if (isPersonalTrait(tr)) continue;
          const bp = getTraitBreakpoints(tr);
          const origBp = getActiveBreakpoint(origCount, bp);
          const newBp = getActiveBreakpoint(finalCounts[tr] || 0, bp);
          if (newBp < origBp) {
            breaksTrait = true;
            break;
          }
        }
        if (breaksTrait) continue;

        // Rule 3: Legal emblem assignment (never on units with 3 items)
        const assignments = assignEmblemsToUnits(testBoardUnits, emblems, [addName]);
        if (!assignments) continue;

        const { score: synScore, traitUpgrades, realSynergyGain } = scoreBoardSynergies(
          baseCounts,
          finalCounts,
          uniqueEmblemTraits,
          baseTierScore,
          matchedTraitsCount
        );

        const cutCost = getChampCost(cutUnit.name);
        const costDiff = addData.cost - cutCost;
        if (!realSynergyGain && costDiff < 3) continue;

        const swapScore = synScore + costDiff * 6;
        if (!best1Swap || swapScore > best1Swap.score) {
          const adaptedUnits: AdaptedUnit[] = deck.units.map((u) => {
            if (u.name === cutUnit.name) {
              return {
                name: addName,
                cost: addData.cost,
                image_url: getTftChampionIcon(addName),
                is_carry: addData.cost >= 5,
                items: [],
                emblemsEquipped: assignments
                  .filter((a) => a.holderUnitName === addName)
                  .map((a) => a.emblem),
                status: "added",
              };
            }
            return {
              name: u.name,
              cost: getChampCost(u.name),
              image_url: u.image_url || getTftChampionIcon(u.id || u.name),
              is_carry: Boolean(u.is_carry),
              items: u.items || [],
              emblemsEquipped: assignments
                .filter((a) => a.holderUnitName === u.name)
                .map((a) => a.emblem),
              status: "kept",
            };
          });

          best1Swap = {
            id: "cut_1",
            label: "1-Unit Swap",
            shortBadge: "1-Unit Swap",
            score: swapScore,
            traitUpgrades,
            emblemAssignments: assignments,
            cuts: [
              {
                name: cutUnit.name,
                cost: cutCost,
                image_url: cutUnit.image_url || getTftChampionIcon(cutUnit.name),
              },
            ],
            additions: [
              {
                name: addName,
                cost: addData.cost,
                image_url: getTftChampionIcon(addName),
                traits: addData.traits.filter((t) => !isPersonalTrait(t)),
              },
            ],
            units: adaptedUnits,
            traits: buildAdaptedTraits(finalCounts, baseCounts),
          };
        }
      }
    }
    if (best1Swap) variants.push(best1Swap);

    // =========================================================================
    // VARIANT 3: 2-UNIT SWAP (Cut 2 Trait-Bots -> Add 2 High-Cost Units)
    // =========================================================================
    if (cuttableUnits.length >= 2) {
      let best2Swap: AdaptedVariant | null = null;
      const topFlex = flexPool
        .filter(([name, data]) => {
          if (name.startsWith("Lux (")) {
            const luxTrait = data.traits.find((t) => t !== "Avatar");
            return Boolean(luxTrait && (baseCounts[luxTrait] || 0) >= 2);
          }
          return data.traits.some(
            (t) => !isPersonalTrait(t) && (baseCounts[t] || 0) >= 1
          );
        })
        .slice(0, 12);

      for (let i = 0; i < cuttableUnits.length; i++) {
        for (let j = i + 1; j < cuttableUnits.length; j++) {
          const cut1 = cuttableUnits[i];
          const cut2 = cuttableUnits[j];
          const remainingUnits = deck.units.filter(
            (u) => u.name !== cut1.name && u.name !== cut2.name
          );

          for (let a = 0; a < topFlex.length; a++) {
            for (let b = a + 1; b < topFlex.length; b++) {
              const [add1Name, add1Data] = topFlex[a];
              const [add2Name, add2Data] = topFlex[b];
              if (getCanonicalChampKey(add1Name) === getCanonicalChampKey(add2Name)) {
                continue;
              }

              const testBoardUnits = [
                ...remainingUnits,
                {
                  name: add1Name,
                  cost: add1Data.cost,
                  is_carry: add1Data.cost >= 5,
                  items: [],
                  image_url: getTftChampionIcon(add1Name),
                },
                {
                  name: add2Name,
                  cost: add2Data.cost,
                  is_carry: add2Data.cost >= 5,
                  items: [],
                  image_url: getTftChampionIcon(add2Name),
                },
              ];
              const testUnitNames = testBoardUnits.map((u) => u.name);
              const finalCounts = calculateBoardTraitCounts(testUnitNames, emblems);

              // Strict Lux validation for both units
              if (add1Name.startsWith("Lux (")) {
                const luxTrait = add1Data.traits.find((t) => t !== "Avatar");
                if (!luxTrait || !getTraitBreakpoints(luxTrait).includes(finalCounts[luxTrait] || 0)) {
                  continue;
                }
              }
              if (add2Name.startsWith("Lux (")) {
                const luxTrait = add2Data.traits.find((t) => t !== "Avatar");
                if (!luxTrait || !getTraitBreakpoints(luxTrait).includes(finalCounts[luxTrait] || 0)) {
                  continue;
                }
              }

              let allActive = true;
              for (const tr of uniqueEmblemTraits) {
                if (
                  getActiveBreakpoint(finalCounts[tr] || 0, getTraitBreakpoints(tr)) === 0
                ) {
                  allActive = false;
                  break;
                }
              }
              if (!allActive) continue;

              let breaksTrait = false;
              for (const [tr, origCount] of Object.entries(baseCounts)) {
                if (isPersonalTrait(tr)) continue;
                const bp = getTraitBreakpoints(tr);
                const origBp = getActiveBreakpoint(origCount, bp);
                const newBp = getActiveBreakpoint(finalCounts[tr] || 0, bp);
                if (newBp < origBp) {
                  breaksTrait = true;
                  break;
                }
              }
              if (breaksTrait) continue;

              const assignments = assignEmblemsToUnits(testBoardUnits, emblems, [
                add1Name,
                add2Name,
              ]);
              if (!assignments) continue;

              const { score: synScore, traitUpgrades, realSynergyGain } =
                scoreBoardSynergies(
                  baseCounts,
                  finalCounts,
                  uniqueEmblemTraits,
                  baseTierScore,
                  matchedTraitsCount
                );
              if (!realSynergyGain) continue;

              const cut1Cost = getChampCost(cut1.name);
              const cut2Cost = getChampCost(cut2.name);
              const costDiff = add1Data.cost + add2Data.cost - (cut1Cost + cut2Cost);
              const swap2Score = synScore + costDiff * 5;

              if (!best2Swap || swap2Score > best2Swap.score) {
                const adaptedUnits: AdaptedUnit[] = deck.units.map((u) => {
                  if (u.name === cut1.name) {
                    return {
                      name: add1Name,
                      cost: add1Data.cost,
                      image_url: getTftChampionIcon(add1Name),
                      is_carry: add1Data.cost >= 5,
                      items: [],
                      emblemsEquipped: assignments
                        .filter((a) => a.holderUnitName === add1Name)
                        .map((a) => a.emblem),
                      status: "added",
                    };
                  }
                  if (u.name === cut2.name) {
                    return {
                      name: add2Name,
                      cost: add2Data.cost,
                      image_url: getTftChampionIcon(add2Name),
                      is_carry: add2Data.cost >= 5,
                      items: [],
                      emblemsEquipped: assignments
                        .filter((a) => a.holderUnitName === add2Name)
                        .map((a) => a.emblem),
                      status: "added",
                    };
                  }
                  return {
                    name: u.name,
                    cost: getChampCost(u.name),
                    image_url: u.image_url || getTftChampionIcon(u.id || u.name),
                    is_carry: Boolean(u.is_carry),
                    items: u.items || [],
                    emblemsEquipped: assignments
                      .filter((a) => a.holderUnitName === u.name)
                      .map((a) => a.emblem),
                    status: "kept",
                  };
                });

                best2Swap = {
                  id: "cut_2",
                  label: "2-Unit Swap",
                  shortBadge: "2-Unit Swap",
                  score: swap2Score,
                  traitUpgrades,
                  emblemAssignments: assignments,
                  cuts: [
                    {
                      name: cut1.name,
                      cost: cut1Cost,
                      image_url: cut1.image_url || getTftChampionIcon(cut1.name),
                    },
                    {
                      name: cut2.name,
                      cost: cut2Cost,
                      image_url: cut2.image_url || getTftChampionIcon(cut2.name),
                    },
                  ],
                  additions: [
                    {
                      name: add1Name,
                      cost: add1Data.cost,
                      image_url: getTftChampionIcon(add1Name),
                      traits: add1Data.traits.filter((t) => !isPersonalTrait(t)),
                    },
                    {
                      name: add2Name,
                      cost: add2Data.cost,
                      image_url: getTftChampionIcon(add2Name),
                      traits: add2Data.traits.filter((t) => !isPersonalTrait(t)),
                    },
                  ],
                  units: adaptedUnits,
                  traits: buildAdaptedTraits(finalCounts, baseCounts),
                };
              }
            }
          }
        }
      }
      if (best2Swap) variants.push(best2Swap);
    }

    if (variants.length === 0) continue;
    variants.sort((a, b) => b.score - a.score);

    candidates.push({
      id: deck.id,
      originalDeck: deck,
      tier: deck.tier,
      bestScore: variants[0].score,
      matchRatingPercent: 95,
      variants,
    });
  }

  candidates.sort((a, b) => b.bestScore - a.bestScore);

  if (candidates.length > 0) {
    const maxScore = candidates[0].bestScore;
    for (const c of candidates) {
      const ratio = maxScore > 0 ? c.bestScore / maxScore : 0.8;
      c.matchRatingPercent = Math.min(99, Math.max(72, Math.round(ratio * 96 + 3)));
    }
  }

  const seenDecks = new Set<string>();
  const results: AdaptedComp[] = [];
  for (const c of candidates) {
    if (!seenDecks.has(c.originalDeck.name)) {
      seenDecks.add(c.originalDeck.name);
      results.push(c);
      if (results.length >= 8) break;
    }
  }

  return results;
}

/**
 * Builds enriched AdaptedTrait list (filtering out 1-unit personal traits for cleaner display).
 */
function buildAdaptedTraits(
  newCounts: Record<string, number>,
  baseCounts: Record<string, number>
): AdaptedTrait[] {
  const result: AdaptedTrait[] = [];
  for (const [traitName, count] of Object.entries(newCounts)) {
    if (count <= 0) continue;
    if (isPersonalTrait(traitName)) continue;
    const bp = getTraitBreakpoints(traitName);
    const tier = getTraitTier(count, bp);
    if (!tier) continue;
    // Ignore 1-count Flora Fatalis as a team trait unless >= 2
    if (traitName === "Flora Fatalis" && count < 2) continue;

    const prevCount = baseCounts[traitName] || 0;
    const prevBp = getActiveBreakpoint(prevCount, bp);
    const newBp = getActiveBreakpoint(count, bp);
    const maxBp = bp[bp.length - 1] || 6;
    const isUpgraded = count > prevCount && count <= maxBp;
    const breakpointHit = newBp > prevBp && newBp >= 2;

    result.push({
      name: traitName,
      count,
      tier,
      icon_url: getTftTraitIcon(traitName),
      isUpgraded,
      previousCount: prevCount,
      breakpointHit,
    });
  }

  const tierWeight: Record<string, number> = {
    prismatic: 4,
    gold: 3,
    silver: 2,
    bronze: 1,
  };
  result.sort(
    (a, b) =>
      Number(b.breakpointHit) - Number(a.breakpointHit) ||
      Number(b.isUpgraded) - Number(a.isUpgraded) ||
      (tierWeight[b.tier] || 0) - (tierWeight[a.tier] || 0) ||
      b.count - a.count
  );

  return result;
}
