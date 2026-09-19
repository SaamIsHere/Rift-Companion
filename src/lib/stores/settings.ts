import { writable } from "svelte/store";
import type { Settings } from "../types";

export const DEFAULT_SERVER_URL = "https://companion.sam-rift.win";
export const DEFAULT_API_KEY = "your-friends-secret-api-key-here";

/** Persisted user settings (Issue #15). Mirrors the Rust `Default` until primed. */
export const settings = writable<Settings>({
  compact_density: false,
  always_on_top: false,
  comp_weight: 0.15,
  server_url: DEFAULT_SERVER_URL,
  api_key: DEFAULT_API_KEY,
  theme: "void",
  custom_wallpaper: null,
  wallpaper_scope: "landing_only",
});

/** Whether the settings modal is currently open. */
export const settingsOpen = writable<boolean>(false);
