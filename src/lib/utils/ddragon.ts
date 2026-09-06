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

/** Style/Path tree icon URL (Precision, Domination, Sorcery, etc.). */
export function runeStyleIconUrl(styleId?: number): string {
  const path = (styleId && STYLE_ICONS[styleId]) || "perk-images/Styles/7201_Precision.png";
  return `https://ddragon.leagueoflegends.com/cdn/img/${path}`;
}

/**
 * Load all runes and styles from Data Dragon once and cache them.
 */
export async function loadRunesReforged(version = "16.17.1"): Promise<Map<number, RuneMeta>> {
  if (runesCache) return runesCache;
  if (runesPromise) return runesPromise;

  runesPromise = (async () => {
    try {
      const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const styles = await res.json();
      const map = new Map<number, RuneMeta>();

      for (const s of styles) {
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

/** Get image URL for a rune ID using cached or fallback metadata. */
export function getRuneIconUrl(runeId?: number | null, runesMap?: Map<number, RuneMeta> | null): string {
  if (!runeId) {
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/runesicon.png`;
  }
  const meta = runesMap?.get(runeId) || runesCache?.get(runeId);
  if (meta?.icon) {
    return `https://ddragon.leagueoflegends.com/cdn/img/${meta.icon}`;
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

