import { writable, get } from "svelte/store";
import { draft, gameflowPhase } from "./draft";
import { postGameMatch } from "./postGame";
import type { Role } from "../types";

export type NavTab = "startseite" | "profil" | "champions" | "ranglisten" | "simulation" | "live_match" | "post_game";

export type GameMode = "lol" | "tft";

const GAME_MODE_STORAGE_KEY = "rift_active_game_mode";

function getInitialGameMode(): GameMode {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(GAME_MODE_STORAGE_KEY);
      if (saved === "lol" || saved === "tft") return saved;
    }
  } catch {}
  return "lol";
}

export const activeGameMode = writable<GameMode>(getInitialGameMode());

if (typeof localStorage !== "undefined") {
  activeGameMode.subscribe((val) => {
    try {
      if (val) localStorage.setItem(GAME_MODE_STORAGE_KEY, val);
    } catch {}
  });
}

// Always start on startseite on cold launch
export const activeTab = writable<NavTab>("startseite");

// Clean up any previously stored active tab from earlier versions
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("rift_active_tab");
  }
} catch {}

let previousDraftState: boolean = false;

// Automatically navigate to LIVE MATCH when champion select or match begins,
// and transition to POST GAME (instead of kicking to startseite) when match ends.
draft.subscribe((d) => {
  const isInDraft = d !== null && (d.allies?.length > 0 || d.enemies?.length > 0);
  const phase = get(gameflowPhase);
  const isMatchActive = isInDraft || phase === "ChampSelect";

  if (isMatchActive && !previousDraftState) {
    activeGameMode.set("lol");
    activeTab.set("live_match");
  } else if (!isMatchActive && previousDraftState) {
    const isPostGamePhase = ["WaitingForStats", "PreEndOfGame", "EndOfGame"].includes(phase);
    activeTab.update((current) => (current === "live_match" ? (isPostGamePhase ? "post_game" : "startseite") : current));
  }
  previousDraftState = isMatchActive;
});

gameflowPhase.subscribe((phase) => {
  const currentDraft = get(draft);
  const hasDraft = currentDraft !== null && (currentDraft.allies?.length > 0 || currentDraft.enemies?.length > 0);
  const isMatchActive = phase === "ChampSelect" || (["GameStart", "InProgress", "Reconnect"].includes(phase) && hasDraft);

  if (isMatchActive && !previousDraftState) {
    activeGameMode.set("lol");
    activeTab.set("live_match");
    previousDraftState = true;
  } else if (!isMatchActive && previousDraftState && !hasDraft) {
    // When game concludes, transition to post_game screen rather than dumping to startseite!
    const isPostGamePhase = ["WaitingForStats", "PreEndOfGame", "EndOfGame"].includes(phase);
    activeTab.update((current) => (current === "live_match" ? (isPostGamePhase ? "post_game" : "startseite") : current));
    previousDraftState = false;
  }
});

export const championsViewReset = writable<number>(0);

export function resetChampionsView() {
  championsViewReset.update((n) => n + 1);
}

export interface TargetChampionNav {
  champion_id: number;
  role?: Role;
}

export const targetChampion = writable<TargetChampionNav | null>(null);

export function navigateToChampion(champion_id: number, role?: Role) {
  activeGameMode.set("lol");
  targetChampion.set({ champion_id, role });
  activeTab.set("champions");
}
