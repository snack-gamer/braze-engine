import type { MutableRefObject } from "react";
import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraState } from "../../types";

type EmitterArgs = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  // The latest CameraState we passed up. Stored by reference so the bootstrap
  // sync effect can compare with `===` to detect our own echoes (see the
  // cameraTransform useEffect in ThreeScene.tsx).
  lastEmittedRef: MutableRefObject<CameraState | null>;
  onChange: () => (next: CameraState) => void;
};

export type CameraEmitter = {
  emit: () => void;
  flush: () => void;
  emitThrottled: () => void;
  dispose: () => void;
};

// Coalesce camera state emits during continuous motion. OrbitControls'
// damping tail and wheel-zoom decay each fire `change` ~60 Hz; custom
// Alt+LMB / Alt+RMB drags fire on every pointer move. Each emit calls
// App's setCamera, which re-renders the tree and re-runs useSceneSync's
// debounced-save effect — at 60 Hz that's ~8–12 ms of React work per frame,
// busting the animate loop's 16.67 ms budget on slower machines and dropping
// viewport frames. Throttle to ~10 Hz with a trailing edge so the status-bar
// readout still settles to the final position after motion stops.
const EMIT_INTERVAL_MS = 100;

export function createCameraEmitter(args: EmitterArgs): CameraEmitter {
  const { camera, controls, lastEmittedRef, onChange } = args;
  let emitTimer: number | null = null;
  let lastEmitAt = 0;

  const emit = () => {
    const state: CameraState = {
      position: [
        Number(camera.position.x.toFixed(4)),
        Number(camera.position.y.toFixed(4)),
        Number(camera.position.z.toFixed(4)),
      ],
      target: [
        Number(controls.target.x.toFixed(4)),
        Number(controls.target.y.toFixed(4)),
        Number(controls.target.z.toFixed(4)),
      ],
      fov: Number(camera.fov.toFixed(3)),
    };
    lastEmittedRef.current = state;
    onChange()(state);
  };

  const flush = () => {
    if (emitTimer !== null) {
      window.clearTimeout(emitTimer);
      emitTimer = null;
    }
    lastEmitAt = performance.now();
    emit();
  };

  const emitThrottled = () => {
    const now = performance.now();
    const sinceLast = now - lastEmitAt;
    if (sinceLast >= EMIT_INTERVAL_MS) {
      flush();
      return;
    }
    if (emitTimer === null) {
      emitTimer = window.setTimeout(flush, EMIT_INTERVAL_MS - sinceLast);
    }
  };

  const dispose = () => {
    if (emitTimer !== null) {
      window.clearTimeout(emitTimer);
      emitTimer = null;
    }
  };

  return { emit, flush, emitThrottled, dispose };
}
