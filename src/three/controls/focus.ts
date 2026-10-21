import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Runtime } from "../runtime";
import { markSceneDirty } from "../runtime";
import type { CameraEmitter } from "./camera-emitter";
import { clearOrbitMotion } from "./orbit-motion";

type FocusArgs = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  emitter: CameraEmitter;
  runtimeRef: MutableRefObject<Runtime | null>;
  activeObjectIdRef: MutableRefObject<string>;
};

export type FocusController = {
  // Begin a tween that frames the active object. Used by the F key handler.
  start: () => void;
  // Halt the tween mid-flight. Used by pointer handlers so the user doesn't
  // fight two systems for the camera.
  cancel: () => void;
  // Advance the tween by one frame. Called from the animate loop.
  tick: () => boolean;
};

// C4D-style "F to frame selected". Pressing F (no modifiers) dollies and
// re-targets the editor camera so the active object's bounding sphere fits
// inside the smaller of the vertical / horizontal FOV. Animated with
// ease-out cubic over ~250 ms — snappy start, soft settle, doesn't feel
// teleported. Direction is preserved (we slide along the current camera→
// target ray) so the view orientation doesn't surprise the user.
export function createFocus(args: FocusArgs): FocusController {
  const { camera, controls, emitter, runtimeRef, activeObjectIdRef } = args;

  const anim = {
    active: false,
    startTime: 0,
    duration: 250,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  };
  const focusBox = new THREE.Box3();
  const focusSphere = new THREE.Sphere();
  const focusDirTmp = new THREE.Vector3();

  const start = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const node = runtime.objectMap.get(activeObjectIdRef.current);
    if (!node) return;
    // World-space bbox of the selected node and its children. precise=true so
    // meshes under groups still contribute. For degenerate nodes (cameras
    // with tiny icons, empties, hidden geometry) fall back to a small default
    // radius around the node's world origin so F still does something sensible.
    focusBox.setFromObject(node, true);
    if (focusBox.isEmpty()) {
      node.getWorldPosition(focusSphere.center);
      focusSphere.radius = 0.5;
    } else {
      focusBox.getBoundingSphere(focusSphere);
    }
    const radius = Math.max(focusSphere.radius, 0.05);
    // d = r / sin(half-FOV) makes the sphere subtend the half-FOV exactly;
    // 1.15× for breathing room (matches C4D's feel).
    const halfVfov = (camera.fov * 0.5) * (Math.PI / 180);
    const halfHfov = Math.atan(Math.max(camera.aspect, 0.01) * Math.tan(halfVfov));
    const minHalfFov = Math.min(halfVfov, halfHfov);
    const distance = (radius / Math.sin(minHalfFov)) * 1.15;

    focusDirTmp.subVectors(camera.position, controls.target);
    if (focusDirTmp.lengthSq() < 1e-8) focusDirTmp.set(0, 0, 1);
    focusDirTmp.normalize().multiplyScalar(distance);

    anim.fromPos.copy(camera.position);
    anim.fromTarget.copy(controls.target);
    anim.toTarget.copy(focusSphere.center);
    anim.toPos.copy(focusSphere.center).add(focusDirTmp);
    anim.startTime = performance.now();
    anim.active = true;
    clearOrbitMotion(controls);
    markSceneDirty(runtime);
  };

  const cancel = () => {
    anim.active = false;
  };

  const tick = () => {
    if (!anim.active) return false;
    const now = performance.now();
    const t = Math.min(1, (now - anim.startTime) / anim.duration);
    // Ease-out cubic: jumps off the line, settles softly.
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(anim.fromPos, anim.toPos, eased);
    controls.target.lerpVectors(anim.fromTarget, anim.toTarget, eased);
    if (t >= 1) {
      anim.active = false;
      // Snap exactly onto the target on the final tick to avoid the ~1e-15
      // float residue lerp leaves at t=1.
      camera.position.copy(anim.toPos);
      controls.target.copy(anim.toTarget);
      emitter.flush();
    } else {
      emitter.emitThrottled();
    }
    return true;
  };

  return { start, cancel, tick };
}
