import { readEditorColorToken, readEditorNumberToken } from "../ui/theme-tokens";
import { useCallback, useEffect, useState } from "react";
import { defaultEditorPrefs } from "../editor/domain/editor-preference-defaults";
import type { EditorPrefs } from "../types";
import { restoreEditorPreferences } from "../editor/domain/editor-preferences";

const STORAGE_KEY = "tgan:editor-prefs";

// Editor-only preferences (grid, etc.) persisted to localStorage. Separate
// from the scene's environment block — these are per-user UI choices, not
// content that should travel with a saved scene. Defaults merge over any
// stored prefs, so new fields added to EditorPrefs pick up sane values
// without invalidating existing stored data.
function readStoredPrefs(): EditorPrefs {
  const defaults = { ...defaultEditorPrefs,
    gridColor: readEditorColorToken("--scene-grid-color", defaultEditorPrefs.gridColor),
    gridOpacity: readEditorNumberToken("--scene-grid-opacity", defaultEditorPrefs.gridOpacity) };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    return restoreEditorPreferences(parsed, defaults);
  } catch {
    return defaults;
  }
}

export function useEditorPrefs() {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => readStoredPrefs());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Storage unavailable (private mode, quota) — silently keep the
      // in-memory copy. Next reload will fall back to defaults.
    }
  }, [prefs]);

  const updatePrefs = useCallback((patch: Partial<EditorPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  return { prefs, updatePrefs };
}
