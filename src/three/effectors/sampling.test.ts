import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildCurveLut, defaultEffectorSettings } from "../../lib/effector";
import { effectorValueNoise } from "./random-sampling";
import type { EffectorContext, EffectorRuntime } from "./runtime-types";
import { shaderValueNoise } from "./shader-sampling";
import { orderedParameter, sampleStepEffector } from "./step-sampling";

const context: EffectorContext = {
  time: 0,
  objectWorldToLocal: new THREE.Matrix4(),
  objectRotation: [0, 0, 0, 1],
  boundsMin: [0, 0, 0],
  boundsMax: [10, 20, 30],
  instanceCount: 5,
};

const runtime = (settings = defaultEffectorSettings): EffectorRuntime => ({
  settings,
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  boxHalf: [1, 1, 1],
  radius: 1,
  falloffLut: buildCurveLut(settings.falloff),
  functionLut: buildCurveLut(settings.stepCurve),
  targetPosition: [0, 0, 0],
  targetUp: [0, 1, 0],
});

describe("Braze effector sampling", () => {
  it("keeps lattice noise deterministic and continuous at integer boundaries", () => {
    expect(effectorValueNoise([1.25, -2.5, 3.75])).toBe(
      effectorValueNoise([1.25, -2.5, 3.75]),
    );
    expect(shaderValueNoise([1, 2, 3], 4, 5)).toBeCloseTo(
      shaderValueNoise([1, 2, 3], 4, 5),
      12,
    );
  });

  it("normalizes step ordering against object bounds and instance count", () => {
    expect(orderedParameter(context, 0, 2, [5, 10, 15])).toBe(0.5);
    expect(orderedParameter(context, 1, 0, [5, 10, 15])).toBe(0.5);
    expect(orderedParameter(context, 2, 0, [5, 10, 15])).toBe(0.5);
    expect(orderedParameter(context, 3, 0, [5, 10, 15])).toBe(0.5);
  });

  it("applies authored reverse and quantization before the step curve", () => {
    const settings = {
      ...defaultEffectorSettings,
      type: "step" as const,
      stepOrdering: "index" as const,
      stepReverse: true,
      stepQuantize: 3,
    };
    const sample = sampleStepEffector(runtime(settings), context, 1, [0, 0, 0]);
    expect(sample.position[0]).toBe(1);
    expect(sample.position).toEqual(sample.rotation);
    expect(sample.rotation).toEqual(sample.scale);
  });
});
