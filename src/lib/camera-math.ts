import * as THREE from "three";
import type { Vec3 } from "../types";

const tempDir = new THREE.Vector3();
const tempEuler = new THREE.Euler();

// Convert a gizmo-driven Euler rotation (degrees, XYZ order) back into a
// camera.target point — preserving the previous distance from position to
// target so the camera doesn't visibly "jump" zoom when the user rotates.
// The camera-as-object data model uses target (lookAt point), not rotation,
// so transform-gizmo rotations are funneled through here before being saved.
export function rotationToCameraTarget(
  position: Vec3,
  rotationDegrees: Vec3,
  previousTarget: Vec3,
): Vec3 {
  const dx = previousTarget[0] - position[0];
  const dy = previousTarget[1] - position[1];
  const dz = previousTarget[2] - position[2];
  const distance = Math.hypot(dx, dy, dz) || 1;

  tempEuler.set(
    THREE.MathUtils.degToRad(rotationDegrees[0]),
    THREE.MathUtils.degToRad(rotationDegrees[1]),
    THREE.MathUtils.degToRad(rotationDegrees[2]),
    "XYZ",
  );
  // Camera looks down its local -Z axis (THREE convention). Rotate that into
  // world space, scale by the preserved distance, add to position → target.
  tempDir.set(0, 0, -1).applyEuler(tempEuler).multiplyScalar(distance);
  return [position[0] + tempDir.x, position[1] + tempDir.y, position[2] + tempDir.z];
}
