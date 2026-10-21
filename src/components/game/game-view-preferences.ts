import {
  GAME_VIEW_BUILTIN_PRESETS,
  parseCustomGameViewPresets,
  type GameViewAspectPreset,
} from "./game-view-aspect";

export const GAME_VIEW_ASPECT_STORAGE_KEY = "braze.editor.game-view-aspect.v1";

export type GameViewAspectSettings = {
  activePresetId: string;
  lowResolution: boolean;
  customPresets: GameViewAspectPreset[];
};

export function readGameViewAspectSettings(): GameViewAspectSettings {
  const fallback = { activePresetId: "free", lowResolution: false, customPresets: [] };
  try {
    const value = JSON.parse(window.localStorage.getItem(GAME_VIEW_ASPECT_STORAGE_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return fallback;
    const candidate = value as Partial<GameViewAspectSettings>;
    const customPresets = parseCustomGameViewPresets(candidate.customPresets);
    const available = [...GAME_VIEW_BUILTIN_PRESETS, ...customPresets];
    const activePresetId = typeof candidate.activePresetId === "string"
      && available.some((preset) => preset.id === candidate.activePresetId)
      ? candidate.activePresetId
      : "free";
    return { activePresetId, lowResolution: candidate.lowResolution === true, customPresets };
  } catch {
    return fallback;
  }
}

export function persistGameViewAspectSettings(settings: GameViewAspectSettings): void {
  try {
    window.localStorage.setItem(GAME_VIEW_ASPECT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Preferences remain usable in memory in private or embedded contexts.
  }
}
