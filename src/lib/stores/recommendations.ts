import { writable } from "svelte/store";
import type { Recommendation } from "../types";

export const recommendations = writable<Recommendation[]>([]);
