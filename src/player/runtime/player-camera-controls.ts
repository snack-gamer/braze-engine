import { Vector3, type PerspectiveCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Camera-target compatibility port with no editor controls or input listeners. */
export function createPlayerCameraControls(camera: PerspectiveCamera): OrbitControls {
  const target = new Vector3(0, 0.5, 0);
  return {
    enabled: false,
    target,
    update() {
      camera.lookAt(target);
      camera.updateMatrixWorld();
      return false;
    },
    dispose: () => undefined,
  } as unknown as OrbitControls;
}
