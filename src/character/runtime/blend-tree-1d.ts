import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";

export type BlendTree1dChild = Readonly<{
  motionId: string;
  threshold: number;
}>;

export type BlendTreeMotionWeight = Readonly<{
  motionId: string;
  weight: number;
}>;

/** Produces a stable, at-most-two-motion interpolation for a 1D blend tree. */
export function evaluateBlendTree1d(
  children: readonly BlendTree1dChild[],
  parameterValue: number,
): CharacterRuntimeResult<readonly BlendTreeMotionWeight[]> {
  if (!Number.isFinite(parameterValue)) {
    return characterRuntimeFailure(
      "invalid-blend-parameter",
      "A 1D blend-tree parameter must be finite.",
    );
  }
  if (children.length === 0) {
    return characterRuntimeFailure(
      "empty-blend-tree",
      "A 1D blend tree requires at least one motion.",
    );
  }
  if (children.some((child) => !child.motionId || !Number.isFinite(child.threshold))) {
    return characterRuntimeFailure(
      "invalid-blend-child",
      "Every 1D blend-tree child needs a motion and finite threshold.",
    );
  }
  if (new Set(children.map((child) => child.motionId)).size !== children.length) {
    return characterRuntimeFailure(
      "duplicate-blend-child-id",
      "Every 1D blend-tree child needs a unique motion ID.",
    );
  }

  const sorted = [...children].sort((left, right) => (
    left.threshold - right.threshold || left.motionId.localeCompare(right.motionId)
  ));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1]!.threshold === sorted[index]!.threshold) {
      return characterRuntimeFailure(
        "duplicate-blend-threshold",
        `1D blend-tree threshold ${sorted[index]!.threshold} is assigned more than once.`,
      );
    }
  }
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (parameterValue <= first.threshold) return characterRuntimeSuccess([{ motionId: first.motionId, weight: 1 }]);
  if (parameterValue >= last.threshold) return characterRuntimeSuccess([{ motionId: last.motionId, weight: 1 }]);

  for (let index = 1; index < sorted.length; index += 1) {
    const right = sorted[index]!;
    if (parameterValue > right.threshold) continue;
    const left = sorted[index - 1]!;
    const rightWeight = (parameterValue - left.threshold) / (right.threshold - left.threshold);
    return characterRuntimeSuccess([
      { motionId: left.motionId, weight: 1 - rightWeight },
      { motionId: right.motionId, weight: rightWeight },
    ]);
  }
  return characterRuntimeSuccess([{ motionId: last.motionId, weight: 1 }]);
}
