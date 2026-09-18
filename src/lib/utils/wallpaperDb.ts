/**
 * IndexedDB helper for persisting custom wallpaper data URLs across sessions.
 * Overcomes localStorage's 5MB limit and avoids webview local file security restrictions.
 */

const DB_NAME = "rift_companion_db";
const STORE_NAME = "user_media";
const KEY_WALLPAPER = "custom_wallpaper";

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

export async function deleteWallpaperFromDb(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(KEY_WALLPAPER);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
  } catch (err) {
    console.warn("Could not delete wallpaper from IndexedDB", err);
  }
}
