import type { EffectorSettings } from "../../types";
import {
  add3,
  dot3,
  hashU32,
  length3,
  normalize3,
  scale3,
  sub3,
  type V3,
} from "./math";
import { effectorWeight } from "./runtime-builder";
import type { EffectorRuntime } from "./runtime-types";

function pairDirection(self: number, other: number): V3 {
  const lower = Math.min(self, other);
  const higher = Math.max(self, other);
  const hash = hashU32((
    Math.imul(lower, 0x9e3779b9)
    ^ Math.imul(higher, 0x85ebca6b)
  ) >>> 0);
  let direction: V3 = [
    (hash & 1023) / 511.5 - 1,
    ((hash >>> 10) & 1023) / 511.5 - 1,
    ((hash >>> 20) & 1023) / 511.5 - 1,
  ];
  if (dot3(direction, direction) <= 1e-6) direction = [1, 0, 0];
  direction = normalize3(direction, [1, 0, 0]);
  return self < other ? scale3(direction, -1) : direction;
}

const PUSH_DIRECTION_INDEX: Record<EffectorSettings["pushDirection"], number> = {
  all: 0,
  x: 1,
  y: 2,
  z: 3,
};

export function pushCorrection(
  difference: V3,
  minimumDistance: number,
  mode: number,
  self: number,
  other: number,
): V3 | null {
  if (mode === 0) {
    const distance = length3(difference);
    if (distance < minimumDistance) {
      const direction = distance > 1e-6
        ? scale3(difference, 1 / distance)
        : pairDirection(self, other);
      return scale3(direction, minimumDistance - distance);
    }
    return null;
  }
  const component = mode === 1
    ? difference[0]
    : mode === 2
      ? difference[1]
      : difference[2];
  const perpendicularSquared = Math.max(
    0,
    dot3(difference, difference) - component * component,
  );
  const overlap = Math.sqrt(Math.max(
    0,
    minimumDistance * minimumDistance - perpendicularSquared,
  )) - Math.abs(component);
  if (overlap <= 0) return null;
  const signedOverlap = overlap * (
    Math.abs(component) > 1e-6
      ? Math.sign(component)
      : self < other
        ? -1
        : 1
  );
  if (mode === 1) return [signedOverlap, 0, 0];
  if (mode === 2) return [0, signedOverlap, 0];
  return [0, 0, signedOverlap];
}

export function pushApartPass(
  effector: EffectorRuntime,
  basePositions: V3[],
  currentOffsets: V3[],
  nextOffsets: V3[],
  neighborsFor: (index: number) => number[],
): void {
  const mode = PUSH_DIRECTION_INDEX[effector.settings.pushDirection];
  const minimumDistance = Math.max(0, effector.settings.separationRadius) * 2;
  const count = basePositions.length;
  for (let index = 0; index < count; index++) {
    const current = currentOffsets[index];
    const selfPosition = add3(basePositions[index], current);
    const weight = effectorWeight(effector, selfPosition);
    let delta: V3 = [0, 0, 0];
    if (Math.abs(weight) > 1e-6 && minimumDistance > 0) {
      const neighbors = neighborsFor(index);
      for (const other of neighbors) {
        const otherPosition = add3(basePositions[other], currentOffsets[other]);
        const correction = pushCorrection(
          sub3(selfPosition, otherPosition),
          minimumDistance,
          mode,
          index,
          other,
        );
        if (!correction) continue;
        const otherMoves = Math.abs(effectorWeight(effector, otherPosition)) > 1e-6;
        delta = add3(delta, scale3(correction, (otherMoves ? 0.5 : 1) * weight));
      }
      const deltaLength = length3(delta);
      if (deltaLength > minimumDistance) {
        delta = scale3(delta, minimumDistance / deltaLength);
      }
    }
    nextOffsets[index] = add3(current, delta);
  }
}
