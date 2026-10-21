import type {
  AnimatorBlendTree,
  AnimatorMotion,
  BlendTree1D,
  BlendTree2D,
  BlendTreeDirect,
} from "../domain/blend-tree";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import {
  CharacterCodecError,
  arrayWithinLimit,
  assertArrayWithinLimit,
  finiteNumber,
  optionalString,
  parseAssetRef,
  parseVector2,
  record,
  serializeAssetRef,
  uniqueIds,
} from "./character-codec-values";

type MotionBudget = { nodes: number };

function decodeChildMotion(
  input: Record<string, unknown>,
  path: string,
  depth: number,
  active: WeakSet<object>,
  budget: MotionBudget,
): AnimatorMotion | null {
  return decodeMotion(input.motion, `${path}.motion`, depth + 1, active, budget);
}

function sharedChild(
  input: Record<string, unknown>,
  index: number,
  path: string,
  depth: number,
  active: WeakSet<object>,
  budget: MotionBudget,
) {
  const motion = decodeChildMotion(input, path, depth, active, budget);
  if (!motion) return null;
  return {
    id: optionalString(input.id) ?? `child-${index + 1}`,
    motion,
    timeScale: finiteNumber(input.timeScale ?? input.time_scale, 1),
    mirror: input.mirror === true,
  };
}

function childInputs(value: unknown, path: string): Record<string, unknown>[] {
  return arrayWithinLimit(
    value,
    path,
    ANIMATOR_DOCUMENT_LIMITS.blendTreeChildrenPerNode,
  ).flatMap((item) => {
    const input = record(item);
    return input ? [input] : [];
  });
}

function decodeBlendTree(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
  budget: MotionBudget,
): AnimatorBlendTree | null {
  const input = record(value);
  if (!input) return null;
  const children = childInputs(input.children, `${path}.children`);
  if (input.kind === "1d") {
    const decoded = children.flatMap((child, index): BlendTree1D["children"] => {
      const shared = sharedChild(child, index, `${path}.children[${index}]`, depth, active, budget);
      return shared ? [{ ...shared, threshold: finiteNumber(child.threshold, index) }] : [];
    });
    uniqueIds(decoded, `${path}.children`);
    return {
      kind: "1d",
      parameterId: optionalString(input.parameterId ?? input.parameter_id) ?? "",
      children: decoded.sort((left, right) => left.threshold - right.threshold),
    };
  }
  if (
    input.kind === "2dSimpleDirectional"
    || input.kind === "2dFreeformDirectional"
    || input.kind === "2dFreeformCartesian"
  ) {
    const decoded = children.flatMap((child, index): BlendTree2D["children"] => {
      const shared = sharedChild(child, index, `${path}.children[${index}]`, depth, active, budget);
      return shared ? [{ ...shared, position: parseVector2(child.position) }] : [];
    });
    uniqueIds(decoded, `${path}.children`);
    return {
      kind: input.kind,
      parameterXId: optionalString(input.parameterXId ?? input.parameter_x_id) ?? "",
      parameterYId: optionalString(input.parameterYId ?? input.parameter_y_id) ?? "",
      children: decoded,
    };
  }
  if (input.kind === "direct") {
    const decoded = children.flatMap((child, index): BlendTreeDirect["children"] => {
      const shared = sharedChild(child, index, `${path}.children[${index}]`, depth, active, budget);
      const weightParameterId = optionalString(child.weightParameterId ?? child.weight_parameter_id);
      return shared && weightParameterId ? [{ ...shared, weightParameterId }] : [];
    });
    uniqueIds(decoded, `${path}.children`);
    return { kind: "direct", normalizeWeights: input.normalizeWeights !== false, children: decoded };
  }
  return null;
}

export function decodeAnimatorMotion(value: unknown, path = "motion", depth = 0): AnimatorMotion | null {
  return decodeMotion(value, path, depth, new WeakSet<object>(), { nodes: 0 });
}

