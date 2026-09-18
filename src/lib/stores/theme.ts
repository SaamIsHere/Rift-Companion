import { writable, derived, get } from "svelte/store";
import { settings } from "./settings";
import { setSettings, isTauri } from "../ipc/tauri";
import { THEMES, DEFAULT_THEME, getTheme, applyTheme, type ThemeDefinition } from "../themes";
import type { ThemeId, WallpaperScope } from "../types";
import { invoke } from "@tauri-apps/api/core";

const LOCAL_STORAGE_CUSTOM_WALLPAPER_KEY = "rift_custom_wallpaper_data";

function getStoredLocalWallpaper(): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(LOCAL_STORAGE_CUSTOM_WALLPAPER_KEY);
    }
  } catch {}
  return null;
}

export const activeThemeId = writable<ThemeId>(DEFAULT_THEME);
export const activeTheme = derived<typeof activeThemeId, ThemeDefinition>(
  activeThemeId,
  ($id) => getTheme($id)
);

export const customWallpaper = writable<string | null>(getStoredLocalWallpaper());
export const wallpaperScope = writable<WallpaperScope>("landing_only");

let initialized = false;

/**
 * Initialize theme and wallpaper from settings store.
 * Call on app mount.
 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;

  // Apply default theme immediately to avoid flash of unstyled content
  const initialTheme = getTheme(DEFAULT_THEME);
  applyTheme(initialTheme);

  // Subscribe to settings changes from backend priming or user actions
  settings.subscribe(($settings) => {
    if (!$settings) return;

    if ($settings.theme && $settings.theme !== get(activeThemeId)) {
      const themeId = $settings.theme as ThemeId;
      activeThemeId.set(themeId);
      applyTheme(getTheme(themeId));
    }

    if ($settings.wallpaper_scope && $settings.wallpaper_scope !== get(wallpaperScope)) {
      wallpaperScope.set($settings.wallpaper_scope);
    }

    if ($settings.custom_wallpaper !== undefined) {
      if ($settings.custom_wallpaper) {
        customWallpaper.set($settings.custom_wallpaper);
      } else {
        const local = getStoredLocalWallpaper();
        if (local) {
          customWallpaper.set(local);
        }
      }
    }
  });
}

/**
 * Switch to a specific theme by ID and persist to settings.
 */
export function selectTheme(themeId: ThemeId): void {
  const def = getTheme(themeId);
  activeThemeId.set(themeId);
  applyTheme(def);

  settings.update((s) => ({ ...s, theme: themeId }));
  void setSettings(get(settings));
}

/**
 * Shuffle through available themes randomly (guarantees a different theme).
 */
export function shuffleTheme(): ThemeDefinition {
  const current = get(activeThemeId);
  const others = THEMES.filter((t) => t.id !== current);
  const next = others[Math.floor(Math.random() * others.length)] || THEMES[0];
  selectTheme(next.id);
  return next;
}

/**
 * Set wallpaper scope ("landing_only" vs "all_tabs").
 */
export function setWallpaperScope(scope: WallpaperScope): void {
  wallpaperScope.set(scope);
  settings.update((s) => ({ ...s, wallpaper_scope: scope }));
  void setSettings(get(settings));
}

/**
 * Upload and save a custom wallpaper image.
 */
export async function uploadCustomWallpaper(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        customWallpaper.set(dataUrl);

        try {
          if (typeof localStorage !== "undefined") {
            // Keep in localStorage for fast webview bootstrap
            localStorage.setItem(LOCAL_STORAGE_CUSTOM_WALLPAPER_KEY, dataUrl);
          }
        } catch (e) {
          console.warn("LocalStorage full or disabled for wallpaper", e);
        }

        let persistentPath = dataUrl;
        if (isTauri) {
          try {
            const ext = file.name.split(".").pop() || "jpg";
            persistentPath = await invoke<string>("save_custom_wallpaper", {
              base64Data: dataUrl,
              extension: ext,
            });
          } catch (ipcErr) {
            console.warn("Could not save to app data directory via IPC, using data URL", ipcErr);
          }
        }

        settings.update((s) => ({ ...s, custom_wallpaper: persistentPath }));
        await setSettings(get(settings));
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Clear custom wallpaper and revert to active theme's default artwork.
 */
export async function clearCustomWallpaper(): Promise<void> {
  customWallpaper.set(null);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LOCAL_STORAGE_CUSTOM_WALLPAPER_KEY);
    }
  } catch {}

  if (isTauri) {
    try {
      await invoke("delete_custom_wallpaper");
    } catch (e) {
      console.warn("Failed to delete custom wallpaper on disk", e);
    }
  }

  settings.update((s) => ({ ...s, custom_wallpaper: null }));
  await setSettings(get(settings));
}
