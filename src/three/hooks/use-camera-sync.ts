import { useEffect, type MutableRefObject } from "react";
import type { CameraState, DepthOfFieldComponent } from "../../types";
import { markSceneDirty, type Runtime } from "../runtime";

type Args = {
  runtimeRef: MutableRefObject<Runtime | null>;
  cameraTransform: CameraState;
  cameraNear: number;
  cameraFar: number;
  cameraDepthOfField: DepthOfFieldComponent | null;
  // Reference to the last CameraState the viewport emitted upward. Used to
  // detect our own echoes — when the prop matches what we just emitted, this
  // is OrbitControls notifying React of a change it already drove itself.
  // With throttled emits the live THREE state can drift several frames past
  // the prop, so a value-based EPS check would false-positive and snap the
  // camera backward mid-orbit; reference equality is robust to that race.
  lastEmittedRef: MutableRefObject<CameraState | null>;
};

let warnedDepthOfField = false;

// Push editor-camera prop changes (scene load, "Look through camera" snap)
// into the THREE camera + orbit controls. Skips our own echoes.
export function useCameraSync({
  runtimeRef,
  cameraTransform,
  cameraNear,
  cameraFar,
  cameraDepthOfField,
  lastEmittedRef,
}: Args) {
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (cameraTransform === lastEmittedRef.current) return;
    const { camera, controls } = runtime;
    const [px, py, pz] = cameraTransform.position;
    const [tx, ty, tz] = cameraTransform.target;
    camera.position.set(px, py, pz);
    controls.target.set(tx, ty, tz);
    camera.fov = cameraTransform.fov;
    camera.near = cameraNear;
    camera.far = cameraFar;
    camera.updateProjectionMatrix();
    controls.update();
    markSceneDirty(runtime);
  }, [runtimeRef, lastEmittedRef, cameraTransform, cameraNear, cameraFar]);

  useEffect(() => {
    if (!cameraDepthOfField || cameraDepthOfField.enabled === false || warnedDepthOfField) return;
    warnedDepthOfField = true;
    console.warn("[viewport] Depth of field is not implemented in the WebGPU renderer.");
  }, [runtimeRef, cameraDepthOfField]);
}
