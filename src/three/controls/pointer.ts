import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { markSceneDirty, type Runtime } from "../runtime";
import { handleSelectionFromObject, modifierHandleKey } from "../modifiers/handles";
import { colliderHandleKey, colliderHandleSelectionFromObject } from "../physics/collider-gizmos";
import type { CameraState, ColliderComponent, ModifierPinSelection, SceneObject } from "../../types";
import type { CameraEmitter } from "./camera-emitter";
import type { FocusController } from "./focus";

// Cinema4D-style drag-to-zoom sensitivity. 0.006 means a 100px drag changes
// the orbit radius by ~exp(0.6) ≈ 1.82× — a comfortable feel that matches
// C4D's default.
const DOLLY_DRAG_SENSITIVITY = 0.006;

const dollyOffsetTmp = new THREE.Vector3();
const orbitOffsetTmp = new THREE.Vector3();
const orbitTargetOffsetTmp = new THREE.Vector3();
const orbitRightTmp = new THREE.Vector3();
const orbitQuatTmp = new THREE.Quaternion();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

type Callbacks = {
  onSelectObject: (id: string) => void;
  onCameraChange: (camera: CameraState) => void;
  onTransformObject: (id: string, transform: import("../runtime").ObjectTransformPatch) => void;
  onPreviewTransformObject: (id: string, transform: import("../runtime").ObjectTransformPatch) => void;
  onUpdateModifierPin: (objectId: string, modifierId: string, pinId: string, localOffset: [number, number, number]) => void;
  onUpdateCollider: (objectId: string, colliderId: string, patch: Partial<ColliderComponent>) => void;
  onSelectModifierPin: (selection: ModifierPinSelection | null) => void;
};

type PointerArgs = {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transformControls: TransformControls;
  objectRoot: THREE.Group;
  pointer: THREE.Vector2;
  raycaster: THREE.Raycaster;
  emitter: CameraEmitter;
  focus: FocusController;
  runtimeRef: MutableRefObject<Runtime | null>;
  objectsRef: MutableRefObject<SceneObject[]>;
  callbacksRef: MutableRefObject<Callbacks>;
};

