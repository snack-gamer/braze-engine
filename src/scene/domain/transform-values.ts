import type { Vec3 } from "./scene-values";

export const MIN_AUTHORED_SCALE = 0.001;

export function clampScaleValue(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_AUTHORED_SCALE, value);
}

export function clampScaleVec(values: Vec3): Vec3 {
  return values.map(clampScaleValue) as Vec3;
}
