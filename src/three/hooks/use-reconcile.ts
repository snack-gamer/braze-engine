import { useEffect, useRef, type MutableRefObject } from "react";
import type { AnimationDocument } from "../../animation/types";
import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import type {
  Material,
  ModifierPinSelection,
  SceneObject,
  ScenePlaybackMode,
  TransformMode,
  TransformSpace,
} from "../../types";
import type { AssetAnimationClipInfo } from "../assets";
import { clonerSourceIds } from "../cloner";
import { refreshCameraGizmoAspect } from "../gizmos";
import { applySceneReconciliation } from "../reconciliation/apply-scene-reconciliation";
import {
  syncAllEditorChromeBodies,
  syncAllLabels,
  syncColliderPresentation,
  syncPresentationRoots,
  syncSelectionPresentation,
  type EditorScenePresentation,
} from "../reconciliation/editor-scene-presentation";
import {
  createSceneReconciliationPlan,
  type SceneReconciliationSnapshot,
} from "../reconciliation/scene-reconciliation-plan";
import { syncTransformControls } from "../reconciliation/sync-transform-controls";
import { markSceneDirty, type Runtime } from "../runtime";

type Args = {
  runtimeRef: MutableRefObject<Runtime | null>;
  objects: SceneObject[];
  activeObjectId: string;
  activeCameraId: string;
  cameraPreviewAspect: number | null;
  transformMode: TransformMode;
  showTransformControls: boolean;
  showEditorOverlays: boolean;
  showObjectLabels: boolean;
  showCameraGizmos: boolean;
  transformSpace: TransformSpace;
  transformSnapping: boolean;
  translationSnap: number;
  rotationSnapDegrees: number;
  scaleSnap: number;
  transformGizmoSize: number;
  scenePlaybackMode: ScenePlaybackMode;
  animationPreviewMode?: boolean;
  selectedModifierPin: ModifierPinSelection | null;
  editingCollider: ColliderEditSelection | null;
  materials: Material[];
  animationDocument?: AnimationDocument;
  onAssetAnimationsDiscovered?: (objectId: string, clips: AssetAnimationClipInfo[]) => void;
};

function motionClipObjectIds(document: AnimationDocument | undefined): Set<string> {
  return new Set(
    document?.tracks
      .filter((track) => track.kind === "motionClip")
      .map((track) => track.objectId) ?? [],
  );
}

function colliderEditChanged(
  previous: ColliderEditSelection | null,
  next: ColliderEditSelection | null,
): boolean {
  return previous?.objectId !== next?.objectId || previous?.colliderId !== next?.colliderId;
}

