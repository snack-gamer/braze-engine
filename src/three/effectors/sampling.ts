import type { V3 } from "./math";
import { sampleRandomEffector } from "./random-sampling";
import type {
  EffectorContext,
  EffectorRuntime,
  EffectorSamples,
} from "./runtime-types";
import { sampleShaderEffector } from "./shader-sampling";
import { sampleStepEffector } from "./step-sampling";

export function sampleEffector(
  effector: EffectorRuntime,
  context: EffectorContext,
  fragmentId: number,
  stackIndex: number,
  pivot: V3,
): EffectorSamples {
  if (effector.settings.type === "random") {
    return sampleRandomEffector(effector, context, fragmentId, stackIndex, pivot);
  }
  if (effector.settings.type === "step") {
    return sampleStepEffector(effector, context, fragmentId, pivot);
  }
  if (effector.settings.type === "shader") {
    return sampleShaderEffector(effector, context, pivot);
  }
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
  };
}
