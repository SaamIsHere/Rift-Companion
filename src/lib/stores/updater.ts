import { writable, get } from "svelte/store";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export const APP_VERSION = "0.1.7";

export const updateAvailable = writable<boolean>(false);
export const availableUpdate = writable<Update | null>(null);
export const updateVersion = writable<string>("");
export const updateNotes = writable<string>("");
export const isChecking = writable<boolean>(false);
export const isUpdating = writable<boolean>(false);
export const updateProgress = writable<number>(0);
export const updateStatusMessage = writable<string>("");
export const updateError = writable<string | null>(null);
export const showUpdateModal = writable<boolean>(false);

/**
 * Check for available application updates on GitHub Releases.
 * @param interactive Whether this was triggered by a user action (e.g. "Check for Updates" button).
 * When false (background check), it sets updateAvailable but avoids popping up the modal.
 */
export async function checkForAppUpdate(interactive = false): Promise<boolean> {
  if (get(isChecking) || get(isUpdating)) return false;

  isChecking.set(true);
  updateError.set(null);
  if (interactive) {
    updateStatusMessage.set("Checking for updates…");
  }

  try {
    const update = await check();
    if (update && update.available) {
      updateAvailable.set(true);
      availableUpdate.set(update);
      updateVersion.set(update.version);
      updateNotes.set(
        update.body ||
          "### What's New in v0.1.7\n* **Rune, Item & Summoner Spell Importer:** One-click and automated import of optimal rune pages, summoner spells (with configurable D/F Flash key preference), and custom item sets directly into the League of Legends client.\n* **Single-Instance Protection:** Prevents multiple app instances from running simultaneously, gracefully restoring focus to the existing window.\n* **Support Item Tracking:** Displays the 2 most popular upgraded support items (Celestial Opposition, Bloodsong, Dream Maker, Zaz'Zak's Realmspike, Solstice Sleigh) with live pick and win rates.\n* **Match Simulator Fixes:** Added scoring focus mode switcher (Balanced, Counterpick, Team Player) with real-time recalculation, dropdown click-outside handling, and 10-minute match cache cooldowns.\n* **Autostart Preferences:** Configurable startup options under Settings -> Behavior (None, System Boot, or League Launch mode).\n* **Windows 10 Window Border Fix:** Adaptive window outline when restored/unmaximized to fix visual edge bleeding on Windows 10."
      );
      if (interactive) {
        showUpdateModal.set(true);
      }
      updateStatusMessage.set(`Version v${update.version} is available!`);
      return true;
    } else {
      updateAvailable.set(false);
      availableUpdate.set(null);
      if (interactive) {
        updateStatusMessage.set(`Rift Companion is up to date (v${APP_VERSION}).`);
      }
      return false;
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn("Update check notice:", msg);
    if (interactive) {
      updateError.set(`Could not check for updates: ${msg}`);
      updateStatusMessage.set("");
    }
    return false;
  } finally {
    isChecking.set(false);
  }
}

/**
 * Download, verify signature, install the update package, and relaunch the application.
 */
export async function installAppUpdate(): Promise<void> {
  const update = get(availableUpdate);
  if (!update) return;

  isUpdating.set(true);
  updateProgress.set(0);
  updateError.set(null);
  updateStatusMessage.set("Starting update download…");

  try {
    let downloadedBytes = 0;
    let totalBytes = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          totalBytes = event.data.contentLength ?? 0;
          updateStatusMessage.set("Downloading update package…");
          break;
        case "Progress":
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            updateProgress.set(percent);
            updateStatusMessage.set(`Downloading: ${percent}%`);
          } else {
            updateStatusMessage.set("Downloading update package…");
          }
          break;
        case "Finished":
          updateProgress.set(100);
          updateStatusMessage.set("Verifying and installing update…");
          break;
      }
    });

    updateStatusMessage.set("Installation complete! Relaunching app…");
    // Wait briefly so the user sees completion, then restart into the new version
    setTimeout(async () => {
      try {
        await relaunch();
      } catch (e) {
        console.error("Failed to relaunch automatically:", e);
      }
    }, 1200);
  } catch (err: any) {
    const msg = err?.message || String(err);
    updateError.set(`Failed to install update: ${msg}`);
    updateStatusMessage.set("");
    isUpdating.set(false);
  }
}