export function useReconcile({
  runtimeRef,
  objects,
  activeObjectId,
  activeCameraId,
  cameraPreviewAspect,
  transformMode,
  showTransformControls,
  showEditorOverlays,
  showObjectLabels,
  showCameraGizmos,
  transformSpace,
  transformSnapping,
  translationSnap,
  rotationSnapDegrees,
  scaleSnap,
  transformGizmoSize,
  scenePlaybackMode,
  animationPreviewMode = false,
  selectedModifierPin,
  editingCollider,
  materials,
  animationDocument,
  onAssetAnimationsDiscovered,
}: Args): void {
  const snapshotRef = useRef<SceneReconciliationSnapshot | null>(null);
  const authoredRuntimeRef = useRef<Runtime | null>(null);
  const previousAnimationDocumentRef = useRef<AnimationDocument | undefined>(undefined);
  const previousPlaybackModeRef = useRef(scenePlaybackMode);
  const previousPresentationRef = useRef<EditorScenePresentation | null>(null);
  const presentationRuntimeRef = useRef<Runtime | null>(null);
  const animationCallbackRef = useRef(onAssetAnimationsDiscovered);
  animationCallbackRef.current = onAssetAnimationsDiscovered;

  const presentation: EditorScenePresentation = {
    activeObjectId,
    activeCameraId,
    cameraPreviewAspect,
    showEditorOverlays,
    showObjectLabels,
    showCameraGizmos,
    editingCollider,
  };
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const animationPreviewRef = useRef(animationPreviewMode);
  animationPreviewRef.current = animationPreviewMode;
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.scenePlaybackMode = scenePlaybackMode;
    runtime.animationPreviewMode = animationPreviewMode;
    if (!animationPreviewMode) runtime.labelsDirty = true;
    markSceneDirty(runtime);
  }, [runtimeRef, scenePlaybackMode, animationPreviewMode]);
  // Selection and viewport preferences intentionally stay out of this authored-state lane.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const runtimeChanged = authoredRuntimeRef.current !== runtime;
    const previousSnapshot = runtimeChanged ? null : snapshotRef.current;
    const previousDocument = runtimeChanged ? undefined : previousAnimationDocumentRef.current;
    const previousMode = runtimeChanged ? scenePlaybackMode : previousPlaybackModeRef.current;
    const dependentObjectIds = new Set<string>();

    if (animationDocument !== previousDocument) {
      for (const id of motionClipObjectIds(previousDocument)) dependentObjectIds.add(id);
      for (const id of motionClipObjectIds(animationDocument)) dependentObjectIds.add(id);
    }
    if (previousMode !== scenePlaybackMode && scenePlaybackMode === "edit") {
      for (const object of objects) {
        if (object.rigidbody?.enabled && object.rigidbody.bodyType === "dynamic") {
          dependentObjectIds.add(object.id);
        }
      }
    }

    const plan = createSceneReconciliationPlan(previousSnapshot, {
      objects,
      materials,
      hiddenGeneratorSourceIds: clonerSourceIds(objects),
      dependentObjectIds,
    });
    applySceneReconciliation({
      runtime,
      plan,
      presentation: presentationRef.current,
      scenePlaybackMode,
      animationPreviewMode: animationPreviewRef.current,
      animationDocument,
      onAssetAnimationsDiscovered: (objectId, clips) => {
        animationCallbackRef.current?.(objectId, clips);
      },
    });
    snapshotRef.current = plan.next;
    authoredRuntimeRef.current = runtime;
    previousAnimationDocumentRef.current = animationDocument;
    previousPlaybackModeRef.current = scenePlaybackMode;
  }, [runtimeRef, objects, materials, animationDocument, scenePlaybackMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const snapshot = snapshotRef.current;
    if (!runtime || !snapshot) return;
    const runtimeChanged = presentationRuntimeRef.current !== runtime;
    const previous = runtimeChanged ? null : previousPresentationRef.current;
    syncPresentationRoots(runtime, presentation);
    runtime.selectedModifierHandle = selectedModifierPin;
    if (
      runtime.selectedColliderHandle
      && (
        runtime.selectedColliderHandle.objectId !== editingCollider?.objectId
        || runtime.selectedColliderHandle.colliderId !== editingCollider?.colliderId
      )
    ) {
      runtime.selectedColliderHandle = null;
    }
    if (previous && previous.activeObjectId !== activeObjectId) {
      syncSelectionPresentation(runtime, snapshot, previous.activeObjectId, presentation);
      syncSelectionPresentation(runtime, snapshot, activeObjectId, presentation);
    }
    if (previous && colliderEditChanged(previous.editingCollider, editingCollider)) {
      if (previous.editingCollider) {
        syncColliderPresentation(runtime, snapshot, previous.editingCollider.objectId, presentation);
      }
      if (editingCollider) syncColliderPresentation(runtime, snapshot, editingCollider.objectId, presentation);
    }
    const labelsWereVisible = Boolean(previous?.showEditorOverlays && previous.showObjectLabels);
    const labelsAreVisible = showEditorOverlays && showObjectLabels;
    if (previous && labelsWereVisible !== labelsAreVisible) {
      syncAllLabels(runtime, snapshot, presentation);
      if (labelsAreVisible) runtime.labelsDirty = true;
    }
    if (previous && previous.showEditorOverlays !== showEditorOverlays) {
      syncAllEditorChromeBodies(runtime, snapshot, showEditorOverlays);
      for (const id of snapshot.colliderObjectIds) {
        syncColliderPresentation(runtime, snapshot, id, presentation);
      }
      syncSelectionPresentation(runtime, snapshot, activeObjectId, presentation);
    }
    if (previous && previous.activeCameraId !== activeCameraId) {
      runtime.cameraGizmoMap.get(previous.activeCameraId)?.setActive(false);
      runtime.cameraGizmoMap.get(activeCameraId)?.setActive(true);
    }
    if (!previous || previous.cameraPreviewAspect !== cameraPreviewAspect) {
      refreshCameraGizmoAspect(runtime, cameraPreviewAspect);
    }

    syncTransformControls(
      runtime,
      snapshot.objectsById.get(activeObjectId),
      snapshot.hasSolo,
      {
        mode: transformMode,
        visible: showTransformControls,
        space: transformSpace,
        snapEnabled: transformSnapping,
        translationSnap,
        rotationSnapDegrees,
        scaleSnap,
        gizmoSize: transformGizmoSize,
      },
    );
    markSceneDirty(runtime);
    previousPresentationRef.current = presentation;
    presentationRuntimeRef.current = runtime;
  }, [
    runtimeRef,
    objects,
    activeObjectId,
    activeCameraId,
    cameraPreviewAspect,
    transformMode,
    showTransformControls,
    showEditorOverlays,
    showObjectLabels,
    showCameraGizmos,
    transformSpace,
    transformSnapping,
    translationSnap,
    rotationSnapDegrees,
    scaleSnap,
    transformGizmoSize,
    selectedModifierPin,
    editingCollider,
  ]);
}
