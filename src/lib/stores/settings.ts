import { writable } from "svelte/store";
import type { Settings } from "../types";

export const DEFAULT_SERVER_URL = "https://companion.sam-rift.win";
export const DEFAULT_API_KEY = "";

function getInitialSettings(): Settings {
  const s: Settings = {
    compact_density: false,
    always_on_top: false,
    close_behavior: "close",
    startup_behavior: "none",
    comp_weight: 0.15,
    server_url: DEFAULT_SERVER_URL,
    api_key: DEFAULT_API_KEY,
    theme: "void",
    custom_wallpaper: null,
    wallpaper_scope: "all_tabs",
    auto_import_runes: false,
    auto_import_spells: false,
    auto_import_items: false,
    flash_key: "D",
  };
  if (typeof localStorage !== "undefined") {
    try {
      const savedTheme = localStorage.getItem("rift_active_theme");
      if (savedTheme) s.theme = savedTheme;
      const hasCustom = localStorage.getItem("rift_has_custom_wallpaper") === "true";
      if (hasCustom) s.custom_wallpaper = "custom";
      const savedScope = localStorage.getItem("rift_wallpaper_scope") as any;
      if (savedScope === "landing_only" || savedScope === "all_tabs") s.wallpaper_scope = savedScope;
      const savedClose = localStorage.getItem("rift_close_behavior") as any;
      if (savedClose === "close" || savedClose === "minimize" || savedClose === "tray") s.close_behavior = savedClose;
      const savedStartup = localStorage.getItem("rift_startup_behavior") as any;
      if (savedStartup === "none" || savedStartup === "system_boot" || savedStartup === "league_launch") s.startup_behavior = savedStartup;
      const savedRunes = localStorage.getItem("rift_auto_import_runes");
      if (savedRunes !== null) s.auto_import_runes = savedRunes === "true";
      const savedSpells = localStorage.getItem("rift_auto_import_spells");
      if (savedSpells !== null) s.auto_import_spells = savedSpells === "true";
      const savedItems = localStorage.getItem("rift_auto_import_items");
      if (savedItems !== null) s.auto_import_items = savedItems === "true";
      const savedFlash = localStorage.getItem("rift_flash_key") as "D" | "F";
      if (savedFlash === "D" || savedFlash === "F") s.flash_key = savedFlash;
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
