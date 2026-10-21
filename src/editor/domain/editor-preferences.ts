import type { TransformSpace } from "../../scene/domain/scene-values";

export type EditorPrefs = {
  showGrid: boolean;
  showGizmos: boolean;
  showObjectLabels: boolean;
  showCameraGizmos: boolean;
  transformSpace: TransformSpace;
  transformSnapping: boolean;
  translationSnap: number;
  rotationSnapDegrees: number;
  scaleSnap: number;
  transformGizmoSize: number;
  gridOpacity: number; // 0..1
  gridColor: string;
  gridHorizon: number; // world units
};

export const GRID_HORIZON_MIN = 18;
export const GRID_HORIZON_MAX = 200;

/** Upgrade the old stock grid only; a customized grid keeps all three values. */
export function restoreEditorPreferences(stored: Partial<EditorPrefs>, defaults: EditorPrefs): EditorPrefs {
  const prefs = { ...defaults, ...stored };
  if (stored.gridColor === "#536061" && stored.gridOpacity === 0.25 && stored.gridHorizon === 18) {
    prefs.gridColor = defaults.gridColor;
    prefs.gridOpacity = defaults.gridOpacity;
    prefs.gridHorizon = defaults.gridHorizon;
  }
  return prefs;
}
