import type { RootMotionPolicy } from "../../domain/animator-component";
import type { RootMotionDelta } from "../../runtime/root-motion";

/** Applies authored extraction filters before a delta reaches a motor or object. */
export function filterRootMotionDelta(
  delta: RootMotionDelta,
  policy: RootMotionPolicy,
): RootMotionDelta {
  return {
    translation: [
      policy.translationAxes.x ? delta.translation[0] : 0,
      policy.translationAxes.y ? delta.translation[1] : 0,
      policy.translationAxes.z ? delta.translation[2] : 0,
    ],
    rotation: policy.rotation === "none"
      ? [0, 0, 0, 1]
      : policy.rotation === "yaw"
        ? yawOnly(delta.rotation)
        : delta.rotation,
  };
}

function yawOnly(rotation: RootMotionDelta["rotation"]): RootMotionDelta["rotation"] {
  const [x, y, z, w] = rotation;
  const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  return [0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)];
}
