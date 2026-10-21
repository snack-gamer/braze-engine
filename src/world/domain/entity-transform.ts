import { EntityWorldError } from "./entity-world";
import type { RuntimeVector3 } from "./runtime-primitive";

/** Initial parent-local authored pose, never a mirror of live GPU simulation. */
export type EntityTransform = Readonly<{ position: RuntimeVector3; rotation: RuntimeVector3; scale: RuntimeVector3 }>;
export function captureEntityTransform(value: EntityTransform): EntityTransform {
  const vector = (v: RuntimeVector3, min: number, max: number): RuntimeVector3 => {
    if (!Array.isArray(v) || v.length !== 3 || !Array.from(v).every((x) => Number.isFinite(x) && x >= min && x <= max)) {
      throw new EntityWorldError("invalid-command", "Entity transforms require finite, bounded vectors and positive scales.");
    }
    return Object.freeze([...v]) as RuntimeVector3;
  };
  return Object.freeze({ position: vector(value.position, -1e6, 1e6), rotation: vector(value.rotation, -360000, 360000), scale: vector(value.scale, 0.001, 1000) });
}
