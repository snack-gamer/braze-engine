import type { AssetRef } from "../../assets/domain/asset-reference";
import { createAuthoredId } from "../../identity/authored-id";
import type {
  AnimatorBlendTree,
  AnimatorClipMotion,
  AnimatorMotion,
} from "../domain/blend-tree";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { AnimatorAuthoringError } from "./animator-controller-authoring";

export const MAX_AUTHORED_MOTION_DEPTH = ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth;
export const MAX_AUTHORED_MOTION_NODES = ANIMATOR_DOCUMENT_LIMITS.motionNodesPerState;
export const MAX_AUTHORED_BLEND_CHILDREN = ANIMATOR_DOCUMENT_LIMITS.blendTreeChildrenPerNode;

export type AnimatorMotionKind = "none" | "clip" | AnimatorBlendTree["kind"];
export type AnimatorMotionPath = readonly string[];
export type AnimatorMotionDefaults = Readonly<{
  clipRef?: AssetRef;
  parameterId?: string;
  parameterYId?: string;
}>;

export function animatorMotionKind(motion: AnimatorMotion | null): AnimatorMotionKind {
  return motion?.kind === "blendTree" ? motion.tree.kind : motion?.kind ?? "none";
}

function requiredValue(value: string | undefined, purpose: string): string {
  if (!value?.trim()) throw new AnimatorAuthoringError(`${purpose} is required.`);
  return value.trim();
}

export function createAnimatorMotion(
  kind: AnimatorMotionKind,
  defaults: AnimatorMotionDefaults = {},
): AnimatorMotion | null {
  if (kind === "none") return null;
  if (kind === "clip") {
    if (!defaults.clipRef) throw new AnimatorAuthoringError("An imported clip is required.");
    return { kind, clipRef: { ...defaults.clipRef }, speed: 1 };
  }
  if (kind === "direct") {
    return { kind: "blendTree", tree: { kind, normalizeWeights: true, children: [] } };
  }
  const parameterId = requiredValue(defaults.parameterId, "A numeric blend parameter");
  if (kind === "1d") {
    return { kind: "blendTree", tree: { kind, parameterId, children: [] } };
  }
  const parameterYId = requiredValue(defaults.parameterYId, "A second numeric blend parameter");
  if (parameterId === parameterYId) {
    throw new AnimatorAuthoringError("2D blend axes must use different parameters.");
  }
  return {
    kind: "blendTree",
    tree: { kind, parameterXId: parameterId, parameterYId, children: [] },
  };
}

export function animatorMotionAtPath(
  root: AnimatorMotion | null,
  path: AnimatorMotionPath,
): AnimatorMotion | null {
  let current = root;
  for (const childId of path) {
    if (current?.kind !== "blendTree") return null;
    current = current.tree.children.find((child) => child.id === childId)?.motion ?? null;
  }
  return current;
}

function updateMotionAtPath(
  root: AnimatorMotion | null,
  path: AnimatorMotionPath,
  update: (motion: AnimatorMotion | null, depth: number) => AnimatorMotion | null,
  depth = 0,
): AnimatorMotion | null {
  if (depth > MAX_AUTHORED_MOTION_DEPTH) {
    throw new AnimatorAuthoringError(`Motions cannot exceed depth ${MAX_AUTHORED_MOTION_DEPTH}.`);
  }
  if (path.length === 0) return update(root, depth);
  if (root?.kind !== "blendTree") throw new AnimatorAuthoringError("Motion path does not point into a blend tree.");
  const [childId, ...remaining] = path;
  let found = false;
  const children = root.tree.children.map((child) => {
    if (child.id !== childId) return child;
    found = true;
    const motion = updateMotionAtPath(child.motion, remaining, update, depth + 1);
    if (!motion) throw new AnimatorAuthoringError("Blend-tree child motions cannot be empty.");
    return { ...child, motion };
  });
  if (!found) throw new AnimatorAuthoringError(`Blend-tree child '${childId}' was not found.`);
  return { ...root, tree: { ...root.tree, children } } as AnimatorMotion;
}

