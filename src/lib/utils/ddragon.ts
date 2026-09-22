// Static asset helpers (Data Dragon). Champion icons are keyed by the
// champion's string id (the "key" field), not the numeric id.

/** Champion square portrait URL from its Data Dragon key + version. */
export function squareIconUrl(key: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}

/** Summoner profile icon URL from its numeric icon id + version. */
export function profileIconUrl(iconId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

/** Champion full splash art URL (wide 1215x717). */
export function splashArtUrl(key: string, skinNum = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_${skinNum}.jpg`;
}

/** Champion vertical loading art URL (308x560). */
export function loadingArtUrl(key: string, skinNum = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${key}_${skinNum}.jpg`;
}

/** Item icon URL from its numeric item id + version. */
export function itemIconUrl(itemId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

/** Summoner's Rift map image URL from Data Dragon */
export function summonersRiftMapUrl(version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/map/map11.png`;
}

/** Champion ability spell icon URL from spell image filename + version. */
export function championSpellIconUrl(spellImage: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spellImage}`;
}

/** Champion passive icon URL from passive image filename + version. */
export function championPassiveIconUrl(passiveImage: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${passiveImage}`;
}

const SUMMONER_SPELL_IMAGES: Record<string | number, string> = {
  1: "SummonerBoost.png",
  3: "SummonerExhaust.png",
  4: "SummonerFlash.png",
  6: "SummonerHaste.png",
  7: "SummonerHeal.png",
  11: "SummonerSmite.png",
  12: "SummonerTeleport.png",
  13: "SummonerMana.png",
  14: "SummonerDot.png",
  21: "SummonerBarrier.png",
  32: "SummonerSnowball.png",
  cleanse: "SummonerBoost.png",
  exhaust: "SummonerExhaust.png",
  flash: "SummonerFlash.png",
  ghost: "SummonerHaste.png",
  heal: "SummonerHeal.png",
  smite: "SummonerSmite.png",
  teleport: "SummonerTeleport.png",
  clarity: "SummonerMana.png",
  ignite: "SummonerDot.png",
  barrier: "SummonerBarrier.png",
  mark: "SummonerSnowball.png",
};

/** Summoner spell icon URL. */
export function summonerSpellIconUrl(idOrName: number | string, version: string): string {
  const key = typeof idOrName === "string" ? idOrName.toLowerCase().replace(/[^a-z]/g, "") : idOrName;
  const fileName = SUMMONER_SPELL_IMAGES[key] || "SummonerFlash.png";
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${fileName}`;
}

const STAT_MOD_ICONS: Record<number, string> = {
  5008: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
  5005: "perk-images/StatMods/StatModsAttackSpeedIcon.png",
  5007: "perk-images/StatMods/StatModsCDRScalingIcon.png",
  5010: "perk-images/StatMods/StatModsMovementSpeedIcon.png",
  5001: "perk-images/StatMods/StatModsHealthScalingIcon.png",
  5011: "perk-images/StatMods/StatModsHealthPlusIcon.png",
  5013: "perk-images/StatMods/StatModsTenacityIcon.png",
};

/** Stat shard modifier icon URL. */
export function statModIconUrl(modId?: number | null): string {
  const path = (modId && STAT_MOD_ICONS[modId]) || "perk-images/StatMods/StatModsAdaptiveForceIcon.png";
  return `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
}

export interface RuneMeta {
  id: number;
  name: string;
  icon: string;
  styleId?: number;
  styleName?: string;
  styleIcon?: string;
}

let runesCache: Map<number, RuneMeta> | null = null;
let runesPromise: Promise<Map<number, RuneMeta>> | null = null;

const STYLE_ICONS: Record<number, string> = {
  8000: "perk-images/Styles/7201_Precision.png",
  8100: "perk-images/Styles/7200_Domination.png",
  8200: "perk-images/Styles/7202_Sorcery.png",
  8300: "perk-images/Styles/7203_Whimsy.png", // Inspiration
  8400: "perk-images/Styles/7204_Resolve.png",
};

const WELL_KNOWN_RUNE_ICONS: Record<number, string> = {
  // Precision
  8005: "perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png",
  8008: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png",
  8010: "perk-images/Styles/Precision/Conqueror/Conqueror.png",
  8021: "perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png",
  // Domination
  8112: "perk-images/Styles/Domination/Electrocute/Electrocute.png",
  8124: "perk-images/Styles/Domination/Predator/Predator.png",
  8128: "perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png",
  9923: "perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png",
  // Sorcery
  8214: "perk-images/Styles/Sorcery/SummonAery/SummonAery.png",
  8229: "perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png",
  8230: "perk-images/Styles/Sorcery/PhaseRush/StormraidersSurgeRuneIcon2.png",
  // Resolve
  8437: "perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png",
  8439: "perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png",
  8465: "perk-images/Styles/Resolve/Guardian/Guardian.png",
  // Inspiration
  8351: "perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png",
  8360: "perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png",
  8369: "perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png",
};

/** Style/Path tree icon URL (Precision, Domination, Sorcery, etc.). */
export function runeStyleIconUrl(styleId?: number | null): string {
  if (!styleId) return "";
  const path = STYLE_ICONS[styleId] || "perk-images/Styles/7201_Precision.png";
  return `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
}

/**
 * Load all runes and styles from Data Dragon once and cache them.
 */
export async function loadRunesReforged(version = "16.18.1"): Promise<Map<number, RuneMeta>> {
  if (runesCache) return runesCache;
  if (runesPromise) return runesPromise;

  runesPromise = (async () => {
    try {
      const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const styles = await res.json();
      const map = new Map<number, RuneMeta>();

      for (const s of styles) {
        map.set(s.id, {
          id: s.id,
          name: s.name,
          icon: s.icon,
          styleId: s.id,
          styleName: s.name,
          styleIcon: s.icon,
        });
        for (const slot of s.slots || []) {
          for (const r of slot.runes || []) {
            map.set(r.id, {
              id: r.id,
              name: r.name,
              icon: r.icon,
              styleId: s.id,
              styleName: s.name,
              styleIcon: s.icon,
            });
          }
        }
      }
      runesCache = map;
      return map;
    } catch (e) {
      console.warn("Failed to load runesReforged.json", e);
      runesPromise = null;
      return new Map();
    }
  })();

  return runesPromise;
}

export interface RuneTreeSlotRune {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc?: string;
}

export interface RuneTreeSlot {
  runes: RuneTreeSlotRune[];
}

export interface RuneTreeStyle {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: RuneTreeSlot[];
}

let fullRuneStylesCache: RuneTreeStyle[] | null = null;
let fullRuneStylesPromise: Promise<RuneTreeStyle[]> | null = null;

export async function loadFullRuneStyles(version = "16.18.1"): Promise<RuneTreeStyle[]> {
  if (fullRuneStylesCache) return fullRuneStylesCache;
  if (fullRuneStylesPromise) return fullRuneStylesPromise;

  fullRuneStylesPromise = (async () => {
    try {
      const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const styles: RuneTreeStyle[] = await res.json();
      fullRuneStylesCache = styles;
      return styles;
    } catch (e) {
      console.warn("Failed to load full rune styles", e);
      fullRuneStylesPromise = null;
      return [];
    }
  })();

  return fullRuneStylesPromise;
}

export const STAT_SHARD_ROWS = [
  // Slot 1 (Offense): Adaptive Force, Attack Speed, Ability Haste
  [
    { id: 5008, name: "Adaptive Force" },
    { id: 5005, name: "Attack Speed" },
    { id: 5007, name: "Ability Haste" },
  ],
  // Slot 2 (Flex): Adaptive Force, Movement Speed, Scaling Health
  [
    { id: 5008, name: "Adaptive Force" },
    { id: 5010, name: "Move Speed" },
    { id: 5001, name: "Scaling Health" },
  ],
  // Slot 3 (Defense): Flat Health, Tenacity & Slow Resist, Scaling Health
  [
    { id: 5011, name: "Health" },
    { id: 5013, name: "Tenacity and Slow Resist" },
    { id: 5001, name: "Scaling Health" },
  ],
];

/** Get image URL for a rune ID using cached or fallback metadata. */
export function getRuneIconUrl(runeId?: number | null, runesMap?: Map<number, RuneMeta> | null): string {
  if (!runeId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/runesicon.png`;
  }
  const meta = runesMap?.get(runeId) || runesCache?.get(runeId);
  if (meta?.icon) {
    return `https://ddragon.leagueoflegends.com/cdn/img/${meta.icon}`;
  }
  // Check well-known keystones (e.g. Lethal Tempo 8008, Conqueror 8010, etc.)
  if (WELL_KNOWN_RUNE_ICONS[runeId]) {
    return `https://ddragon.leagueoflegends.com/cdn/img/${WELL_KNOWN_RUNE_ICONS[runeId]}`;
  }
  // Check style path icons (8000, 8100, 8200, 8300, 8400)
  if (STYLE_ICONS[runeId]) {
    return runeStyleIconUrl(runeId);
  }
  // Check stat mod fallback
  if (STAT_MOD_ICONS[runeId]) {
    return statModIconUrl(runeId);
  }
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/runesicon.png`;
}

export interface ChampionDetailedSpells {
  passive: { name: string; description: string; image: string };
  spells: Array<{ id: string; name: string; description: string; image: string; hotkey: string }>;
  title: string;
  difficulty: number;
  tags: string[];
}

const champDetailsCache = new Map<string, ChampionDetailedSpells>();

/** Fetch full champion spell info, passive, title, and tags from Data Dragon. */
export async function getChampionDetailedInfo(
  champKey: string,
  version = "16.17.1"
): Promise<ChampionDetailedSpells | null> {
  if (champDetailsCache.has(champKey)) {
    return champDetailsCache.get(champKey)!;
  }
  try {
    const res = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${champKey}.json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data[champKey];
    if (!data) return null;

    const hotkeys = ["Q", "W", "E", "R"];
    const spells = (data.spells || []).map((s: any, idx: number) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      image: s.image?.full || "",
      hotkey: hotkeys[idx] || "",
    }));

    const result: ChampionDetailedSpells = {
      passive: {
        name: data.passive?.name || "",
        description: data.passive?.description || "",
        image: data.passive?.image?.full || "",
      },
      spells,
      title: data.title || "",
      difficulty: data.info?.difficulty || 5,
      tags: data.tags || [],
    };

    champDetailsCache.set(champKey, result);
    return result;
  } catch (e) {
    console.warn(`Failed to fetch champion details for ${champKey}`, e);
    return null;
  }
}

/**
 * URL for ranked tier medal graphic.
 */
export function tierMedalUrl(tier?: string | null): string {
  if (!tier) return "https://opgg-static.akamaized.net/images/medals_new/default_unranked.svg";
  const t = tier.toLowerCase().replace("_plus", "").replace(" ", "");
  if (t === "none" || t === "unranked") {
    return "https://opgg-static.akamaized.net/images/medals_new/default_unranked.svg";
  }
  return `https://opgg-static.akamaized.net/images/medals_new/${t}.png`;
}

/**
 * Format relative elapsed time (e.g. "5m ago", "2h ago", "3d ago").
 */
export function formatTimeAgo(timestamp: number | string | Date): string {
  const time = typeof timestamp === "string" || timestamp instanceof Date ? new Date(timestamp).getTime() : timestamp;
  if (!time || isNaN(time)) return "";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - time) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

/**
 * Format game duration into MM:SS or Xm Ys.
 */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0m 0s";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

/**
 * Human-readable queue name from queue ID or type string.
 */
export function queueNameFromId(queue?: number | string | null): string {
  if (queue == null) return "Normal";
  if (typeof queue === "string") {
    const u = queue.toUpperCase();
    if (u.includes("SOLO")) return "Ranked Solo";
    if (u.includes("FLEX")) return "Ranked Flex";
    if (u.includes("ARAM")) return "ARAM";
    if (u.includes("ARENA") || u.includes("CHERRY")) return "Arena";
    if (u.includes("NORMAL")) return "Normal";
    return queue;
  }
  switch (queue) {
    case 420:
      return "Ranked Solo";
    case 440:
      return "Ranked Flex";
    case 450:
      return "ARAM";
    case 400:
      return "Normal Draft";
    case 430:
      return "Normal Blind";
    case 490:
      return "Quickplay";
    case 1700:
      return "Arena";
    case 700:
      return "Clash";
    default:
      return "Normal Game";
  }
}

const ROLE_POSITION_MAP: Record<string, string> = {
  all: "fill",
  fill: "fill",
  top: "top",
  jungle: "jungle",
  mid: "middle",
  middle: "middle",
  adc: "bottom",
  bot: "bottom",
  bottom: "bottom",
  support: "utility",
  utility: "utility",
};

/** Official League position / lane icon URL (bundled locally for instant offline loading) */
export function roleIconUrl(role: string): string {
  const norm = (role || "").toLowerCase().trim();
  const pos = ROLE_POSITION_MAP[norm] || "fill";
  return `/roles/icon-position-${pos}.png`;
}

