import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";
import type { BlendTreeMotionWeight } from "./blend-tree-1d";

const WEIGHT_EPSILON = 1.0e-10;

export type DirectBlendTreeChild = Readonly<{
  motionId: string;
  weight: number;
}>;

/** Maps authored parameters directly to child weights, optionally normalizing their sum. */
export function evaluateDirectBlendTree(
  children: readonly DirectBlendTreeChild[],
  normalizeWeights: boolean,
): CharacterRuntimeResult<readonly BlendTreeMotionWeight[]> {
  if (children.length === 0) return characterRuntimeFailure(
    "empty-blend-tree",
    "A Direct blend tree requires at least one motion.",
  );
  const ids = new Set<string>();
  for (const child of children) {
    if (!child.motionId || ids.has(child.motionId)) return characterRuntimeFailure(
      "duplicate-blend-child-id",
      "Every Direct blend-tree child needs a unique motion ID.",
    );
    if (!Number.isFinite(child.weight) || child.weight < 0) return characterRuntimeFailure(
      "invalid-direct-blend-weight",
      `Direct blend-tree motion ${child.motionId} requires a finite, non-negative weight.`,
    );
    ids.add(child.motionId);
  }

  if (!normalizeWeights) return characterRuntimeSuccess(
    children.map((child) => ({ motionId: child.motionId, weight: child.weight })),
  );
  const total = children.reduce((sum, child) => sum + child.weight, 0);
  if (total <= WEIGHT_EPSILON) return characterRuntimeSuccess([], [{
    code: "zero-direct-blend-weight-sum",
    severity: "warning",
    message: "A normalized Direct blend tree has no active child because every weight is zero.",
  }]);
  return characterRuntimeSuccess(children.map((child) => ({
    motionId: child.motionId,
    weight: child.weight / total,
  })));
}
