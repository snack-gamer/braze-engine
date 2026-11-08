import type { SceneObject, Vec3 } from "../../types";

export type UpdateObject = (id: string, patch: Partial<SceneObject>) => void;

export function patchPhysicsVector(values: Vec3, axis: number, value: number, min = -Infinity): Vec3 {
  const next = [...values] as Vec3;
  next[axis] = Math.max(min, Number.isFinite(value) ? value : values[axis]);
  return next;
}
