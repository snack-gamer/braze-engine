import { sampleLut } from "../../lib/effector";
import type { EffectorSettings } from "../../types";
import { fract, length3, saturate, type V3 } from "./math";
import { toObjectSpace } from "./object-space";
import type {
  EffectorContext,
  EffectorRuntime,
  EffectorSamples,
} from "./runtime-types";

const STEP_ORDER_INDEX: Record<EffectorSettings["stepOrdering"], number> = {
  index: 0,
  objectX: 1,
  objectY: 2,
  objectZ: 3,
  radial: 4,
};

export function orderedParameter(
  context: EffectorContext,
  mode: number,
  fragmentId: number,
  pivot: V3,
): number {
  const objectPosition = toObjectSpace(context, pivot);
  const size: V3 = [
    Math.max(context.boundsMax[0] - context.boundsMin[0], 1e-5),
    Math.max(context.boundsMax[1] - context.boundsMin[1], 1e-5),
    Math.max(context.boundsMax[2] - context.boundsMin[2], 1e-5),
  ];
  const normalized: V3 = [
    (objectPosition[0] - context.boundsMin[0]) / size[0],
    (objectPosition[1] - context.boundsMin[1]) / size[1],
    (objectPosition[2] - context.boundsMin[2]) / size[2],
  ];
  if (mode === 1) return normalized[0];
  if (mode === 2) return normalized[1];
  if (mode === 3) return normalized[2];
  if (mode === 4) {
    return length3([
      normalized[0] * 2 - 1,
      normalized[1] * 2 - 1,
      normalized[2] * 2 - 1,
    ]) * 0.577350269;
  }
  return context.instanceCount > 1 ? fragmentId / (context.instanceCount - 1) : 0;
}

export function sampleStepEffector(
  effector: EffectorRuntime,
  context: EffectorContext,
  fragmentId: number,
  pivot: V3,
): EffectorSamples {
  const raw = orderedParameter(
    context,
    STEP_ORDER_INDEX[effector.settings.stepOrdering],
    fragmentId,
    pivot,
  );
  const [inputMinimum, inputMaximum] = effector.settings.stepInputRange;
  const denominator = inputMaximum - inputMinimum;
  let amount = Math.abs(denominator) > 1e-6
    ? (raw - inputMinimum) / denominator
    : 0;
  amount += effector.settings.stepOffset;
  amount = effector.settings.stepLoop ? fract(amount) : saturate(amount);
  if (effector.settings.stepReverse) amount = 1 - amount;
  const steps = Math.round(effector.settings.stepQuantize);
  if (steps > 1) amount = Math.round(amount * (steps - 1)) / (steps - 1);
  const value = sampleLut(effector.functionLut, amount);
  return {
    position: [value, value, value],
    rotation: [value, value, value],
    scale: [value, value, value],
  };
}
