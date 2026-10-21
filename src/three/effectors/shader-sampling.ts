import { sampleLut } from "../../lib/effector";
import type { EffectorSettings } from "../../types";
import {
  add3,
  hashU32,
  length3,
  qconj,
  qrot,
  saturate,
  scale3,
  sub3,
  type V3,
} from "./math";
import { toObjectSpace } from "./object-space";
import { smoothNoiseCoordinate } from "./random-sampling";
import type {
  EffectorContext,
  EffectorRuntime,
  EffectorSamples,
} from "./runtime-types";

function asUint(value: number): number {
  return value >>> 0;
}

function shaderLattice(
  x: number,
  y: number,
  z: number,
  timeSlice: number,
  seed: number,
): number {
  const hash = hashU32(
    (Math.imul(asUint(x), 0x8da6b343) ^
      Math.imul(asUint(y), 0xd8163841) ^
      Math.imul(asUint(z), 0xcb1ab31f) ^
      Math.imul(asUint(timeSlice), 0x9e3779b9) ^
      Math.imul(asUint(seed), 0x85ebca6b)) >>> 0,
  );
  return (hash & 0x00ffffff) / 16777216;
}

function shaderNoiseSlice(
  ix: number,
  iy: number,
  iz: number,
  timeSlice: number,
  seed: number,
  fx: number,
  fy: number,
  fz: number,
): number {
  const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
  const c000 = shaderLattice(ix, iy, iz, timeSlice, seed);
  const c100 = shaderLattice(ix + 1, iy, iz, timeSlice, seed);
  const c010 = shaderLattice(ix, iy + 1, iz, timeSlice, seed);
  const c110 = shaderLattice(ix + 1, iy + 1, iz, timeSlice, seed);
  const c001 = shaderLattice(ix, iy, iz + 1, timeSlice, seed);
  const c101 = shaderLattice(ix + 1, iy, iz + 1, timeSlice, seed);
  const c011 = shaderLattice(ix, iy + 1, iz + 1, timeSlice, seed);
  const c111 = shaderLattice(ix + 1, iy + 1, iz + 1, timeSlice, seed);
  return lerp(
    lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy),
    lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy),
    fz,
  );
}

export function shaderValueNoise(point: V3, evolution: number, seed: number): number {
  const ix = Math.floor(point[0]), iy = Math.floor(point[1]), iz = Math.floor(point[2]);
  const fx = smoothNoiseCoordinate(point[0] - ix);
  const fy = smoothNoiseCoordinate(point[1] - iy);
  const fz = smoothNoiseCoordinate(point[2] - iz);
  const timeSlice = Math.floor(evolution);
  const timeAmount = smoothNoiseCoordinate(evolution - timeSlice);
  const first = shaderNoiseSlice(ix, iy, iz, timeSlice, seed, fx, fy, fz);
  const second = shaderNoiseSlice(ix, iy, iz, timeSlice + 1, seed, fx, fy, fz);
  return first + (second - first) * timeAmount;
}

const SHADER_NOISE_TYPE_INDEX: Record<EffectorSettings["shaderNoiseType"], number> = {
  soft: 0,
  fractal: 1,
  turbulence: 2,
  ridged: 3,
};

function shaderNoisePosition(
  effector: EffectorRuntime,
  context: EffectorContext,
  pivot: V3,
): V3 {
  const space = effector.settings.shaderNoiseSpace;
  let point: V3;
  if (space === "world") point = pivot;
  else if (space === "object") point = toObjectSpace(context, pivot);
  else point = qrot(qconj(effector.rotation), sub3(pivot, effector.position));

  const movement = effector.settings.movement;
  const movementLength = length3(movement);
  const direction: V3 = movementLength > 1e-6
    ? scale3(movement, 1 / movementLength)
    : [0, 0, 0];
  point = add3(point, add3(
    [...effector.settings.coordinateOffset] as V3,
    scale3(direction, effector.settings.movementSpeed * context.time),
  ));
  const featureSize: V3 = [
    Math.max(effector.settings.globalScale * effector.settings.relativeScale[0], 0.001),
    Math.max(effector.settings.globalScale * effector.settings.relativeScale[1], 0.001),
    Math.max(effector.settings.globalScale * effector.settings.relativeScale[2], 0.001),
  ];
  return [
    point[0] / featureSize[0],
    point[1] / featureSize[1],
    point[2] / featureSize[2],
  ];
}

function shaderFractalNoise(
  effector: EffectorRuntime,
  context: EffectorContext,
  point: V3,
): number {
  const noiseType = SHADER_NOISE_TYPE_INDEX[effector.settings.shaderNoiseType];
  const layerCount = noiseType === 0
    ? 1
    : Math.min(8, Math.max(1, Math.round(effector.settings.octaves)));
  let sum = 0;
  let normalization = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let octave = 0; octave < layerCount; octave++) {
    let noise = shaderValueNoise(
      scale3(point, frequency),
      context.time * effector.settings.evolutionSpeed,
      effector.settings.seed + octave * 1013,
    );
    if (noiseType === 2) noise = Math.abs(noise * 2 - 1);
    else if (noiseType === 3) {
      noise = 1 - Math.abs(noise * 2 - 1);
      noise *= noise;
    }
    sum += noise * amplitude;
    normalization += amplitude;
    frequency *= Math.max(effector.settings.lacunarity, 1.01);
    amplitude *= saturate(effector.settings.roughness);
  }
  return normalization > 1e-6 ? sum / normalization : 0.5;
}

function shaderClip(value: number, low: number, high: number): number {
  const range = high - low;
  if (Math.abs(range) > 1e-6) return saturate((value - low) / range);
  return value >= high ? 1 : 0;
}

export function sampleShaderEffector(
  effector: EffectorRuntime,
  context: EffectorContext,
  pivot: V3,
): EffectorSamples {
  let value = shaderFractalNoise(
    effector,
    context,
    shaderNoisePosition(effector, context, pivot),
  );
  if (effector.settings.absolute) value = Math.abs(value * 2 - 1);
  value = shaderClip(value, effector.settings.lowClip, effector.settings.highClip);
  value = saturate(
    (value - 0.5) * (1 + effector.settings.contrast)
    + 0.5
    + effector.settings.brightness,
  );
  if (effector.settings.invert) value = 1 - value;
  value = sampleLut(effector.functionLut, value);
  return {
    position: [value, value, value],
    rotation: [value, value, value],
    scale: [value, value, value],
  };
}