export function replaceAnimatorMotionAtPath(
  root: AnimatorMotion | null,
  path: AnimatorMotionPath,
  kind: AnimatorMotionKind,
  defaults: AnimatorMotionDefaults = {},
): AnimatorMotion | null {
  if (path.length > 0 && kind === "none") {
    throw new AnimatorAuthoringError("Remove the blend child instead of assigning an empty child motion.");
  }
  if (path.length >= MAX_AUTHORED_MOTION_DEPTH && kind !== "clip" && kind !== "none") {
    throw new AnimatorAuthoringError(`Nested blend trees must remain below depth ${MAX_AUTHORED_MOTION_DEPTH}.`);
  }
  return updateMotionAtPath(root, path, () => createAnimatorMotion(kind, defaults));
}

export function patchAnimatorClipMotion(
  root: AnimatorMotion | null,
  path: AnimatorMotionPath,
  patch: Partial<Pick<AnimatorClipMotion, "clipRef" | "speed" | "timeScaleParameterId" | "loopMode">>,
): AnimatorMotion | null {
  return updateMotionAtPath(root, path, (motion) => {
    if (motion?.kind !== "clip") throw new AnimatorAuthoringError("Motion is not a clip.");
    const speed = patch.speed === undefined ? motion.speed : patch.speed;
    if (!Number.isFinite(speed) || speed === 0) throw new AnimatorAuthoringError("Clip speed must be finite and non-zero.");
    return {
      ...motion,
      ...patch,
      clipRef: patch.clipRef ? { ...patch.clipRef } : motion.clipRef,
      speed,
    };
  });
}

export function patchAnimatorBlendTree(
  root: AnimatorMotion | null,
  path: AnimatorMotionPath,
  patch: Readonly<{
    parameterId?: string;
    parameterXId?: string;
    parameterYId?: string;
    normalizeWeights?: boolean;
  }>,
): AnimatorMotion | null {
  return updateMotionAtPath(root, path, (motion) => {
    if (motion?.kind !== "blendTree") throw new AnimatorAuthoringError("Motion is not a blend tree.");
    const tree = motion.tree;
    if (tree.kind === "1d") {
      return {
        ...motion,
        tree: { ...tree, parameterId: requiredValue(patch.parameterId ?? tree.parameterId, "A numeric blend parameter") },
      };
    }
    if (tree.kind === "direct") {
      return { ...motion, tree: { ...tree, normalizeWeights: patch.normalizeWeights ?? tree.normalizeWeights } };
    }
    const parameterXId = requiredValue(patch.parameterXId ?? tree.parameterXId, "An X blend parameter");
    const parameterYId = requiredValue(patch.parameterYId ?? tree.parameterYId, "A Y blend parameter");
    if (parameterXId === parameterYId) throw new AnimatorAuthoringError("2D blend axes must use different parameters.");
    return { ...motion, tree: { ...tree, parameterXId, parameterYId } };
  });
}

type NewBlendChildOptions = Readonly<{
  id?: string;
  motion: AnimatorMotion;
  numericParameterId?: string;
}>;

const BLEND_POSITION_EPSILON = 1.0e-8;
const INITIAL_BLEND_2D_POSITIONS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

function nextBlend1dThreshold(children: readonly { threshold: number }[]): number {
  if (children.length === 0) return 0;
  const thresholds = new Set(children.map((child) => child.threshold));
  const nextAfterMaximum = Math.max(...thresholds) + 1;
  if (Number.isFinite(nextAfterMaximum) && !thresholds.has(nextAfterMaximum)) return nextAfterMaximum;

  // A finite authored threshold can be too large for +1 to advance it. In that
  // case, an integer within this range is guaranteed to be unused.
  for (let candidate = 0; candidate <= children.length; candidate += 1) {
    if (!thresholds.has(candidate)) return candidate;
  }
  throw new AnimatorAuthoringError("Could not assign a unique 1D blend threshold.");
}

function nextBlend2dPosition(
  children: readonly { position: readonly [number, number] }[],
  avoidSharedDirection: boolean,
): [number, number] {
  const available = (candidate: readonly [number, number]): boolean => children.every((child) => (
    !sameBlendPosition(child.position, candidate)
    && (!avoidSharedDirection || !samePositiveBlendDirection(child.position, candidate))
  ));
  for (const candidate of INITIAL_BLEND_2D_POSITIONS) {
    if (available(candidate)) return [candidate[0], candidate[1]];
  }

  // Primitive integer points provide deterministic new directions after the
  // center, cardinal, and diagonal defaults have been occupied.
  for (let radius = 2; radius <= children.length + 2; radius += 1) {
    for (let y = radius; y >= -radius; y -= 1) {
      for (let x = -radius; x <= radius; x += 1) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== radius || greatestCommonDivisor(x, y) !== 1) continue;
        const candidate: readonly [number, number] = [x, y];
        if (available(candidate)) return [x, y];
      }
    }
  }
  throw new AnimatorAuthoringError("Could not assign a unique 2D blend position.");
}

