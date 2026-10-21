import * as THREE from "three";

/** Player-only replacements for editor labels, helpers, and authored gizmos. */
export function renderVisibleLabels(): void {}
export function updateLabelPositions(): void {}
export function ensureLabel(): never {
  throw new Error("Editor labels are unavailable in a player build.");
}
export function disposeLabel(): void {}
export function refreshCameraGizmoAspect(): void {}
export function refreshCameraGizmoWorldPosesForSubtree(): void {}
export function removeCameraGizmo(): void {}
export function syncCameraGizmoForObject(): void {}
export function cameraGizmoWorldPose(): null {
  return null;
}
export function syncModifierHandlesForObject(): void {}
export function removeModifierHandlesForObject(): void {}

export function buildCameraEditorBody(): THREE.Group {
  const body = new THREE.Group();
  body.visible = false;
  return body;
}

export function useEditorGrid(): void {}
