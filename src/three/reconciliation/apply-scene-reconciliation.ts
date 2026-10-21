import type { Group, Object3D } from "three";
import type { AnimationDocument } from "../../animation/types";
import type { AssetAnimationClipInfo } from "../assets";
import { syncClonerOutputs } from "../cloner";
import { disposeObject } from "../dispose";
import { refreshCameraGizmoWorldPosesForSubtree } from "../gizmos";
import { removeModifierHandlesForObject } from "../modifiers/handles";
import { syncRuntimeModifierStates } from "../modifiers/runtime";
import { removeColliderGizmoForObject } from "../physics/collider-gizmos";
import { createNode, invalidateNodeAssetLoad, syncNode } from "../reconcile";
import { auditRuntimeScene } from "../scene-audit";
import { markSceneDirty, type Runtime } from "../runtime";
import type { SceneObject, ScenePlaybackMode } from "../../types";
import { removeRuntimeMotionMixer } from "../animation";
import {
  removeObjectPresentation,
  syncAuthoredObjectPresentation,
  syncObjectVisibilityPresentation,
  type EditorScenePresentation,
} from "./editor-scene-presentation";
import type { SceneReconciliationPlan } from "./scene-reconciliation-plan";
import { emitRuntimeBodyLifecycle } from "./body-lifecycle";
import { findBody } from "../reconcile";

type ApplySceneReconciliationArgs = {
  runtime: Runtime;
  plan: SceneReconciliationPlan;
  presentation: EditorScenePresentation;
  scenePlaybackMode: ScenePlaybackMode;
  animationPreviewMode: boolean;
  animationDocument?: AnimationDocument;
  onAssetAnimationsDiscovered?: (objectId: string, clips: AssetAnimationClipInfo[]) => void;
};

function isDynamicPhysicsObject(objectId: string, plan: SceneReconciliationPlan): boolean {
  const object = plan.next.objectsById.get(objectId);
  return object?.rigidbody?.enabled === true && object.rigidbody.bodyType === "dynamic";
}

export function detachAuthoredChildNodes(runtime: Runtime, node: Group): void {
  const authoredChildren: Group[] = [];
  const visit = (child: Object3D): void => {
    const childId = child.userData.objectId;
    const isAuthoredNode = typeof childId === "string" && runtime.objectMap.get(childId) === child;
    if (isAuthoredNode) {
      authoredChildren.push(child as Group);
      return;
    }
    for (const descendant of child.children) visit(descendant);
  };
  for (const child of node.children) visit(child);
  for (const child of authoredChildren) runtime.objectRoot.add(child);
}

function removeObject(
  runtime: Runtime,
  objectId: string,
): void {
  const node = runtime.objectMap.get(objectId);
  removeModifierHandlesForObject(runtime, objectId);
  removeColliderGizmoForObject(runtime, objectId);
  removeRuntimeMotionMixer(runtime, objectId);
  if (node) {
    const body = findBody(node);
    emitRuntimeBodyLifecycle(runtime, {
      phase: "willChange",
      objectId,
      node,
      previousBody: body,
      nextBody: null,
      nextKind: "removed",
    });
    invalidateNodeAssetLoad(runtime, node);
    detachAuthoredChildNodes(runtime, node);
    node.removeFromParent();
    disposeObject(node);
    runtime.objectMap.delete(objectId);
  }
  removeObjectPresentation(runtime, objectId);
}

/** Applies only the object ids selected by the pure reconciliation planner. */
export function applySceneReconciliation({
  runtime,
  plan,
  presentation,
  scenePlaybackMode,
  animationPreviewMode,
  animationDocument,
  onAssetAnimationsDiscovered,
}: ApplySceneReconciliationArgs): boolean {
  const hasWork = plan.removedObjectIds.size > 0
    || plan.syncObjectIds.size > 0
    || plan.presentationObjectIds.size > 0;
  if (!hasWork) return false;

  for (const id of plan.removedObjectIds) removeObject(runtime, id);
  for (const id of plan.addedObjectIds) {
    const object = plan.next.objectsById.get(id);
    if (object && !runtime.objectMap.has(id)) runtime.objectMap.set(id, createNode(object));
  }

  const materialLibrary = [...plan.next.materialsById.values()];
  for (const id of plan.syncObjectIds) {
    const object = plan.next.objectsById.get(id);
    const node = runtime.objectMap.get(id);
    if (!object || !node) continue;
    const desiredParent = (
      object.parentId
      && object.parentId !== object.id
      && runtime.objectMap.get(object.parentId)
    ) || runtime.objectRoot;
    if (node.parent !== desiredParent) desiredParent.add(node);
    const material = object.materialId ? plan.next.materialsById.get(object.materialId) ?? null : null;
    syncNode(
      runtime,
      node,
      object,
      presentation.showEditorOverlays,
      material,
      materialLibrary,
      animationDocument,
      onAssetAnimationsDiscovered,
      {
        preserveRuntimeTransform: scenePlaybackMode !== "edit" && isDynamicPhysicsObject(id, plan),
      },
    );
  }

  for (const id of plan.syncObjectIds) {
    const object = plan.next.objectsById.get(id);
    if (object) syncAuthoredObjectPresentation(runtime, plan.next, object, presentation);
  }
  for (const id of plan.presentationObjectIds) {
    if (plan.syncObjectIds.has(id)) continue;
    const object = plan.next.objectsById.get(id);
    if (object) syncObjectVisibilityPresentation(runtime, plan.next, object, presentation);
  }
  for (const id of plan.worldTransformRootIds) {
    const node = runtime.objectMap.get(id);
    if (node) refreshCameraGizmoWorldPosesForSubtree(runtime, node);
  }

  if (
    plan.addedObjectIds.size > 0
    || plan.removedObjectIds.size > 0
    || plan.changedObjectIds.size > 0
  ) {
    syncRuntimeModifierStates(runtime, plan.next.objects as SceneObject[]);
  }
  if (syncClonerOutputs(runtime, plan.next.objects as SceneObject[])) runtime.labelsDirty = true;
  runtime.labelsDirty ||= !animationPreviewMode;
  markSceneDirty(runtime);
  auditRuntimeScene(runtime, plan.next.objects as SceneObject[]);
  return true;
}
