export type CharacterVector2 = [number, number];
export type CharacterVector3 = [number, number, number];
export type CharacterQuaternion = [number, number, number, number];
export type CharacterMatrix4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/** A bone-local transform. Rotations are normalized XYZW quaternions. */
export type CharacterTransform = {
  translation: CharacterVector3;
  rotation: CharacterQuaternion;
  scale: CharacterVector3;
};

export type CharacterAxis = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

export const IDENTITY_CHARACTER_TRANSFORM: CharacterTransform = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

export const IDENTITY_CHARACTER_MATRIX: CharacterMatrix4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
