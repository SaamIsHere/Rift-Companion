import { writable, derived, get } from "svelte/store";
import { settings } from "./settings";
import { setSettings, isTauri } from "../ipc/tauri";
import { THEMES, DEFAULT_THEME, getTheme, applyTheme, type ThemeDefinition } from "../themes";
import type { ThemeId, WallpaperScope } from "../types";
import { invoke } from "@tauri-apps/api/core";
import {
  saveWallpaperToDb,
  loadWallpaperFromDb,
  deleteWallpaperFromDb,
} from "../utils/wallpaperDb";

export const activeThemeId = writable<ThemeId>(DEFAULT_THEME);
export const activeTheme = derived<typeof activeThemeId, ThemeDefinition>(
  activeThemeId,
  ($id) => getTheme($id)
);

export const customWallpaper = writable<string | null>(null);
export const wallpaperScope = writable<WallpaperScope>("landing_only");

let initialized = false;

/**
 * Initialize theme and wallpaper from settings store and persistent storage.
 * Call on app mount.
 */
export async function initTheme(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Apply default theme immediately to avoid flash of unstyled content
  const initialTheme = getTheme(DEFAULT_THEME);
  applyTheme(initialTheme);

  // Load wallpaper from IndexedDB first (lightning fast, reliable)
  try {
    const dbWallpaper = await loadWallpaperFromDb();
    if (dbWallpaper) {
      customWallpaper.set(dbWallpaper);
    } else if (isTauri) {
      // Fallback: If IndexedDB was empty, try reading from disk via Tauri IPC
      try {
        const diskWallpaper = await invoke<string | null>("get_custom_wallpaper");
        if (diskWallpaper) {
          customWallpaper.set(diskWallpaper);
          await saveWallpaperToDb(diskWallpaper);
        }
      } catch (err) {
        console.warn("Could not check disk for custom wallpaper", err);
      }
    }
  } catch (err) {
    console.warn("Failed to load initial wallpaper from IndexedDB", err);
  }

  // Subscribe to settings changes from backend priming or user actions
  settings.subscribe(async ($settings) => {
    if (!$settings) return;

    if ($settings.theme && $settings.theme !== get(activeThemeId)) {
      const themeId = $settings.theme as ThemeId;
      activeThemeId.set(themeId);
      applyTheme(getTheme(themeId));
    }

    if ($settings.wallpaper_scope && $settings.wallpaper_scope !== get(wallpaperScope)) {
      wallpaperScope.set($settings.wallpaper_scope);
    }

    // If backend reports no custom wallpaper, ensure frontend store is cleared
    if ($settings.custom_wallpaper === null && get(customWallpaper) !== null) {
      customWallpaper.set(null);
      await deleteWallpaperFromDb();
    } else if ($settings.custom_wallpaper && !get(customWallpaper)) {
      // Backend says custom wallpaper is active but store is empty
      const dbWallpaper = await loadWallpaperFromDb();
      if (dbWallpaper) {
        customWallpaper.set(dbWallpaper);
      } else if (isTauri) {
        try {
          const diskWallpaper = await invoke<string | null>("get_custom_wallpaper");
          if (diskWallpaper) {
            customWallpaper.set(diskWallpaper);
            await saveWallpaperToDb(diskWallpaper);
          }
        } catch {}
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

        // 1. Set immediately in Svelte store for instant 0ms preview
        customWallpaper.set(dataUrl);

        // 2. Persist in IndexedDB (survives app restarts without file path issues)
        await saveWallpaperToDb(dataUrl);

        // 3. Also persist file to disk via Tauri IPC if running in desktop app
        if (isTauri) {
          try {
            const ext = file.name.split(".").pop() || "jpg";
            await invoke<string>("save_custom_wallpaper", {
              base64Data: dataUrl,
              extension: ext,
            });
          } catch (ipcErr) {
            console.warn("Could not save to app data directory via IPC", ipcErr);
          }
        }

        // 4. Update settings to indicate custom wallpaper is active
        settings.update((s) => ({ ...s, custom_wallpaper: "custom" }));
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
  await deleteWallpaperFromDb();

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
