import { writable } from "svelte/store";
import type { ScoringMode } from "../types";

export const scoringMode = writable<ScoringMode>("default");
