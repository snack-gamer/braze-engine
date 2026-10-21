import type { PassTargetState } from "@particles/gpu";
import type { Camera } from "three";

export type ThreeWebGpuParticlePassTarget = Readonly<{
  /** Ordered color formats, including every MRT attachment in the active pass. */
  colorFormats: readonly GPUTextureFormat[];
  /** Required because the viewport particle graph reads and tests against scene depth. */
  depthFormat: GPUTextureFormat;
  sampleCount: number;
}>;

export type ThreeWebGpuParticleGraphPass = Readonly<{
  camera: Camera;
  pass: GPURenderPassEncoder;
  target: ThreeWebGpuParticlePassTarget;
}>;

export type ThreeWebGpuParticlePassRecorder = Readonly<{
  renderToPass: (
    pass: GPURenderPassEncoder,
    camera: Camera,
    targetState: PassTargetState,
  ) => void;
}>;

export type ThreeWebGpuParticleGraphPassAdapter = Readonly<{
  record: (graphPass: ThreeWebGpuParticleGraphPass) => void;
}>;

/**
 * Records @particles/gpu draws into a pass explicitly owned by the render graph.
 * The caller retains responsibility for pass begin/end and command submission.
 * This is a future public seam; Three r184 cannot supply that pass publicly.
 */
export function createThreeWebGpuParticleGraphPassAdapter(
  particles: ThreeWebGpuParticlePassRecorder,
): ThreeWebGpuParticleGraphPassAdapter {
  let recording = false;
  return Object.freeze({
    record: (graphPass) => {
      if (recording) throw new Error("Particle graph-pass recording must not be nested.");
      const targetState = targetStateFor(graphPass.target);
      recording = true;
      try {
        const result: unknown = particles.renderToPass(
          graphPass.pass,
          graphPass.camera,
          targetState,
        );
        if (isPromiseLike(result)) {
          throw new Error("Particle graph-pass recording must complete synchronously.");
        }
      } finally {
        recording = false;
      }
    },
  });
}

function targetStateFor(target: ThreeWebGpuParticlePassTarget): PassTargetState {
  if (target.colorFormats.length === 0) {
    throw new RangeError("A particle graph pass requires at least one color attachment format.");
  }
  if (target.colorFormats.some((format) => typeof format !== "string" || format.length === 0)) {
    throw new TypeError("Particle graph-pass color formats must be non-empty strings.");
  }
  if (typeof target.depthFormat !== "string" || target.depthFormat.length === 0) {
    throw new TypeError("A particle graph pass requires an explicit depth attachment format.");
  }
  if (!Number.isSafeInteger(target.sampleCount) || target.sampleCount <= 0) {
    throw new RangeError("Particle graph-pass sample count must be a positive safe integer.");
  }
  return {
    colorFormats: [...target.colorFormats],
    depthFormat: target.depthFormat,
    sampleCount: target.sampleCount,
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function")
    && value !== null
    && "then" in value
    && typeof value.then === "function"
  );
}
