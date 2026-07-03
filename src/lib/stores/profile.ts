import { writable } from "svelte/store";
import type { Summoner } from "../types";

// null while searching/disconnected, or before the LCU profile fetch resolves.
export const profile = writable<Summoner | null>(null);
