export type CharacterVector3 = readonly [number, number, number];
export type CharacterQuaternion = readonly [number, number, number, number];

const QUATERNION_EPSILON = 1.0e-12;

export function finiteVector3(value: CharacterVector3): boolean {
  return value.every(Number.isFinite);
}

export function finiteQuaternion(value: CharacterQuaternion): boolean {
  return value.every(Number.isFinite) && quaternionLengthSquared(value) > QUATERNION_EPSILON;
}

export function normalizeCharacterQuaternion(value: CharacterQuaternion): CharacterQuaternion | null {
  const lengthSquared = quaternionLengthSquared(value);
  if (!Number.isFinite(lengthSquared) || lengthSquared <= QUATERNION_EPSILON) return null;
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  const normalized: CharacterQuaternion = [
    value[0] * inverseLength,
    value[1] * inverseLength,
    value[2] * inverseLength,
    value[3] * inverseLength,
  ];
  return canonicalQuaternionHemisphere(normalized);
}

export function multiplyCharacterQuaternions(
  left: CharacterQuaternion,
  right: CharacterQuaternion,
): CharacterQuaternion {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  const product: CharacterQuaternion = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  return normalizeCharacterQuaternion(product) ?? [0, 0, 0, 1];
}

export function inverseCharacterQuaternion(value: CharacterQuaternion): CharacterQuaternion {
  const normalized = normalizeCharacterQuaternion(value) ?? [0, 0, 0, 1];
  return [-normalized[0], -normalized[1], -normalized[2], normalized[3]];
}

export function rotateCharacterVector(
  quaternion: CharacterQuaternion,
  vector: CharacterVector3,
): CharacterVector3 {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = normalizeCharacterQuaternion(quaternion) ?? [0, 0, 0, 1];
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function addCharacterVectors(
  left: CharacterVector3,
  right: CharacterVector3,
): CharacterVector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function subtractCharacterVectors(
  left: CharacterVector3,
  right: CharacterVector3,
): CharacterVector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function quaternionLengthSquared(value: CharacterQuaternion): number {
  return value[0] ** 2 + value[1] ** 2 + value[2] ** 2 + value[3] ** 2;
}

function canonicalQuaternionHemisphere(value: CharacterQuaternion): CharacterQuaternion {
  const signProbe = Math.abs(value[3]) > QUATERNION_EPSILON
    ? value[3]
    : value.find((component) => Math.abs(component) > QUATERNION_EPSILON) ?? 1;
  return signProbe < 0
    ? [-value[0], -value[1], -value[2], -value[3]]
    : value;
}
