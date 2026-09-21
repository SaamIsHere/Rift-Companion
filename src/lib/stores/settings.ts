import { writable } from "svelte/store";
import type { Settings } from "../types";

export const DEFAULT_SERVER_URL = "https://companion.sam-rift.win";
export const DEFAULT_API_KEY = "";

function getInitialSettings(): Settings {
  const s: Settings = {
    compact_density: false,
    always_on_top: false,
    comp_weight: 0.15,
    server_url: DEFAULT_SERVER_URL,
    api_key: DEFAULT_API_KEY,
    theme: "void",
    custom_wallpaper: null,
    wallpaper_scope: "landing_only",
  };
  if (typeof localStorage !== "undefined") {
    try {
      const savedTheme = localStorage.getItem("rift_active_theme");
      if (savedTheme) s.theme = savedTheme;
      const hasCustom = localStorage.getItem("rift_has_custom_wallpaper") === "true";
      if (hasCustom) s.custom_wallpaper = "custom";
      const savedScope = localStorage.getItem("rift_wallpaper_scope") as any;
      if (savedScope) s.wallpaper_scope = savedScope;
    } catch {}
  }
  return s;
}

/** Persisted user settings (Issue #15). Mirrors the Rust `Default` until primed. */
export const settings = writable<Settings>(getInitialSettings());

/** Whether the settings modal is currently open. */
export const settingsOpen = writable<boolean>(false);

/** Whether the first-launch activation modal is currently open. */
export const activationOpen = writable<boolean>(false);