function decodeMotion(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
  budget: MotionBudget,
): AnimatorMotion | null {
  if (depth > ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth) {
    throw new CharacterCodecError(
      "invalid-document",
      path,
      `blend trees cannot exceed depth ${ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth}`,
    );
  }
  const input = record(value);
  if (!input) return null;
  consumeMotionNode(budget, path);
  if (input.kind === "clip") {
    const loopMode = input.loopMode ?? input.loop_mode;
    return {
      kind: "clip",
      clipRef: parseAssetRef(input.clipRef ?? input.clip_ref, `${path}.clipRef`, true)!,
      speed: finiteNumber(input.speed, 1),
      ...(optionalString(input.timeScaleParameterId ?? input.time_scale_parameter_id)
        ? { timeScaleParameterId: optionalString(input.timeScaleParameterId ?? input.time_scale_parameter_id)! }
        : {}),
      ...(loopMode === "loop" || loopMode === "once" ? { loopMode } : {}),
    };
  }
  if (input.kind === "blendTree") {
    if (active.has(input)) {
      throw new CharacterCodecError("invalid-topology", path, "blend-tree motions cannot contain cycles");
    }
    active.add(input);
    try {
      const tree = decodeBlendTree(input.tree, `${path}.tree`, depth, active, budget);
      return tree ? { kind: "blendTree", tree } : null;
    } finally {
      active.delete(input);
    }
  }
  return null;
}

function encodeBlendTree(
  tree: AnimatorBlendTree,
  depth: number,
  active: WeakSet<object>,
  path: string,
  budget: MotionBudget,
): Record<string, unknown> {
  if (depth > ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth) {
    throw new CharacterCodecError(
      "invalid-document",
      path,
      `blend trees cannot exceed depth ${ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth}`,
    );
  }
  assertArrayWithinLimit(
    tree.children,
    `${path}.children`,
    ANIMATOR_DOCUMENT_LIMITS.blendTreeChildrenPerNode,
  );
  if (tree.kind === "1d") {
    const children = tree.children.map((child, index) => ({
      id: child.id,
      motion: encodeMotion(child.motion, depth + 1, active, `${path}.children[${index}].motion`, budget),
      timeScale: child.timeScale,
      mirror: child.mirror,
      threshold: child.threshold,
    }));
    return { kind: tree.kind, parameterId: tree.parameterId, children };
  }
  if (tree.kind === "direct") {
    const children = tree.children.map((child, index) => ({
      id: child.id,
      motion: encodeMotion(child.motion, depth + 1, active, `${path}.children[${index}].motion`, budget),
      timeScale: child.timeScale,
      mirror: child.mirror,
      weightParameterId: child.weightParameterId,
    }));
    return { kind: tree.kind, normalizeWeights: tree.normalizeWeights, children };
  }
  const children = tree.children.map((child, index) => ({
    id: child.id,
    motion: encodeMotion(child.motion, depth + 1, active, `${path}.children[${index}].motion`, budget),
    timeScale: child.timeScale,
    mirror: child.mirror,
    position: [...child.position],
  }));
  return {
    kind: tree.kind,
    parameterXId: tree.parameterXId,
    parameterYId: tree.parameterYId,
    children,
  };
}

export function encodeAnimatorMotion(motion: AnimatorMotion, depth = 0): Record<string, unknown> {
  return encodeMotion(motion, depth, new WeakSet<object>(), "motion", { nodes: 0 });
}

function encodeMotion(
  motion: AnimatorMotion,
  depth: number,
  active: WeakSet<object>,
  path: string,
  budget: MotionBudget,
): Record<string, unknown> {
  if (depth > ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth) {
    throw new CharacterCodecError(
      "invalid-document",
      path,
      `blend trees cannot exceed depth ${ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth}`,
    );
  }
  consumeMotionNode(budget, path);
  if (motion.kind === "clip") {
    return {
      kind: "clip",
      clipRef: serializeAssetRef(motion.clipRef),
      speed: motion.speed,
      ...(motion.timeScaleParameterId ? { timeScaleParameterId: motion.timeScaleParameterId } : {}),
      ...(motion.loopMode ? { loopMode: motion.loopMode } : {}),
    };
  }
  if (active.has(motion)) {
    throw new CharacterCodecError("invalid-topology", path, "blend-tree motions cannot contain cycles");
  }
  active.add(motion);
  try {
    return { kind: "blendTree", tree: encodeBlendTree(motion.tree, depth, active, `${path}.tree`, budget) };
  } finally {
    active.delete(motion);
  }
}

function consumeMotionNode(budget: MotionBudget, path: string): void {
  budget.nodes += 1;
  if (budget.nodes > ANIMATOR_DOCUMENT_LIMITS.motionNodesPerState) {
    throw new CharacterCodecError(
      "invalid-document",
      path,
      `motion graphs cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.motionNodesPerState} nodes`,
    );
  }
}
