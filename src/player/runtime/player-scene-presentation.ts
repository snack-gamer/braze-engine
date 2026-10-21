import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import type { SceneObject } from "../../types";
import type { Runtime } from "../../three/runtime";
import type { SceneReconciliationSnapshot } from "../../three/reconciliation/scene-reconciliation-plan";

export type EditorScenePresentation = Readonly<{
  activeObjectId: string;
  activeCameraId: string;
  cameraPreviewAspect: number | null;
  showEditorOverlays: boolean;
  showObjectLabels: boolean;
  showCameraGizmos: boolean;
  editingCollider: ColliderEditSelection | null;
}>;

export function effectivelyVisible(
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
): boolean {
  return object.visible
    && (!snapshot.hasSolo || object.solo === true)
    && !snapshot.hiddenGeneratorSourceIds.has(object.id);
}

function syncVisibility(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
): void {
  const node = runtime.objectMap.get(object.id);
  if (node) node.visible = effectivelyVisible(snapshot, object);
}

/** Player projection keeps authored visibility and omits every editor overlay. */
export function syncAuthoredObjectPresentation(
  runtime: Runtime,
  snapshot: SceneReconciliationSnapshot,
  object: SceneObject,
  _presentation: EditorScenePresentation,
): void {
  syncVisibility(runtime, snapshot, object);
}

export const syncObjectVisibilityPresentation = syncAuthoredObjectPresentation;
export const syncObjectLabel = () => undefined;
export const syncSelectionPresentation = () => undefined;
export const syncColliderPresentation = () => undefined;
export const syncAllLabels = () => undefined;
export const syncAllEditorChromeBodies = () => undefined;
export const removeObjectPresentation = () => undefined;

export function syncPresentationRoots(runtime: Runtime): void {
  runtime.labelRoot.visible = false;
  runtime.cameraGizmoRoot.visible = false;
}
