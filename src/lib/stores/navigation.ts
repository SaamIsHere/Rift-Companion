import { writable, get } from "svelte/store";
import { draft, gameflowPhase } from "./draft";
import type { Role } from "../types";

export type NavTab = "startseite" | "profil" | "champions" | "ranglisten" | "simulation" | "live_match";

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
// and return to STARTSEITE only when the active match fully ends.
draft.subscribe((d) => {
  const isInDraft = d !== null;
  const phase = get(gameflowPhase);
  const isMatchActive = isInDraft || ["ChampSelect", "GameStart", "InProgress", "Reconnect"].includes(phase);

  if (isMatchActive && !previousDraftState) {
    activeTab.set("live_match");
  } else if (!isMatchActive && previousDraftState) {
    activeTab.update((current) => (current === "live_match" ? "startseite" : current));
  }
  previousDraftState = isMatchActive;
});

gameflowPhase.subscribe((phase) => {
  const isMatchActive = ["ChampSelect", "GameStart", "InProgress", "Reconnect"].includes(phase);
  if (isMatchActive && !previousDraftState) {
    activeTab.set("live_match");
    previousDraftState = true;
  } else if (!isMatchActive && previousDraftState && get(draft) === null) {
    activeTab.update((current) => (current === "live_match" ? "startseite" : current));
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
  targetChampion.set({ champion_id, role });
  activeTab.set("champions");
}
