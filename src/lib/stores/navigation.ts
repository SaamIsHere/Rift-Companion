import { writable } from "svelte/store";
import { draft } from "./draft";
import type { Role } from "../types";

export type NavTab = "startseite" | "profil" | "champions" | "ranglisten" | "simulation" | "live_match";

const validTabs: NavTab[] = ["startseite", "profil", "champions", "ranglisten", "simulation", "live_match"];
const savedTab = typeof localStorage !== "undefined" ? (localStorage.getItem("rift_active_tab") as NavTab) : null;
const initialTab: NavTab = savedTab && validTabs.includes(savedTab) && savedTab !== "live_match" ? savedTab : "startseite";

export const activeTab = writable<NavTab>(initialTab);

activeTab.subscribe((tab) => {
  try {
    if (typeof localStorage !== "undefined" && tab && tab !== "live_match") {
      localStorage.setItem("rift_active_tab", tab);
    }
  } catch {}
});

let previousDraftState: boolean = false;

// Automatically navigate to LIVE MATCH when champion select begins,
// and return to STARTSEITE when champion select closes.
draft.subscribe((d) => {
  const isInDraft = d !== null;
  if (isInDraft && !previousDraftState) {
    activeTab.set("live_match");
  } else if (!isInDraft && previousDraftState) {
    activeTab.update((current) => (current === "live_match" ? "startseite" : current));
  }
  previousDraftState = isInDraft;
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
