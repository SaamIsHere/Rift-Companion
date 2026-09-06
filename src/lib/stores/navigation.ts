import { writable } from "svelte/store";
import { draft } from "./draft";

export type NavTab = "startseite" | "profil" | "champions" | "ranglisten" | "live_match";

export const activeTab = writable<NavTab>("startseite");

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