// Pointer handlers for the editor viewport: plain LMB selection, Alt+LMB
// orbit-around-cursor-hit-point, Alt+RMB drag dolly, and the OrbitControls
// `start`/`change`/`end` bridge that suppresses React fan-out during motion.
export function installPointer(args: PointerArgs): { dispose: () => void } {
  const {
    canvas,
    camera,
    controls,
    transformControls,
    objectRoot,
    pointer,
    raycaster,
    emitter,
    focus,
    runtimeRef,
    objectsRef,
    callbacksRef,
  } = args;

  // Typed handle for OrbitControls' private decay fields. We flush these on
  // Alt+LMB-on-mesh takeover so update()'s per-frame decay doesn't drift
  // target/position during the custom rigid rotation around the cursor pivot.
  const orbitInternals = controls as OrbitControls & {
    _sphericalDelta: THREE.Spherical;
    _panOffset: THREE.Vector3;
    _scale: number;
  };

  // C4D-style state for the two custom drag modes.
  const dollyDrag = { active: false, pointerId: -1, lastX: 0, lastY: 0 };
  const orbitPivot = new THREE.Vector3();
  const orbitState = { active: false, pointerId: -1, lastX: 0, lastY: 0 };
  // While the user is actively dragging/panning/zooming we skip the per-tick
  // React setCamera flood — OrbitControls drives THREE directly, and React
  // catches up on release via emitter.flush().
  let isOrbiting = false;

  const restoreTransformControls = () => {
    if (!transformControls.dragging) transformControls.enabled = transformControls.getHelper().visible;
  };

  // TransformControls registers its own pointerdown listener on the canvas
  // before this subsystem's bubble listener. Capture Alt/Option clicks first
  // so a camera-navigation gesture cannot begin a gizmo drag.
  const onPointerDownCapture = (event: PointerEvent) => {
    if (event.altKey) {
      transformControls.enabled = false;
      return;
    }
    restoreTransformControls();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (transformControls.dragging) return;
    // Any pointer-driven camera input cancels an in-flight F-to-focus
    // animation so the user doesn't fight two systems for the camera.
    focus.cancel();
    // Alt + LMB: if the cursor is over a mesh, take over orbit so it pivots
    // around the hit point. Otherwise let OrbitControls handle a normal
    // orbit around its current target. Either way we never select when Alt
    // is held.
    if (event.altKey && event.button === 0) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(objectRoot.children, true);
      const hit = hits.find((item) => typeof item.object.userData.objectId === "string");
      if (hit) {
        orbitPivot.copy(hit.point);
        orbitState.active = true;
        orbitState.pointerId = event.pointerId;
        orbitState.lastX = event.clientX;
        orbitState.lastY = event.clientY;
        // Suppress OrbitControls for this drag. mouseButtons.LEFT is only
        // read at pointerdown — and OrbitControls' pointerdown listener,
        // registered in its constructor, fires BEFORE ours on the same canvas,
        // so by the time we get here it's already entered _STATE.ROTATE.
        // Setting enabled=false makes its document-level pointermove
        // early-return so no sphericalDelta accumulates.
        //
        // Flush residual decay state from any just-finished pan/orbit/zoom —
        // update() runs every frame regardless of `enabled` and would
        // otherwise keep nudging target/position for ~20 frames at
        // dampingFactor 0.05, throwing off our rigid rotation around the pivot.
        orbitInternals._sphericalDelta.set(0, 0, 0);
        orbitInternals._panOffset.set(0, 0, 0);
        orbitInternals._scale = 1;
        controls.enabled = false;
        isOrbiting = true;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* capture already taken; ignore */
        }
        event.preventDefault();
      }
      return;
    }
    // Alt + RMB starts a C4D-style drag dolly. OrbitControls' RMB pan was
    // disabled when Alt was pressed (see keyboard.ts Alt watcher).
    if (event.altKey && event.button === 2) {
      dollyDrag.active = true;
      dollyDrag.pointerId = event.pointerId;
      dollyDrag.lastX = event.clientX;
      dollyDrag.lastY = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* some browsers reject capture on already-captured pointers; ignore */
      }
      isOrbiting = true;
      event.preventDefault();
      return;
    }
    // Only the left button picks/selects. Middle-button pan and right-button
    // orbit are camera navigation (handled by OrbitControls) and must never
    // change the selection.
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(objectRoot.children, true);
    // Locked objects shouldn't be selectable from the viewport — same UX as
    // C4D's locked column. Users can still pick them from the LeftRail list.
    const hit = hits.find((item) => {
      const id = item.object.userData.objectId;
      if (typeof id !== "string") return false;
      const obj = objectsRef.current.find((o) => o.id === id);
      return !!obj && !obj.locked;
    });
    if (hit?.object.userData.objectId) {
      const runtime = runtimeRef.current;
      const handleSelection = handleSelectionFromObject(hit.object);
      const colliderSelection = colliderHandleSelectionFromObject(hit.object);
      if (runtime) {
        runtime.selectedModifierHandle = handleSelection;
        runtime.selectedColliderHandle = colliderSelection;
        const immediateTarget = handleSelection
          ? runtime.modifierHandleMap.get(modifierHandleKey(handleSelection))
          : colliderSelection
            ? runtime.colliderHandleMap.get(colliderHandleKey(colliderSelection))
          : runtime.objectMap.get(hit.object.userData.objectId);
        if (immediateTarget && (transformControls.enabled || transformControls.getHelper().visible)) {
          if (handleSelection || colliderSelection) {
            transformControls.setMode("translate");
            transformControls.setSpace("local");
            transformControls.translationSnap = null;
            transformControls.rotationSnap = null;
            transformControls.scaleSnap = null;
          }
          transformControls.attach(immediateTarget);
          transformControls.enabled = true;
          transformControls.getHelper().visible = true;
        }
      }
      callbacksRef.current.onSelectModifierPin(handleSelection);
      callbacksRef.current.onSelectObject(hit.object.userData.objectId);
    } else {
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.selectedModifierHandle = null;
        runtime.selectedColliderHandle = null;
      }
      callbacksRef.current.onSelectModifierPin(null);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    // Alt+LMB orbit around the hit pivot. Rotate BOTH camera position and
    // controls.target around the pivot — keeps the view direction's rotation
    // matching the drag, and the pivot stays anchored on screen.
    // Speed matches OrbitControls: full canvas-height drag = 360°.
    if (orbitState.active && event.pointerId === orbitState.pointerId) {
      const height = canvas.clientHeight || 1;
      const dx = event.clientX - orbitState.lastX;
      const dy = event.clientY - orbitState.lastY;
      orbitState.lastX = event.clientX;
      orbitState.lastY = event.clientY;
      if (dx !== 0 || dy !== 0) {
        const dtheta = (-2 * Math.PI * dx) / height;
        const dphi = (-2 * Math.PI * dy) / height;

        orbitQuatTmp.setFromAxisAngle(WORLD_UP, dtheta);
        orbitOffsetTmp.copy(camera.position).sub(orbitPivot).applyQuaternion(orbitQuatTmp);
        camera.position.copy(orbitPivot).add(orbitOffsetTmp);
        orbitTargetOffsetTmp.copy(controls.target).sub(orbitPivot).applyQuaternion(orbitQuatTmp);
        controls.target.copy(orbitPivot).add(orbitTargetOffsetTmp);

        // Polar: rotate around the camera's right axis (perp to forward+up).
        // Recompute right AFTER the azimuth step so it stays correct.
        orbitRightTmp.subVectors(controls.target, camera.position).cross(WORLD_UP).normalize();
        if (orbitRightTmp.lengthSq() > 0) {
          orbitQuatTmp.setFromAxisAngle(orbitRightTmp, dphi);
          orbitOffsetTmp.copy(camera.position).sub(orbitPivot).applyQuaternion(orbitQuatTmp);
          camera.position.copy(orbitPivot).add(orbitOffsetTmp);
          orbitTargetOffsetTmp.copy(controls.target).sub(orbitPivot).applyQuaternion(orbitQuatTmp);
          controls.target.copy(orbitPivot).add(orbitTargetOffsetTmp);
        }

        camera.lookAt(controls.target);
        controls.update();
        emitter.emitThrottled();
      }
      return;
    }
    // Alt+RMB drag dolly: C4D mapping — drag up OR right zooms in; both axes
    // contribute additively. Exponential mapping keeps perceived rate constant
    // regardless of distance from target.
    if (!dollyDrag.active || event.pointerId !== dollyDrag.pointerId) return;
    const dx = event.clientX - dollyDrag.lastX;
    const dy = event.clientY - dollyDrag.lastY;
    dollyDrag.lastX = event.clientX;
    dollyDrag.lastY = event.clientY;
    if (dx === 0 && dy === 0) return;
    const scale = Math.exp((dy - dx) * DOLLY_DRAG_SENSITIVITY);
    dollyOffsetTmp.copy(camera.position).sub(controls.target).multiplyScalar(scale);
    camera.position.copy(controls.target).add(dollyOffsetTmp);
    controls.update();
    emitter.emitThrottled();
  };

  const endDrag = (event: PointerEvent) => {
    if (orbitState.active && event.pointerId === orbitState.pointerId) {
      orbitState.active = false;
      isOrbiting = false;
      controls.enabled = true;
      if (!event.altKey) restoreTransformControls();
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* not captured anymore; fine */
      }
      // Flush so the status bar snaps to the released position now, not
      // 100 ms later via the throttle's trailing edge.
      emitter.flush();
      return;
    }
    if (!dollyDrag.active || event.pointerId !== dollyDrag.pointerId) return;
    dollyDrag.active = false;
    isOrbiting = false;
    if (!event.altKey) restoreTransformControls();
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* not captured anymore; fine */
    }
    emitter.flush();
  };

  const onControlsStart = () => {
    isOrbiting = true;
    const runtime = runtimeRef.current;
    if (runtime) markSceneDirty(runtime);
  };
  const onControlsEnd = () => {
    isOrbiting = false;
    // Damping continues to fire `change` for ~30 frames after release.
    // emitThrottled's trailing timer catches the final settled position.
    emitter.emitThrottled();
  };
  const onControlsChange = () => {
    const runtime = runtimeRef.current;
    if (runtime) markSceneDirty(runtime);
    if (!isOrbiting) emitter.emitThrottled();
  };

  controls.addEventListener("start", onControlsStart);
  controls.addEventListener("end", onControlsEnd);
  controls.addEventListener("change", onControlsChange);
  canvas.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  return {
    dispose: () => {
      controls.removeEventListener("start", onControlsStart);
      controls.removeEventListener("end", onControlsEnd);
      controls.removeEventListener("change", onControlsChange);
      canvas.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
    },
  };
}
