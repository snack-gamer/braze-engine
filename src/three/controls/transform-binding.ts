import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { clampScaleValue, readTransform, roundTransform } from "../transform";
import { markSceneDirty, type ObjectTransformPatch, type Runtime } from "../runtime";
import type { CameraState, ColliderComponent, ModifierPinSelection, SceneObject } from "../../types";
import { syncAuthoredDirectionalLightFrame } from "../directional-light";
import { refreshCameraGizmoWorldPosesForSubtree } from "../gizmos";
import {
  clampColliderFacePosition,
  colliderFacePatchFromPosition,
  type ColliderFaceAxis,
  type ColliderFaceDirection,
} from "../physics/collider-handle-edit";

const cameraLookTmp = new THREE.Vector3();

type TransformControlsWithObject = TransformControls & { object?: THREE.Object3D; mode?: string };

type Callbacks = {
  onSelectObject: (id: string) => void;
  onCameraChange: (camera: CameraState) => void;
  onTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onPreviewTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onUpdateModifierPin: (objectId: string, modifierId: string, pinId: string, localOffset: [number, number, number]) => void;
  onUpdateCollider: (objectId: string, colliderId: string, patch: Partial<ColliderComponent>) => void;
  onSelectModifierPin: (selection: ModifierPinSelection | null) => void;
};

type BindingArgs = {
  controls: OrbitControls;
  transformControls: TransformControls;
  runtimeRef: MutableRefObject<Runtime | null>;
  objectsRef: MutableRefObject<SceneObject[]>;
  callbacksRef: MutableRefObject<Callbacks>;
};

