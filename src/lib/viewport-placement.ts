import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import type { CameraState, Vec3 } from "../types";

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type GroundPlacementInput = {
  clientX: number;
  clientY: number;
  rect: ViewportRect;
  camera: CameraState;
  near: number;
  far: number;
  groundY?: number;
};

/**
 * Projects a screen-space editor drop onto the horizontal authoring ground.
 * Scene geometry picking can be layered on later without changing the drop API.
 */
export function groundPlacementFromViewport(input: GroundPlacementInput): Vec3 | null {
  const { rect } = input;
  if (rect.width <= 0 || rect.height <= 0) return null;

  const ndc = new Vector2(
    ((input.clientX - rect.left) / rect.width) * 2 - 1,
    -((input.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const camera = new PerspectiveCamera(
    input.camera.fov,
    rect.width / rect.height,
    Math.max(0.001, input.near),
    Math.max(input.near + 0.001, input.far),
  );
  camera.position.fromArray(input.camera.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new Vector3().fromArray(input.camera.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const raycaster = new Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const point = raycaster.ray.intersectPlane(
    new Plane(new Vector3(0, 1, 0), -(input.groundY ?? 0)),
    new Vector3(),
  );
  if (!point) return null;
  return [point.x, point.y, point.z];
}
