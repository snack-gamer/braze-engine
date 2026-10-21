import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import type { SceneObject } from "../../types";
import { removeCameraGizmo, syncCameraGizmoForObject } from "../gizmos";
import { disposeLabel, ensureLabel } from "../labels";
import { syncModifierHandlesForObject } from "../modifiers/handles";
import { syncColliderGizmoForObject } from "../physics/collider-gizmos";
import { syncNodeEditorOverlayVisibility } from "../reconcile";
import type { Runtime } from "../runtime";
import type { SceneReconciliationSnapshot } from "./scene-reconciliation-plan";

export type EditorScenePresentation = {
  activeObjectId: string;
  activeCameraId: string;
  cameraPreviewAspect: number | null;
  showEditorOverlays: boolean;
  showObjectLabels: boolean;
  showCameraGizmos: boolean;
  editingCollider: ColliderEditSelection | null;
};

export function effectivelyVisible(
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
): boolean {
  return object.visible
    && (!snapshot.hasSolo || object.solo === true)
    && !snapshot.hiddenGeneratorSourceIds.has(object.id);
}

function syncEditorChromeBody(
  runtime: Runtime,
  object: SceneObject,
  showEditorOverlays: boolean,
): void {
  if (object.primitive !== "camera" && object.primitive !== "directionalLight") return;
  const node = runtime.objectMap.get(object.id);
  if (node) syncNodeEditorOverlayVisibility(node, showEditorOverlays);
}

export function syncObjectLabel(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
  presentation: EditorScenePresentation,
): void {
  if (
    presentation.showEditorOverlays
    && presentation.showObjectLabels
    && effectivelyVisible(snapshot, object)
  ) {
    ensureLabel(runtime, object, object.id === presentation.activeObjectId);
  } else {
    disposeLabel(runtime, object.id);
  }
}

function syncObjectHandles(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
  presentation: EditorScenePresentation,
): void {
  const node = runtime.objectMap.get(object.id);
  if (!node) return;
  const active = object.id === presentation.activeObjectId;
  syncModifierHandlesForObject(runtime, node, object, active, presentation.showEditorOverlays);
  syncColliderGizmoForObject(
    runtime,
    node,
    object,
    presentation.editingCollider,
    active,
    presentation.showEditorOverlays,
    effectivelyVisible(snapshot, object),
  );
}

/** Applies the editor-only projection for one affected authored object. */
export function syncAuthoredObjectPresentation(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
  presentation: EditorScenePresentation,
): void {
  const node = runtime.objectMap.get(object.id);
  if (!node) return;
  node.visible = effectivelyVisible(snapshot, object);
  syncEditorChromeBody(runtime, object, presentation.showEditorOverlays);
  syncObjectHandles(runtime, snapshot, object, presentation);
  syncObjectLabel(runtime, snapshot, object, presentation);
  syncCameraGizmoForObject(
    runtime,
    object,
    presentation.activeCameraId,
    snapshot.hasSolo,
    presentation.cameraPreviewAspect,
  );
}

/** Updates only projections whose semantics depend on solo/source visibility. */
export function syncObjectVisibilityPresentation(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
  presentation: EditorScenePresentation,
): void {
  const node = runtime.objectMap.get(object.id);
  if (!node) return;
  node.visible = effectivelyVisible(snapshot, object);
  syncObjectLabel(runtime, snapshot, object, presentation);
  if (snapshot.colliderObjectIds.has(object.id) || runtime.colliderGizmoMap.has(object.id)) {
    syncColliderPresentation(runtime, snapshot, object.id, presentation);
  }
  if (object.primitive === "camera" || runtime.cameraGizmoMap.has(object.id)) {
    syncCameraGizmoForObject(
      runtime,
      object,
      presentation.activeCameraId,
      snapshot.hasSolo,
      presentation.cameraPreviewAspect,
    );
  }
  if (object.id === presentation.activeObjectId) {
    syncModifierHandlesForObject(runtime, node, object, true, presentation.showEditorOverlays);
  }
}

export function syncSelectionPresentation(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  objectId: string,
  presentation: EditorScenePresentation,
): void {
  const object = snapshot.objectsById.get(objectId);
  if (!object) return;
  syncObjectHandles(runtime, snapshot, object, presentation);
  syncObjectLabel(runtime, snapshot, object, presentation);
}

export function syncColliderPresentation(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  objectId: string,
  presentation: EditorScenePresentation,
): void {
  const object = snapshot.objectsById.get(objectId);
  const node = object ? runtime.objectMap.get(object.id) : undefined;
  if (!object || !node) return;
  syncColliderGizmoForObject(
    runtime,
    node,
    object,
    presentation.editingCollider,
    object.id === presentation.activeObjectId,
    presentation.showEditorOverlays,
    effectivelyVisible(snapshot, object),
  );
}

export function syncAllLabels(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  presentation: EditorScenePresentation,
): void {
  for (const object of snapshot.objects) syncObjectLabel(runtime, snapshot, object, presentation);
}

export function syncAllEditorChromeBodies(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  showEditorOverlays: boolean,
): void {
  for (const id of snapshot.editorChromeObjectIds) {
    const object = snapshot.objectsById.get(id);
    if (object) syncEditorChromeBody(runtime, object, showEditorOverlays);
  }
}

export function removeObjectPresentation(runtime: Runtime, objectId: string): void {
  removeCameraGizmo(runtime, objectId);
  disposeLabel(runtime, objectId);
}

export function syncPresentationRoots(runtime: Runtime, presentation: EditorScenePresentation): void {
  runtime.labelRoot.visible = presentation.showEditorOverlays && presentation.showObjectLabels;
  runtime.cameraGizmoRoot.visible = presentation.showEditorOverlays && presentation.showCameraGizmos;
}
