import * as THREE from "three";
import type { V3 } from "./math";
import type { EffectorContext } from "./runtime-types";

const localPoint = new THREE.Vector3();

export function toObjectSpace(context: EffectorContext, point: V3): V3 {
  localPoint.set(point[0], point[1], point[2]).applyMatrix4(context.objectWorldToLocal);
  return [localPoint.x, localPoint.y, localPoint.z];
}