export function installTransformBinding(args: BindingArgs): { dispose: () => void } {
  const { controls, transformControls, runtimeRef, objectsRef, callbacksRef } = args;
  let dragActive = false;
  let committedThisDrag = false;

  const clampLiveScale = (target: THREE.Object3D) => {
    const x = clampScaleValue(target.scale.x);
    const y = clampScaleValue(target.scale.y);
    const z = clampScaleValue(target.scale.z);
    if (x === target.scale.x && y === target.scale.y && z === target.scale.z) return;
    target.scale.set(x, y, z);
    target.updateMatrixWorld(true);
  };

  // Screen-space scale dragging (replaces TransformControls' plane-intersect
  // scale math wholesale). Stock behavior only responds to movement along the
  // handle's projected axis and explodes when the grab point sits near the
  // gizmo origin — Blender's distance-ratio model has the same flaw. Maya,
  // Unity and Unreal instead map a signed screen delta: drag right/up to
  // grow, left/down to shrink, in any direction (horizontal, vertical,
  // diagonal all contribute). The delta feeds an exponential curve, so
  // sensitivity is constant everywhere, precision is highest around 1x, the
  // value can never cross zero, and a plain tap (zero delta) changes nothing.
  // Deterministic: recomputed from the drag-start scale on every move.
  const SCALE_DRAG_PIXELS_PER_DOUBLING = 300;
  type ScaleDrag = { startX: number; startY: number; axis: string; startScale: THREE.Vector3 };
  type TransformControlsScaleInternals = TransformControlsWithObject & {
    axis: string | null;
    _scaleStart: THREE.Vector3;
  };
  let scaleDrag: ScaleDrag | null = null;
  const lastPointer = { x: 0, y: 0 };
  const trackPointer = (event: PointerEvent) => {
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
  };
  window.addEventListener("pointerdown", trackPointer, true);
  window.addEventListener("pointermove", trackPointer, true);

  const beginScaleDrag = () => {
    const tc = transformControls as TransformControlsScaleInternals;
    if (tc.mode !== "scale") return;
    scaleDrag = {
      startX: lastPointer.x,
      startY: lastPointer.y,
      axis: tc.axis ?? "XYZ",
      startScale: tc._scaleStart.clone(),
    };
  };

  const applyScreenSpaceScale = (target: THREE.Object3D) => {
    if (!scaleDrag) return;
    const delta = (lastPointer.x - scaleDrag.startX) - (lastPointer.y - scaleDrag.startY);
    const factor = Math.pow(2, delta / SCALE_DRAG_PIXELS_PER_DOUBLING);
    const snap = transformControls.scaleSnap;
    const component = (axisLetter: "X" | "Y" | "Z", start: number) => {
      if (!scaleDrag!.axis.includes(axisLetter)) return start;
      const value = start * factor;
      return snap ? Math.round(value / snap) * snap || snap : value;
    };
    target.scale.set(
      component("X", scaleDrag.startScale.x),
      component("Y", scaleDrag.startScale.y),
      component("Z", scaleDrag.startScale.z),
    );
    target.updateMatrixWorld(true);
  };

  const clampLiveColliderFace = (target: THREE.Object3D) => {
    const base = target.userData.baseCollider as ColliderComponent | undefined;
    const axis = target.userData.colliderHandleAxis as ColliderFaceAxis | undefined;
    const direction = target.userData.colliderHandleDirection as ColliderFaceDirection | undefined;
    if (!base || axis === undefined || direction === undefined) return;
    const position = target.position.getComponent(axis);
    target.position.setComponent(axis, clampColliderFacePosition(base, axis, direction, position));
    target.updateMatrixWorld(true);
  };

  const roundedColliderPatch = (patch: Partial<ColliderComponent>): Partial<ColliderComponent> => {
    const rounded = { ...patch };
    if (patch.center) rounded.center = patch.center.map(roundTransform) as ColliderComponent["center"];
    if (patch.size) rounded.size = patch.size.map(roundTransform) as ColliderComponent["size"];
    if (patch.radius !== undefined) rounded.radius = roundTransform(patch.radius);
    if (patch.length !== undefined) rounded.length = roundTransform(patch.length);
    if (patch.majorRadius !== undefined) rounded.majorRadius = roundTransform(patch.majorRadius);
    if (patch.minorRadius !== undefined) rounded.minorRadius = roundTransform(patch.minorRadius);
    return rounded;
  };

  const objectTransformPatch = (
    target: THREE.Object3D,
    object: SceneObject | undefined,
  ): ObjectTransformPatch => {
    if ((transformControls as TransformControlsWithObject).mode === "scale") clampLiveScale(target);
    const patch: ObjectTransformPatch = readTransform(target);
    if (object?.primitive !== "camera" || !object.camera) return patch;
    const previousTarget = object.camera.target;
    const distance = Math.hypot(
      previousTarget[0] - object.position[0],
      previousTarget[1] - object.position[1],
      previousTarget[2] - object.position[2],
    ) || 1;
    cameraLookTmp.set(0, 0, -1).applyQuaternion(target.quaternion).multiplyScalar(distance);
    patch.cameraTarget = [
      roundTransform(target.position.x + cameraLookTmp.x),
      roundTransform(target.position.y + cameraLookTmp.y),
      roundTransform(target.position.z + cameraLookTmp.z),
    ];
    return patch;
  };

  const commitTransform = () => {
    const target = (transformControls as TransformControlsWithObject).object;
    const objectId = target?.userData.objectId;
    if (!target || typeof objectId !== "string") return;
    if (
      target.userData.modifierHandle &&
      typeof target.userData.modifierId === "string" &&
      typeof target.userData.pinId === "string"
    ) {
      callbacksRef.current.onUpdateModifierPin(
        objectId,
        target.userData.modifierId,
        target.userData.pinId,
        [
          roundTransform(target.position.x),
          roundTransform(target.position.y),
          roundTransform(target.position.z),
        ],
      );
      return;
    }
    if (target.userData.colliderHandleKind === "center" && typeof target.userData.colliderId === "string") {
      callbacksRef.current.onUpdateCollider(objectId, target.userData.colliderId, {
        center: [
          roundTransform(target.position.x),
          roundTransform(target.position.y),
          roundTransform(target.position.z),
        ],
      });
      return;
    }
    if (target.userData.colliderHandleKind === "face" && typeof target.userData.colliderId === "string") {
      const base = target.userData.baseCollider as ColliderComponent | undefined;
      const axis = target.userData.colliderHandleAxis as ColliderFaceAxis | undefined;
      const direction = target.userData.colliderHandleDirection as ColliderFaceDirection | undefined;
      if (!base || axis === undefined || direction === undefined) return;
      clampLiveColliderFace(target);
      callbacksRef.current.onUpdateCollider(
        objectId,
        target.userData.colliderId,
        roundedColliderPatch(colliderFacePatchFromPosition(base, axis, direction, target.position.getComponent(axis))),
      );
      return;
    }
    const obj = objectsRef.current.find((o) => o.id === objectId);
    callbacksRef.current.onTransformObject(objectId, objectTransformPatch(target, obj));
  };

  const onDraggingChanged = (event: { value: unknown }) => {
    const isDragging = Boolean(event.value);
    controls.enabled = !isDragging;
    if (isDragging) {
      dragActive = true;
      committedThisDrag = false;
      beginScaleDrag();
      return;
    }
    if (dragActive && !committedThisDrag) commitTransform();
    dragActive = false;
    committedThisDrag = false;
    scaleDrag = null;
  };

  const onMouseUp = () => {
    if (!dragActive || committedThisDrag) return;
    commitTransform();
    committedThisDrag = true;
  };

  // While a camera SceneObject is being dragged, the SceneNode moves live
  // but its SceneObject (and therefore the gizmo state) only commits on
  // release. Keep the gizmo glued to the live node so users see the frustum
  // follow the drag, not lag behind it.
  // Live cloner refresh: dragging a source under a cloner, the cloner itself,
  // an effector, or an effector's aim target only changes the three.js node
  // until the drag commits to React state, so the instanced clone output
  // would otherwise freeze mid-drag. Marking clonersDirty makes the frame
  // loop force-rebuild from live node matrices every change.
  const markClonersDirtyForSource = (runtime: Runtime, objectId: string) => {
    const objects = objectsRef.current;
    const dragged = objects.find((o) => o.id === objectId);
    if (!dragged) return;
    if (dragged.primitive === "cloner" || dragged.primitive === "effector") {
      runtime.clonersDirty = true;
      return;
    }
    // Effector aim targets reposition clones when moved.
    if (objects.some((o) => o.primitive === "effector" && o.effector?.targetObjectId === objectId)) {
      runtime.clonersDirty = true;
      return;
    }
    let current = dragged;
    while (current?.parentId && current.parentId !== current.id) {
      const parent = objects.find((o) => o.id === current!.parentId);
      if (!parent) return;
      if (parent.primitive === "cloner") {
        runtime.clonersDirty = true;
        return;
      }
      current = parent;
    }
  };

  const onObjectChange = () => {
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.labelsDirty = true;
      markSceneDirty(runtime);
    }
    const node = (transformControls as TransformControlsWithObject).object;
    if (!node) return;
    if (node.userData.colliderHandleKind === "face") {
      clampLiveColliderFace(node);
      return;
    }
    if ((transformControls as TransformControlsWithObject).mode === "scale") {
      applyScreenSpaceScale(node);
      clampLiveScale(node);
    }
    const id = node.userData.objectId;
    if (typeof id !== "string") return;
    if (runtime) markClonersDirtyForSource(runtime, id);
    const obj = objectsRef.current.find((o) => o.id === id);
    if (!runtime) return;
    if (node.userData.modifierHandle || node.userData.colliderHandleKind) return;
    runtime.invalidateShadowCasterTransform(id);
    const liveTransform = objectTransformPatch(node, obj);
    callbacksRef.current.onPreviewTransformObject(id, liveTransform);
    refreshCameraGizmoWorldPosesForSubtree(runtime, node);

    // TransformControls mutates the runtime SceneNode before the React object
    // commit. Refresh authored sunlight from that live quaternion during the
    // drag so the sky, shadows and lit surfaces move with the gizmo itself.
    // Translation remains intentionally inert for a directional light, just
    // as it is in Unity; rotation is the light direction.
    if (obj?.primitive === "directionalLight") {
      syncAuthoredDirectionalLightFrame(runtime);
      return;
    }
  };

  transformControls.addEventListener("dragging-changed", onDraggingChanged);
  transformControls.addEventListener("mouseUp", onMouseUp);
  transformControls.addEventListener("objectChange", onObjectChange);

  return {
    dispose: () => {
      transformControls.removeEventListener("dragging-changed", onDraggingChanged);
      transformControls.removeEventListener("mouseUp", onMouseUp);
      transformControls.removeEventListener("objectChange", onObjectChange);
      window.removeEventListener("pointerdown", trackPointer, true);
      window.removeEventListener("pointermove", trackPointer, true);
    },
  };
}
