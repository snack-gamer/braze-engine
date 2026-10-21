import type { CharacterAxis } from "../domain/character-values";
import {
  normalizeCharacterQuaternion,
  type CharacterQuaternion,
  type CharacterVector3,
} from "./pose-math";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";

/** Rotation mapping a source rig's declared forward/up basis into the target basis. */
export function compileAxisAlignment(
  sourceForward: CharacterAxis,
  sourceUp: CharacterAxis,
  targetForward: CharacterAxis,
  targetUp: CharacterAxis,
): CharacterRuntimeResult<CharacterQuaternion> {
  const sourceBasis = basis(sourceForward, sourceUp);
  const targetBasis = basis(targetForward, targetUp);
  if (!sourceBasis || !targetBasis) return characterRuntimeFailure(
    "invalid-avatar-axes",
    "Avatar forward and up axes must be perpendicular.",
  );
  const matrix = multiplyBasisByTranspose(targetBasis, sourceBasis);
  const quaternion = quaternionFromRotationMatrix(matrix);
  return quaternion
    ? characterRuntimeSuccess(quaternion)
    : characterRuntimeFailure(
        "invalid-avatar-axis-conversion",
        "Avatar axes could not be converted into a stable rotation.",
      );
}

type Basis = readonly [CharacterVector3, CharacterVector3, CharacterVector3];

function basis(forwardAxis: CharacterAxis, upAxis: CharacterAxis): Basis | null {
  const forward = axisVector(forwardAxis);
  const up = axisVector(upAxis);
  if (dot(forward, up) !== 0) return null;
  const right = cross(up, forward);
  return [right, up, forward];
}

function axisVector(axis: CharacterAxis): CharacterVector3 {
  const sign = axis[0] === "-" ? -1 : 1;
  if (axis[1] === "x") return [sign, 0, 0];
  if (axis[1] === "y") return [0, sign, 0];
  return [0, 0, sign];
}

function multiplyBasisByTranspose(target: Basis, source: Basis): number[] {
  const matrix = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      matrix[row * 3 + column] = target.reduce((sum, axis, index) => (
        sum + axis[row]! * source[index]![column]!
      ), 0);
    }
  }
  return matrix;
}

function quaternionFromRotationMatrix(matrix: readonly number[]): CharacterQuaternion | null {
  const m00 = matrix[0]!;
  const m11 = matrix[4]!;
  const m22 = matrix[8]!;
  const trace = m00 + m11 + m22;
  let quaternion: CharacterQuaternion;
  if (trace > 0) {
    const scale = 2 * Math.sqrt(trace + 1);
    quaternion = [(matrix[7]! - matrix[5]!) / scale, (matrix[2]! - matrix[6]!) / scale,
      (matrix[3]! - matrix[1]!) / scale, scale / 4];
  } else if (m00 > m11 && m00 > m22) {
    const scale = 2 * Math.sqrt(1 + m00 - m11 - m22);
    quaternion = [scale / 4, (matrix[1]! + matrix[3]!) / scale,
      (matrix[2]! + matrix[6]!) / scale, (matrix[7]! - matrix[5]!) / scale];
  } else if (m11 > m22) {
    const scale = 2 * Math.sqrt(1 + m11 - m00 - m22);
    quaternion = [(matrix[1]! + matrix[3]!) / scale, scale / 4,
      (matrix[5]! + matrix[7]!) / scale, (matrix[2]! - matrix[6]!) / scale];
  } else {
    const scale = 2 * Math.sqrt(1 + m22 - m00 - m11);
    quaternion = [(matrix[2]! + matrix[6]!) / scale, (matrix[5]! + matrix[7]!) / scale,
      scale / 4, (matrix[3]! - matrix[1]!) / scale];
  }
  return normalizeCharacterQuaternion(quaternion);
}

function dot(left: CharacterVector3, right: CharacterVector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: CharacterVector3, right: CharacterVector3): CharacterVector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}
