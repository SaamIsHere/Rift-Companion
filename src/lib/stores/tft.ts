import { writable, get } from "svelte/store";
import type { TftMetaDeck, TftItem, TftAugment } from "../types";
import { getTftMetaDecks, getTftItemCombinations, getTftAugments } from "../ipc/tauri";
import { isTftTankItem } from "../utils/tftAssets";

export interface TftSearchToken {
  id: string;
  name: string;
  type: "unit" | "item";
  imageUrl: string;
}

export type TftSubTab = "meta" | "items" | "emblems" | "augments";

export const activeTftSubTab = writable<TftSubTab>("meta");
export const tftMetaDecks = writable<TftMetaDeck[]>([]);
export const tftSelectedDeck = writable<TftMetaDeck | null>(null);
export const tftItems = writable<TftItem[]>([]);
export const tftAugments = writable<TftAugment[]>([]);
export const tftInventoryComponents = writable<string[]>([]);
export const tftSelectedEmblems = writable<string[]>([]);
export const tftSearchQuery = writable<string>("");
export const tftSelectedFilterTokens = writable<TftSearchToken[]>([]);
export const tftLoading = writable<boolean>(false);
export const tftError = writable<string | null>(null);

let dataLoaded = false;

function sanitizeDeckCells(deck: TftMetaDeck): TftMetaDeck {
  if (!deck.units || deck.units.length === 0) return deck;
  const used = new Set<string>();
  let needsRepair = false;
  for (const u of deck.units) {
    if (!u.cell || u.cell.x < 1 || u.cell.x > 7 || u.cell.y < 1 || u.cell.y > 4) {
      needsRepair = true;
      break;
    }
    const k = `${u.cell.x},${u.cell.y}`;
    if (used.has(k)) {
      needsRepair = true;
      break;
    }
    used.add(k);
  }
  if (!needsRepair) return deck;

  const usedCells = new Set<string>();
  const frontCols = [4, 3, 5, 2, 6, 1, 7];
  const backCols = [1, 7, 2, 6, 3, 5, 4];

  const sanitizedUnits = deck.units.map((u) => {
    if (u.cell && u.cell.x >= 1 && u.cell.x <= 7 && u.cell.y >= 1 && u.cell.y <= 4) {
      const k = `${u.cell.x},${u.cell.y}`;
      if (!usedCells.has(k)) {
        usedCells.add(k);
        return { ...u, cell: { ...u.cell } };
      }
    }
    return { ...u, cell: null as any };
  });

  for (const u of sanitizedUnits) {
    if (u.cell) continue;
    const isTank =
      (u.items && u.items.some((i) => isTftTankItem(i.id || i.name))) ||
      (!u.is_carry && (!u.items || u.items.length === 0));
    const preferredRows = isTank ? [4, 3, 2, 1] : [1, 2, 3, 4];
    const preferredCols = isTank ? frontCols : backCols;
    let placed = false;
    for (const y of preferredRows) {
      for (const x of preferredCols) {
        const k = `${x},${y}`;
        if (!usedCells.has(k)) {
          usedCells.add(k);
          u.cell = { x, y };
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }

  return { ...deck, units: sanitizedUnits };
}

export async function loadTftData(force: boolean = false): Promise<void> {
  if (dataLoaded && !force) return;
  tftLoading.set(true);
  tftError.set(null);

  try {
    const [decks, items, augments] = await Promise.all([
      getTftMetaDecks("en"),
      getTftItemCombinations("en"),
      getTftAugments("en"),
    ]);

    if (decks && decks.length > 0) {
      const cleanedDecks = decks.map(sanitizeDeckCells);
      tftMetaDecks.set(cleanedDecks);
    }

    if (items && items.length > 0) {
      tftItems.set(items);
    }

    if (augments && augments.length > 0) {
      tftAugments.set(augments);
    }

    dataLoaded = true;
  } catch (err) {
    console.error("Failed to load TFT data", err);
    tftError.set(err instanceof Error ? err.message : String(err));
  } finally {
    tftLoading.set(false);
  }
}

export function selectTftDeck(deck: TftMetaDeck | null) {
  tftSelectedDeck.set(deck);
}

export function addInventoryComponent(compId: string) {
  tftInventoryComponents.update((list) => [...list, compId]);
}

export function removeInventoryComponent(index: number) {
  tftInventoryComponents.update((list) => list.filter((_, i) => i !== index));
}

export function clearInventoryComponents() {
  tftInventoryComponents.set([]);
}

export function addSearchFilterToken(token: TftSearchToken): boolean {
  let added = false;
  tftSelectedFilterTokens.update((current) => {
    if (current.length >= 4) return current;
    if (current.some((t) => t.id === token.id && t.type === token.type)) return current;
    added = true;
    return [...current, token];
  });
  return added;
}

export function removeSearchFilterToken(tokenId: string, tokenType: "unit" | "item") {
  tftSelectedFilterTokens.update((current) =>
    current.filter((t) => !(t.id === tokenId && t.type === tokenType))
  );
}

export function clearSearchFilterTokens() {
  tftSelectedFilterTokens.set([]);
}

export function addSelectedEmblem(emblemId: string): boolean {
  let added = false;
  tftSelectedEmblems.update((current) => {
    if (current.length >= 4) {
      return current; // Max 4 emblems total
    }
    const sameCount = current.filter((id) => id === emblemId).length;
    if (sameCount >= 3) {
      return current; // Max 3 of the same emblem
    }
    added = true;
    return [...current, emblemId];
  });
  return added;
}

export function removeSelectedEmblem(emblemId: string) {
  tftSelectedEmblems.update((current) => {
    const idx = current.lastIndexOf(emblemId);
    if (idx === -1) return current;
    const copy = [...current];
    copy.splice(idx, 1);
    return copy;
  });
}

export function clearSelectedEmblems() {
  tftSelectedEmblems.set([]);
}

