import {
  add3,
  hashU32,
  pcg,
  scale3,
  type V3,
} from "./math";
import { toObjectSpace } from "./object-space";
import type {
  EffectorContext,
  EffectorRuntime,
  EffectorSamples,
} from "./runtime-types";

function remapRandom(effector: EffectorRuntime, value: number): number {
  const [minimum, maximum] = effector.settings.outputRange;
  return minimum + (maximum - minimum) * value;
}

function randomScalar(state: { value: number }, gaussian: boolean): number {
  if (gaussian) return (pcg(state) + pcg(state) + pcg(state) + pcg(state)) * 0.25;
  return pcg(state);
}

function randomVector(effector: EffectorRuntime, baseSeed: number, channel: number): V3 {
  const state = {
    value: hashU32((baseSeed ^ Math.imul(channel + 1, 0x27d4eb2d)) >>> 0),
  };
  const gaussian = effector.settings.randomMode === "gaussian";
  if (!effector.settings.indexed) {
    const value = remapRandom(effector, randomScalar(state, gaussian));
    return [value, value, value];
  }
  return [
    remapRandom(effector, randomScalar(state, gaussian)),
    remapRandom(effector, randomScalar(state, gaussian)),
    remapRandom(effector, randomScalar(state, gaussian)),
  ];
}

function asUint(value: number): number {
  return value >>> 0;
}

function lattice(x: number, y: number, z: number): number {
  const hash = hashU32((
    Math.imul(asUint(x), 0x8da6b343)
    ^ Math.imul(asUint(y), 0xd8163841)
    ^ Math.imul(asUint(z), 0xcb1ab31f)
  ) >>> 0);
  return (hash & 0x00ffffff) / 16777216;
}

export function smoothNoiseCoordinate(value: number): number {
  return value * value * (3 - 2 * value);
}

export function effectorValueNoise(point: V3): number {
  const ix = Math.floor(point[0]), iy = Math.floor(point[1]), iz = Math.floor(point[2]);
  const fx = smoothNoiseCoordinate(point[0] - ix);
  const fy = smoothNoiseCoordinate(point[1] - iy);
  const fz = smoothNoiseCoordinate(point[2] - iz);
  const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
  return lerp(
    lerp(
      lerp(lattice(ix, iy, iz), lattice(ix + 1, iy, iz), fx),
      lerp(lattice(ix, iy + 1, iz), lattice(ix + 1, iy + 1, iz), fx),
      fy,
    ),
    lerp(
      lerp(lattice(ix, iy, iz + 1), lattice(ix + 1, iy, iz + 1), fx),
      lerp(lattice(ix, iy + 1, iz + 1), lattice(ix + 1, iy + 1, iz + 1), fx),
      fy,
    ),
    fz,
  );
}

function noiseScalar(effector: EffectorRuntime, point: V3, channel: number): number {
  const seed = effector.settings.seed;
  const offset: V3 = [
    seed * 0.137 + channel * 19.19,
    seed * 0.173 + channel * 7.73,
    seed * 0.199 + channel * 13.37,
  ];
  const samplePoint = add3(point, offset);
  if (effector.settings.randomMode === "noise") return effectorValueNoise(samplePoint);
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < 4; octave++) {
    sum += effectorValueNoise(scale3(samplePoint, frequency)) * amplitude;
    normalization += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return normalization > 0 ? sum / normalization : 0.5;
}

function noiseVector(effector: EffectorRuntime, point: V3, channel: number): V3 {
  if (!effector.settings.indexed) {
    const value = remapRandom(effector, noiseScalar(effector, point, channel));
    return [value, value, value];
  }
  return [
    remapRandom(effector, noiseScalar(effector, point, channel * 3)),
    remapRandom(effector, noiseScalar(effector, point, channel * 3 + 1)),
    remapRandom(effector, noiseScalar(effector, point, channel * 3 + 2)),
  ];
}

export function sampleRandomEffector(
  effector: EffectorRuntime,
  context: EffectorContext,
  fragmentId: number,
  stackIndex: number,
  pivot: V3,
): EffectorSamples {
  const baseSeed = hashU32((
    Math.imul(fragmentId, 0x9e3779b9)
    ^ (effector.settings.seed >>> 0)
    ^ Math.imul(stackIndex, 0x85ebca6b)
  ) >>> 0);
  const spatial = effector.settings.randomMode === "noise"
    || effector.settings.randomMode === "turbulence";
  const samplePosition = effector.settings.noiseSpace === "object"
    ? toObjectSpace(context, pivot)
    : pivot;
  let point = scale3(samplePosition, 1 / Math.max(effector.settings.noiseSize, 0.001));
  const drift = context.time * effector.settings.animationSpeed;
  point = [point[0] + drift, point[1] + drift, point[2] + drift];
  const first = spatial
    ? noiseVector(effector, point, 0)
    : randomVector(effector, baseSeed, 0);
  if (effector.settings.synchronized) {
    return { position: first, rotation: first, scale: first };
  }
  return {
    position: first,
    rotation: spatial
      ? noiseVector(effector, point, 1)
      : randomVector(effector, baseSeed, 1),
    scale: spatial
      ? noiseVector(effector, point, 2)
      : randomVector(effector, baseSeed, 2),
  };
}
