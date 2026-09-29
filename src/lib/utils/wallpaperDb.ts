/**
 * IndexedDB helper for persisting custom wallpaper data URLs across sessions.
 * Overcomes localStorage's 5MB limit and avoids webview local file security restrictions.
 */

const DB_NAME = "rift_companion_db";
const STORE_NAME = "user_media";
const KEY_WALLPAPER = "custom_wallpaper";
const KEY_RAW_WALLPAPER = "custom_wallpaper_raw";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB not available"));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveWallpaperToDb(dataUrl: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(dataUrl, KEY_WALLPAPER);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn("Could not save wallpaper to IndexedDB", err);
  }
}

export async function loadWallpaperFromDb(): Promise<string | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(KEY_WALLPAPER);
      getReq.onsuccess = () => resolve((getReq.result as string) || null);
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn("Could not load wallpaper from IndexedDB", err);
    return null;
  }
}

export async function saveRawWallpaperToDb(dataUrl: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(dataUrl, KEY_RAW_WALLPAPER);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn("Could not save raw wallpaper to IndexedDB", err);
  }
}

export async function loadRawWallpaperFromDb(): Promise<string | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(KEY_RAW_WALLPAPER);
      getReq.onsuccess = () => resolve((getReq.result as string) || null);
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn("Could not load raw wallpaper from IndexedDB", err);
    return null;
  }
}

export async function deleteWallpaperFromDb(): Promise<void> {
  clearWallpaperCacheSync();
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(KEY_WALLPAPER);
      store.delete(KEY_RAW_WALLPAPER);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Could not delete wallpaper from IndexedDB", err);
  }
}

const CACHE_KEY_WALLPAPER = "rift_custom_wallpaper";
const CACHE_KEY_HAS_CUSTOM = "rift_has_custom_wallpaper";

/**
 * Synchronously retrieve the cached wallpaper data URL from localStorage.
 * Available at 0ms during initial script evaluation to prevent any flash of default background.
 */
export function getCachedWallpaperSync(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(CACHE_KEY_WALLPAPER);
  } catch {
    return null;
  }
}

/**
 * Synchronously check whether the user has configured a custom wallpaper.
 */
export function hasCustomWallpaperSync(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(CACHE_KEY_HAS_CUSTOM) === "true";
  } catch {
    return false;
  }
}

export interface WallpaperCropState {
  xNorm: number;
  yNorm: number;
  wNorm: number;
  hNorm: number;
  zoomScale: number;
}

const CROP_STATE_STORAGE_KEY = "rift_wallpaper_crop_state";

/**
 * Persist normalized crop framing coordinates across sessions and modal re-openings.
 */
export function saveWallpaperCropState(state: WallpaperCropState): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CROP_STATE_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {}
}

/**
 * Retrieve last saved crop framing coordinates if available.
 */
export function loadWallpaperCropState(): WallpaperCropState | null {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(CROP_STATE_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return null;
}

/**
 * Clear stored crop framing coordinates.
 */
export function clearWallpaperCropState(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(CROP_STATE_STORAGE_KEY);
    }
  } catch {}
}

/**
 * Synchronously clear the fast wallpaper cache from localStorage.
 */
export function clearWallpaperCacheSync(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY_WALLPAPER);
    localStorage.removeItem(CACHE_KEY_HAS_CUSTOM);
    clearWallpaperCropState();
  } catch {}
}

/**
 * Compress an image data URL via HTML Canvas to guarantee it comfortably fits
 * in localStorage's ~5MB quota (typically shrinks to ~150-300KB JPEG).
 */
async function compressAndCacheWallpaper(dataUrl: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image for compression"));
      img.src = dataUrl;
    });

    const maxDim = 1920;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);

    const compressed = canvas.toDataURL("image/jpeg", 0.82);
    try {
      localStorage.setItem(CACHE_KEY_WALLPAPER, compressed);
      localStorage.setItem(CACHE_KEY_HAS_CUSTOM, "true");
    } catch (e) {
      console.warn("Failed to store compressed wallpaper in localStorage", e);
    }
  } catch (e) {
    console.warn("Failed to compress wallpaper for localStorage cache", e);
  }
}

/**
 * Cache wallpaper data URL for synchronous instant restoration on next app start.
 */
export function setWallpaperCacheSync(dataUrl: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY_HAS_CUSTOM, "true");

    // If data URL is reasonably small (< ~2MB string length), store directly
    if (dataUrl.length < 2_000_000) {
      try {
        localStorage.setItem(CACHE_KEY_WALLPAPER, dataUrl);
        return;
      } catch {
        // If quota exceeded, fall through to compress
      }
    }

    // For larger images or when direct storage exceeds quota, store compressed screen version
    void compressAndCacheWallpaper(dataUrl);
  } catch (err) {
    console.warn("Could not cache wallpaper in localStorage", err);
  }
}
