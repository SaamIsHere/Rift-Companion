import { writable } from "svelte/store";
import type { DraftState } from "../types";

export const draft = writable<DraftState | null>(null);
export const gameflowPhase = writable<string>("None");
