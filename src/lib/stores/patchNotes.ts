import { writable } from "svelte/store";
import { LATEST_PATCH_DATA, type PatchNotesData } from "../data/patchNotes";

export const patchNotesData = writable<PatchNotesData>(LATEST_PATCH_DATA);
export const isFetchingPatchNotes = writable<boolean>(false);

/**
 * Attempt to load dynamically updated patch notes from the companion backend server.
 * Gracefully falls back to bundled LATEST_PATCH_DATA if server is unreachable or has no custom notes.
 */
export async function loadLivePatchNotes(serverUrl?: string, apiKey?: string): Promise<void> {
  const base = serverUrl?.trim();
  if (!base) return;

  isFetchingPatchNotes.set(true);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey?.trim()) {
      headers["X-Rift-Key"] = apiKey.trim();
    }

    const res = await fetch(`${base.replace(/\/+$/, "")}/api/patch-notes`, {
      method: "GET",
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.patchVersion && Array.isArray(data.changes) && data.changes.length > 0) {
        patchNotesData.set(data);
      }
    }
  } catch (err) {
    // Network or parse error: fallback quietly to bundled data
    console.debug("Live patch notes fetch notice (using bundled highlights):", err);
  } finally {
    isFetchingPatchNotes.set(false);
  }
}
