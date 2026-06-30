import { writable } from "svelte/store";
import type { ConnectionStatus } from "../types";

export const connection = writable<ConnectionStatus>("searching");
