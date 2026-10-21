import type {
  MotionPulseAxisMode,
  MotionPulseTarget,
} from "../domain/motion-pulse";
import type { Vec3 } from "../domain/scene-values";

export function patchMotionPulseTarget(
  targets: readonly MotionPulseTarget[],
  targetId: string,
  patch: Partial<MotionPulseTarget>,
): MotionPulseTarget[] {
  return targets.map((target) => target.id === targetId ? { ...target, ...patch } : target);
}

export function removeMotionPulseTarget(
  targets: readonly MotionPulseTarget[],
  targetId: string,
): MotionPulseTarget[] {
  return targets.filter((target) => target.id !== targetId);
}

export function assignMotionPulseTarget(
  targets: readonly MotionPulseTarget[],
  slotId: string,
  object: { id: string; name: string },
): MotionPulseTarget[] {
  return patchMotionPulseTarget(targets, slotId, {
    objectId: object.id,
    name: object.name || object.id,
  });
}

export function changeMotionPulseAxisMode(
  targets: readonly MotionPulseTarget[],
  targetId: string,
  axisMode: MotionPulseAxisMode,
): MotionPulseTarget[] {
  const target = targets.find((candidate) => candidate.id === targetId);
  if (!target || axisMode === "individual") {
    return patchMotionPulseTarget(targets, targetId, { axisMode });
  }
  const unify = (values: Vec3): Vec3 => [values[0], values[0], values[0]];
  return patchMotionPulseTarget(targets, targetId, {
    axisMode,
    position: unify(target.position),
    rotation: unify(target.rotation),
    scale: unify(target.scale),
  });
}

export function patchMotionPulseVectorAxis(
  values: Vec3,
  axis: number,
  value: number,
  axisMode: MotionPulseAxisMode,
): Vec3 {
  if (axisMode === "unified") return [value, value, value];
  const next = [...values] as Vec3;
  next[axis] = value;
  return next;
}
