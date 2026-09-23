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
  getCachedWallpaperSync,
  hasCustomWallpaperSync,
  setWallpaperCacheSync,
  clearWallpaperCacheSync,
} from "../utils/wallpaperDb";

// Synchronously read last saved theme from localStorage to eliminate FOUC on launch
const initialThemeId: ThemeId = (() => {
  if (typeof localStorage !== "undefined") {
    try {
      const saved = localStorage.getItem("rift_active_theme");
      if (saved && THEMES.some((t) => t.id === saved)) {
        return saved as ThemeId;
      }
    } catch {}
  }
  return DEFAULT_THEME;
})();

export const activeThemeId = writable<ThemeId>(initialThemeId);
export const activeTheme = derived<typeof activeThemeId, ThemeDefinition>(
  activeThemeId,
  ($id) => getTheme($id)
);

// Synchronously read last saved wallpaper scope
const initialScope: WallpaperScope = (() => {
  if (typeof localStorage !== "undefined") {
    try {
      const saved = localStorage.getItem("rift_wallpaper_scope");
      if (saved === "landing_only" || saved === "all_tabs") {
        return saved as WallpaperScope;
      }
    } catch {}
  }
  return "all_tabs";
})();

export const wallpaperScope = writable<WallpaperScope>(initialScope);

// Synchronously restore custom wallpaper and custom flag so frame 0 renders the custom image
export const hasCustomWallpaper = writable<boolean>(hasCustomWallpaperSync());
export const customWallpaper = writable<string | null>(getCachedWallpaperSync());

// Apply theme CSS variables immediately upon module evaluation
if (typeof document !== "undefined") {
  applyTheme(getTheme(initialThemeId));
}

let initialized = false;

/**
 * Initialize theme and wallpaper from settings store and persistent storage.
 * Runs proactively at startup.
 */
export async function initTheme(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Re-apply active theme
  applyTheme(getTheme(get(activeThemeId)));

  // Load high-resolution wallpaper from IndexedDB
  try {
    const dbWallpaper = await loadWallpaperFromDb();
    if (dbWallpaper) {
      hasCustomWallpaper.set(true);
      customWallpaper.set(dbWallpaper);
      setWallpaperCacheSync(dbWallpaper);
    } else if (isTauri) {
      // Fallback: If IndexedDB was empty, try reading from disk via Tauri IPC
      try {
        const diskWallpaper = await invoke<string | null>("get_custom_wallpaper");
        if (diskWallpaper) {
          hasCustomWallpaper.set(true);
          customWallpaper.set(diskWallpaper);
          await saveWallpaperToDb(diskWallpaper);
          setWallpaperCacheSync(diskWallpaper);
        } else if (hasCustomWallpaperSync()) {
          // If disk confirmed no custom wallpaper exists, clear stale cache
          hasCustomWallpaper.set(false);
          customWallpaper.set(null);
          clearWallpaperCacheSync();
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
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("rift_active_theme", themeId);
        } catch {}
      }
    }

    if ($settings.wallpaper_scope && $settings.wallpaper_scope !== get(wallpaperScope)) {
      wallpaperScope.set($settings.wallpaper_scope);
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("rift_wallpaper_scope", $settings.wallpaper_scope);
        } catch {}
      }
    }

    // If backend reports no custom wallpaper, ensure frontend stores and caches are cleared
    if ($settings.custom_wallpaper === null && (get(customWallpaper) !== null || get(hasCustomWallpaper))) {
      hasCustomWallpaper.set(false);
      customWallpaper.set(null);
      clearWallpaperCacheSync();
      await deleteWallpaperFromDb();
    } else if ($settings.custom_wallpaper && (!get(customWallpaper) || !get(hasCustomWallpaper))) {
      hasCustomWallpaper.set(true);
      const dbWallpaper = await loadWallpaperFromDb();
      if (dbWallpaper) {
        customWallpaper.set(dbWallpaper);
        setWallpaperCacheSync(dbWallpaper);
      } else if (isTauri) {
        try {
          const diskWallpaper = await invoke<string | null>("get_custom_wallpaper");
          if (diskWallpaper) {
            customWallpaper.set(diskWallpaper);
            await saveWallpaperToDb(diskWallpaper);
            setWallpaperCacheSync(diskWallpaper);
          }
        } catch {}
      }
    }
  });
}

// Proactively kick off background load as soon as module is imported
if (typeof window !== "undefined") {
  void initTheme();
}

/**
 * Switch to a specific theme by ID and persist to settings.
 */
export function selectTheme(themeId: ThemeId): void {
  const def = getTheme(themeId);
  activeThemeId.set(themeId);
  applyTheme(def);

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("rift_active_theme", themeId);
    } catch {}
  }

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
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("rift_wallpaper_scope", scope);
    } catch {}
  }
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
        hasCustomWallpaper.set(true);
        customWallpaper.set(dataUrl);

        // 2. Persist in synchronous fast cache for instant 0ms restoration across restarts
        setWallpaperCacheSync(dataUrl);

        // 3. Persist in IndexedDB (survives app restarts without file path issues)
        await saveWallpaperToDb(dataUrl);

        // 4. Also persist file to disk via Tauri IPC if running in desktop app
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

        // 5. Update settings to indicate custom wallpaper is active
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
  hasCustomWallpaper.set(false);
  customWallpaper.set(null);
  clearWallpaperCacheSync();
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

