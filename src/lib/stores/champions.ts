import { writable } from "svelte/store";

/** Static champion metadata resolved from Data Dragon. */
export interface ChampionInfo {
  id: number; // numeric champion id, e.g. 266
  key: string; // Data Dragon image key, e.g. "Aatrox"
  name: string; // display name, e.g. "Aatrox"
  tags?: string[]; // e.g. ["Mage", "Assassin"]
}

// Used until the live version is fetched (also the offline fallback).
const FALLBACK_VERSION = "14.12.1";

export const ddragonVersion = writable<string>(FALLBACK_VERSION);
export const championCatalog = writable<Map<number, ChampionInfo>>(new Map());

let loaded = false;

/**
 * Fetch the latest Data Dragon version and full champion catalog exactly once,
 * building a numeric-id → {key, name} map. Data Dragon is a static CDN with
 * permissive CORS, so this works from both the Tauri webview and a browser.
 */
export async function initChampions(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const versions: string[] = await fetch(
      "https://ddragon.leagueoflegends.com/api/versions.json",
      { signal: AbortSignal.timeout(4000) }
    ).then((r) => r.json());
    const version = versions[0] ?? FALLBACK_VERSION;
    ddragonVersion.set(version);

    const res: { data: Record<string, { key: string; id: string; name: string; tags?: string[] }> } =
      await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
        { signal: AbortSignal.timeout(4000) }
      ).then((r) => r.json());

    const map = new Map<number, ChampionInfo>();
    for (const entry of Object.values(res.data)) {
      const id = Number(entry.key);
      map.set(id, { id, key: entry.id, name: entry.name, tags: entry.tags || [] });
    }
    championCatalog.set(map);
  } catch (err) {
    console.error("Failed to load Data Dragon champion catalog", err);
    loaded = false; // allow a retry on the next mount
  }
}
