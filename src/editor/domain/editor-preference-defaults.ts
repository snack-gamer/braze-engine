import type { EditorPrefs } from "../../types";
import { DEFAULT_EDITOR_GRID_STYLE } from "./editor-grid-style";

// Editor UI preferences. Persisted to localStorage (see useEditorPrefs), so
// these are starting values — actual runtime values come from the hook.
export const defaultEditorPrefs: EditorPrefs = {
  showGrid: true,
  showGizmos: true,
  showObjectLabels: false,
  showCameraGizmos: true,
  transformSpace: "world",
  transformSnapping: false,
  translationSnap: 0.5,
  rotationSnapDegrees: 15,
  scaleSnap: 0.1,
  transformGizmoSize: 0.7,
  gridOpacity: DEFAULT_EDITOR_GRID_STYLE.opacity,
  gridColor: DEFAULT_EDITOR_GRID_STYLE.color,
  gridHorizon: DEFAULT_EDITOR_GRID_STYLE.size,
};
