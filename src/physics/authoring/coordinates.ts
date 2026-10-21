import * as THREE from "three";
import type { Vec3 } from "../../types";

export type Quat4 = [number, number, number, number];

export function eulerDegreesToQuaternion(rotation: Vec3): Quat4 {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotation[0]),
    THREE.MathUtils.degToRad(rotation[1]),
    THREE.MathUtils.degToRad(rotation[2]),
  );
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
