import { writable, derived, get } from "svelte/store";
import { draft } from "./draft";
import { settings } from "./settings";
import { setSettings } from "../ipc/tauri";
import type { GameModeInfo } from "../types";

export type LiveMode = "classic" | "aram";

export interface LiveGameModeState {
  detectedMode: LiveMode;
  manualOverride: LiveMode | null;
  detectedMayhem: boolean;
  rawGameMode: string | null;
  queueId: number | null;
}

const initialState: LiveGameModeState = {
  detectedMode: "classic",
  manualOverride: null,
  detectedMayhem: false,
  rawGameMode: null,
  queueId: null,
};

export const liveGameMode = writable<LiveGameModeState>(initialState);

export function updateLiveGameMode(info: GameModeInfo) {
  liveGameMode.update((state) => {
    const isAram = Boolean(
      info.is_aram ||
      info.queue_id === 450 ||
      (info.game_mode && info.game_mode.toUpperCase().includes("ARAM"))
    );
    const isMayhem = Boolean(
      info.is_mayhem ||
      (info.game_mode && info.game_mode.toUpperCase().includes("MAYHEM"))
    );
    return {
      ...state,
      detectedMode: isAram ? "aram" : "classic",
      detectedMayhem: isMayhem,
      rawGameMode: info.game_mode || null,
      queueId: info.queue_id ?? null,
    };
  });
}

// Automatically react to draft updates as well
draft.subscribe((d) => {
  if (d) {
    const isAram = Boolean(
      d.is_aram ||
      d.queue_id === 450 ||
      (d.game_mode && d.game_mode.toUpperCase().includes("ARAM"))
    );
    const isMayhem = Boolean(
      d.is_mayhem ||
      (d.game_mode && d.game_mode.toUpperCase().includes("MAYHEM"))
    );
    if (isAram || d.game_mode || d.queue_id) {
      liveGameMode.update((s) => ({
        ...s,
        detectedMode: isAram ? "aram" : "classic",
        detectedMayhem: isMayhem,
        rawGameMode: d.game_mode || s.rawGameMode,
        queueId: d.queue_id ?? s.queueId,
      }));
    }
  }
});

export const activeLiveMode = derived(
  liveGameMode,
  ($mode) => $mode.manualOverride ?? $mode.detectedMode
);

export const isAramActive = derived(
  activeLiveMode,
  ($mode) => $mode === "aram"
);

export const isMayhemActive = derived(
  [isAramActive, liveGameMode, settings],
  ([$isAram, $live, $settings]) => {
    if (!$isAram) return false;
    return $live.detectedMayhem || Boolean($settings.aram_mayhem_mode);
  }
);

export function setManualLiveMode(mode: LiveMode | null) {
  liveGameMode.update((s) => ({ ...s, manualOverride: mode }));
}

export function toggleMayhemMode() {
  const current = get(settings).aram_mayhem_mode ?? false;
  const next = !current;
  try {
    localStorage.setItem("rift_aram_mayhem_mode", String(next));
  } catch {}
  settings.update((s) => ({ ...s, aram_mayhem_mode: next }));
  void setSettings(get(settings));
}