function sameBlendPosition(
  left: readonly [number, number],
  right: readonly [number, number],
): boolean {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  return x * x + y * y <= BLEND_POSITION_EPSILON ** 2;
}

function samePositiveBlendDirection(
  left: readonly [number, number],
  right: readonly [number, number],
): boolean {
  const leftLengthSquared = left[0] ** 2 + left[1] ** 2;
  const rightLengthSquared = right[0] ** 2 + right[1] ** 2;
  if (leftLengthSquared <= BLEND_POSITION_EPSILON ** 2
    || rightLengthSquared <= BLEND_POSITION_EPSILON ** 2) return false;
  const scale = Math.sqrt(leftLengthSquared * rightLengthSquared);
  const cross = left[0] * right[1] - left[1] * right[0];
  const dot = left[0] * right[0] + left[1] * right[1];
  return Math.abs(cross) <= BLEND_POSITION_EPSILON * scale && dot > 0;
}

function greatestCommonDivisor(left: number, right: number): number {
  let dividend = Math.abs(left);
  let divisor = Math.abs(right);
  while (divisor !== 0) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

export function addAnimatorBlendChild(
  root: AnimatorMotion | null,
  treePath: AnimatorMotionPath,
  options: NewBlendChildOptions,
): AnimatorMotion | null {
  if (countAnimatorMotionNodes(root) + countAnimatorMotionNodes(options.motion) > MAX_AUTHORED_MOTION_NODES) {
    throw new AnimatorAuthoringError(`A motion graph cannot exceed ${MAX_AUTHORED_MOTION_NODES} nodes.`);
  }
  return updateMotionAtPath(root, treePath, (motion, depth) => {
    if (motion?.kind !== "blendTree") throw new AnimatorAuthoringError("Motion is not a blend tree.");
    if (depth >= MAX_AUTHORED_MOTION_DEPTH) {
      throw new AnimatorAuthoringError(`Blend children cannot exceed depth ${MAX_AUTHORED_MOTION_DEPTH}.`);
    }
    if (depth + 1 + maxAnimatorMotionDepth(options.motion) > MAX_AUTHORED_MOTION_DEPTH) {
      throw new AnimatorAuthoringError(`Nested child motion exceeds depth ${MAX_AUTHORED_MOTION_DEPTH}.`);
    }
    if (motion.tree.children.length >= MAX_AUTHORED_BLEND_CHILDREN) {
      throw new AnimatorAuthoringError(`A blend tree cannot exceed ${MAX_AUTHORED_BLEND_CHILDREN} children.`);
    }
    const id = options.id ?? createAuthoredId("blend-child");
    if (motion.tree.children.some((child) => child.id === id)) {
      throw new AnimatorAuthoringError(`Blend child '${id}' already exists.`);
    }
    const shared = { id, motion: cloneAnimatorMotion(options.motion), timeScale: 1, mirror: false };
    const tree = motion.tree;
    if (tree.kind === "1d") {
      return {
        ...motion,
        tree: { ...tree, children: [...tree.children, { ...shared, threshold: nextBlend1dThreshold(tree.children) }] },
      };
    }
    if (tree.kind === "direct") {
      const weightParameterId = requiredValue(options.numericParameterId, "A Direct weight parameter");
      return { ...motion, tree: { ...tree, children: [...tree.children, { ...shared, weightParameterId }] } };
    }
    return {
      ...motion,
      tree: {
        ...tree,
        children: [...tree.children, {
          ...shared,
          position: nextBlend2dPosition(tree.children, tree.kind === "2dSimpleDirectional"),
        }],
      },
    };
  });
}

export function patchAnimatorBlendChild(
  root: AnimatorMotion | null,
  treePath: AnimatorMotionPath,
  childId: string,
  patch: Readonly<{
    timeScale?: number;
    threshold?: number;
    position?: readonly [number, number];
    weightParameterId?: string;
    mirror?: boolean;
  }>,
): AnimatorMotion | null {
  assertBlendChild(root, treePath, childId);
  return updateBlendTree(root, treePath, (tree) => {
    if (tree.kind === "1d") return {
      ...tree,
      children: tree.children.map((child) => child.id === childId ? {
        ...child,
        timeScale: validTimeScale(patch.timeScale, child.timeScale),
        mirror: patch.mirror ?? child.mirror,
        threshold: finiteOr(patch.threshold, child.threshold),
      } : child),
    };
    if (tree.kind === "direct") return {
      ...tree,
      children: tree.children.map((child) => child.id === childId ? {
        ...child,
        timeScale: validTimeScale(patch.timeScale, child.timeScale),
        mirror: patch.mirror ?? child.mirror,
        weightParameterId: requiredValue(
          patch.weightParameterId ?? child.weightParameterId,
          "A Direct weight parameter",
        ),
      } : child),
    };
    return {
      ...tree,
      children: tree.children.map((child) => child.id === childId ? {
        ...child,
        timeScale: validTimeScale(patch.timeScale, child.timeScale),
        mirror: patch.mirror ?? child.mirror,
        position: patch.position
          ? [
              finiteOr(patch.position[0], child.position[0]),
              finiteOr(patch.position[1], child.position[1]),
            ] as [number, number]
          : child.position,
      } : child),
    };
  });
}

export function removeAnimatorBlendChild(
  root: AnimatorMotion | null,
  treePath: AnimatorMotionPath,
  childId: string,
): AnimatorMotion | null {
  assertBlendChild(root, treePath, childId);
  return updateBlendTree(root, treePath, (tree) => ({
    ...tree,
    children: tree.children.filter((child) => child.id !== childId),
  }) as AnimatorBlendTree);
}

export function moveAnimatorBlendChild(
  root: AnimatorMotion | null,
  treePath: AnimatorMotionPath,
  childId: string,
  direction: -1 | 1,
): AnimatorMotion | null {
  assertBlendChild(root, treePath, childId);
  return updateBlendTree(root, treePath, (tree) => {
    const index = tree.children.findIndex((child) => child.id === childId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= tree.children.length) return tree;
    const children = [...tree.children];
    [children[index], children[target]] = [children[target]!, children[index]!];
    return { ...tree, children } as AnimatorBlendTree;
  });
}

function assertBlendChild(root: AnimatorMotion | null, path: AnimatorMotionPath, childId: string): void {
  const motion = animatorMotionAtPath(root, path);
  if (motion?.kind !== "blendTree" || !motion.tree.children.some((child) => child.id === childId)) {
    throw new AnimatorAuthoringError(`Blend-tree child '${childId}' was not found.`);
  }
}

function updateBlendTree(
  root: AnimatorMotion | null,
  path: AnimatorMotionPath,
  update: (tree: AnimatorBlendTree) => AnimatorBlendTree,
): AnimatorMotion | null {
  return updateMotionAtPath(root, path, (motion) => {
    if (motion?.kind !== "blendTree") throw new AnimatorAuthoringError("Motion is not a blend tree.");
    return { ...motion, tree: update(motion.tree) } as AnimatorMotion;
  });
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function validTimeScale(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result === 0) {
    throw new AnimatorAuthoringError("Child speed must be finite and non-zero.");
  }
  return result;
}

export function countAnimatorMotionNodes(motion: AnimatorMotion | null): number {
  return !motion ? 0 : 1 + (motion.kind === "blendTree"
    ? motion.tree.children.reduce((total, child) => total + countAnimatorMotionNodes(child.motion), 0)
    : 0);
}

function maxAnimatorMotionDepth(motion: AnimatorMotion): number {
  return motion.kind !== "blendTree" || motion.tree.children.length === 0
    ? 0
    : 1 + Math.max(...motion.tree.children.map((child) => maxAnimatorMotionDepth(child.motion)));
}

export function cloneAnimatorMotion(motion: AnimatorMotion): AnimatorMotion {
  if (motion.kind === "clip") return { ...motion, clipRef: { ...motion.clipRef } };
  return {
    ...motion,
    tree: {
      ...motion.tree,
      children: motion.tree.children.map((child) => ({
        ...child,
        ...(motion.tree.kind === "2dSimpleDirectional"
          || motion.tree.kind === "2dFreeformDirectional"
          || motion.tree.kind === "2dFreeformCartesian"
          ? { position: [...("position" in child ? child.position : [0, 0])] as [number, number] }
          : {}),
        motion: cloneAnimatorMotion(child.motion),
      })),
    },
  } as AnimatorMotion;
}
