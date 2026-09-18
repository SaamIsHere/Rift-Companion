import { writable } from "svelte/store";
import type { Settings } from "../types";

/** Persisted user settings (Issue #15). Mirrors the Rust `Default` until primed. */
export const settings = writable<Settings>({
  compact_density: false,
  always_on_top: false,
  comp_weight: 0.15,
  server_url: "",
  theme: "void",
  custom_wallpaper: null,
  wallpaper_scope: "landing_only",
});

/** Whether the settings modal is currently open. */
export const settingsOpen = writable<boolean>(false);
