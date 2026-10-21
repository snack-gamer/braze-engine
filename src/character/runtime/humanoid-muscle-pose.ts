import type { HumanoidMuscleLimit } from "../domain/humanoid-avatar";
import {
  inverseCharacterQuaternion,
  multiplyCharacterQuaternions,
  normalizeCharacterQuaternion,
  type CharacterQuaternion,
  type CharacterVector3,
} from "./pose-math";

export type HumanoidMuscleValue = CharacterVector3;

export const DEFAULT_HUMANOID_MUSCLE_LIMIT: HumanoidMuscleLimit = Object.freeze({
  minimum: [-Math.PI, -Math.PI, -Math.PI],
  maximum: [Math.PI, Math.PI, Math.PI],
});

export type HumanoidMuscleTransfer = Readonly<{
  sourceLocalRotation: CharacterQuaternion;
  sourceReferenceLocalRotation: CharacterQuaternion;
  sourceParentReferenceRotation: CharacterQuaternion;
  targetReferenceLocalRotation: CharacterQuaternion;
  targetParentReferenceRotation: CharacterQuaternion;
  axisAlignment: CharacterQuaternion;
  sourceLimit?: HumanoidMuscleLimit;
  targetLimit?: HumanoidMuscleLimit;
}>;

/** Transfers one local joint rotation through a canonical normalized muscle pose. */
export function transferHumanoidMuscleRotation(
  input: HumanoidMuscleTransfer,
): Readonly<{ rotation: CharacterQuaternion; muscles: HumanoidMuscleValue }> | null {
  const sourceLocalDelta = multiplyCharacterQuaternions(
    input.sourceLocalRotation,
    inverseCharacterQuaternion(input.sourceReferenceLocalRotation),
  );
  const sourceCanonicalDelta = conjugateRotation(
    input.sourceParentReferenceRotation,
    sourceLocalDelta,
  );
  const alignedDelta = conjugateRotation(input.axisAlignment, sourceCanonicalDelta);
  const muscles = encodeHumanoidMuscleRotation(alignedDelta, input.sourceLimit);
  if (!muscles) return null;
  const targetCanonicalDelta = decodeHumanoidMuscleRotation(muscles, input.targetLimit);
  if (!targetCanonicalDelta) return null;
  const targetLocalDelta = conjugateRotation(
    inverseCharacterQuaternion(input.targetParentReferenceRotation),
    targetCanonicalDelta,
  );
  return {
    muscles,
    rotation: multiplyCharacterQuaternions(
      targetLocalDelta,
      input.targetReferenceLocalRotation,
    ),
  };
}

/** Encodes a canonical-frame rotation as three normalized, skeleton-independent muscles. */
export function encodeHumanoidMuscleRotation(
  rotation: CharacterQuaternion,
  limit: HumanoidMuscleLimit = DEFAULT_HUMANOID_MUSCLE_LIMIT,
): HumanoidMuscleValue | null {
  if (!validHumanoidMuscleLimit(limit)) return null;
  const vector = quaternionRotationVector(rotation);
  if (!vector) return null;
  return vector.map((value, axis) => clampMuscle(value < 0
    ? value / -limit.minimum[axis]!
    : value / limit.maximum[axis]!)) as unknown as HumanoidMuscleValue;
}

/** Reconstructs a canonical-frame rotation from normalized target-Avatar muscles. */
export function decodeHumanoidMuscleRotation(
  muscles: HumanoidMuscleValue,
  limit: HumanoidMuscleLimit = DEFAULT_HUMANOID_MUSCLE_LIMIT,
): CharacterQuaternion | null {
  if (!validHumanoidMuscleLimit(limit) || !muscles.every(Number.isFinite)) return null;
  const vector = muscles.map((value, axis) => {
    const normalized = clampMuscle(value);
    return normalized < 0
      ? normalized * -limit.minimum[axis]!
      : normalized * limit.maximum[axis]!;
  }) as unknown as CharacterVector3;
  return rotationVectorQuaternion(vector);
}

export function validHumanoidMuscleLimit(limit: HumanoidMuscleLimit): boolean {
  return limit.minimum.every((value) => Number.isFinite(value) && value < 0)
    && limit.maximum.every((value) => Number.isFinite(value) && value > 0);
}

function quaternionRotationVector(rotation: CharacterQuaternion): CharacterVector3 | null {
  const normalized = normalizeCharacterQuaternion(rotation);
  if (!normalized) return null;
  const halfAngle = Math.acos(Math.min(1, Math.max(-1, normalized[3])));
  const sine = Math.sin(halfAngle);
  if (Math.abs(sine) < 1.0e-8) {
    return [normalized[0] * 2, normalized[1] * 2, normalized[2] * 2];
  }
  const scale = (2 * halfAngle) / sine;
  return [normalized[0] * scale, normalized[1] * scale, normalized[2] * scale];
}

function rotationVectorQuaternion(vector: CharacterVector3): CharacterQuaternion | null {
  const angle = Math.hypot(...vector);
  if (!Number.isFinite(angle)) return null;
  if (angle < 1.0e-8) return normalizeCharacterQuaternion([
    vector[0] * 0.5,
    vector[1] * 0.5,
    vector[2] * 0.5,
    1,
  ]);
  const half = angle * 0.5;
  const scale = Math.sin(half) / angle;
  return normalizeCharacterQuaternion([
    vector[0] * scale,
    vector[1] * scale,
    vector[2] * scale,
    Math.cos(half),
  ]);
}

function clampMuscle(value: number): number {
  return Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0));
}

function conjugateRotation(
  basis: CharacterQuaternion,
  rotation: CharacterQuaternion,
): CharacterQuaternion {
  return multiplyCharacterQuaternions(
    multiplyCharacterQuaternions(basis, rotation),
    inverseCharacterQuaternion(basis),
  );
}
