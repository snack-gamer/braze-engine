import {
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";
import type { BlendTreeMotionWeight } from "./blend-tree-1d";

const POSITION_EPSILON = 1.0e-8;
const WEIGHT_EPSILON = 1.0e-10;

export type BlendTree2dKind =
  | "2dSimpleDirectional"
  | "2dFreeformDirectional"
  | "2dFreeformCartesian";

export type BlendTree2dChild = Readonly<{
  motionId: string;
  position: readonly [number, number];
}>;

/** Deterministic Unity-style directional and Cartesian 2D motion weighting. */
export function evaluateBlendTree2d(
  kind: BlendTree2dKind,
  children: readonly BlendTree2dChild[],
  parameterX: number,
  parameterY: number,
): CharacterRuntimeResult<readonly BlendTreeMotionWeight[]> {
  if (!isBlendTree2dKind(kind)) return {
    value: null,
    diagnostics: [error("invalid-2d-blend-tree-kind", `Unknown 2D blend-tree algorithm ${String(kind)}.`)],
  };
  if (!Number.isFinite(parameterX) || !Number.isFinite(parameterY)) return {
    value: null,
    diagnostics: [error("invalid-blend-parameter", "2D blend-tree parameters must be finite.")],
  };
  const diagnostics = validateBlendTree2dLayout(kind, children);
  if (hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const weights = kind === "2dFreeformCartesian"
    ? cartesianWeights(children, [parameterX, parameterY])
    : directionalWeights(children, [parameterX, parameterY]);
  return characterRuntimeSuccess(normalizedWeights(children, weights), diagnostics);
}

function isBlendTree2dKind(value: string): value is BlendTree2dKind {
  return value === "2dSimpleDirectional"
    || value === "2dFreeformDirectional"
    || value === "2dFreeformCartesian";
}

export function validateBlendTree2dLayout(
  kind: BlendTree2dKind,
  children: readonly BlendTree2dChild[],
): CharacterRuntimeDiagnostic[] {
  if (children.length === 0) return [error("empty-blend-tree", "A 2D blend tree requires at least one motion.")];
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const ids = new Set<string>();
  for (const child of children) {
    if (!child.motionId || ids.has(child.motionId) || !child.position.every(Number.isFinite)) {
      diagnostics.push(error("invalid-blend-child", "Every 2D blend child needs a unique ID and finite position."));
    }
    ids.add(child.motionId);
  }
  for (let left = 0; left < children.length; left += 1) {
    for (let right = left + 1; right < children.length; right += 1) {
      const first = children[left]!;
      const second = children[right]!;
      if (distanceSquared(first.position, second.position) <= POSITION_EPSILON ** 2) {
        diagnostics.push(error(
          "duplicate-blend-position",
          `2D blend motions ${first.motionId} and ${second.motionId} occupy the same point.`,
        ));
      } else if (kind === "2dSimpleDirectional" && samePositiveDirection(first.position, second.position)) {
        diagnostics.push(error(
          "duplicate-simple-direction",
          `Simple Directional motions ${first.motionId} and ${second.motionId} occupy the same direction.`,
        ));
      }
    }
  }
  if (kind === "2dFreeformDirectional"
    && !children.some((child) => lengthSquared(child.position) <= POSITION_EPSILON ** 2)) {
    diagnostics.push(error(
      "missing-freeform-directional-center",
      "Freeform Directional trees require exactly one center motion at (0, 0).",
    ));
  }
  if (kind === "2dFreeformCartesian" && children.length >= 3 && isCollinear(children)) {
    diagnostics.push({
      code: "collinear-2d-blend-layout",
      severity: "warning",
      message: "Freeform Cartesian points are collinear; blending remains valid but cannot span a 2D area.",
    });
  }
  return diagnostics;
}

function directionalWeights(
  children: readonly BlendTree2dChild[],
  parameter: readonly [number, number],
): Map<string, number> {
  const center = children.find((child) => lengthSquared(child.position) <= POSITION_EPSILON ** 2);
  const directional = children.filter((child) => child !== center);
  if (lengthSquared(parameter) <= POSITION_EPSILON ** 2) {
    if (center) return new Map([[center.motionId, 1]]);
    return inverseDistanceWeights(directional, parameter);
  }
  if (directional.length === 0) return new Map([[center!.motionId, 1]]);
  const groups = directionGroups(directional);
  const angle = positiveAngle(Math.atan2(parameter[1], parameter[0]));
  const branches = angularBranches(groups, angle);
  const radius = Math.hypot(parameter[0], parameter[1]);
  const weights = new Map<string, number>();
  for (const branch of branches) {
    for (const [motionId, radialWeight] of radialWeights(branch.group.children, center, radius)) {
      weights.set(motionId, (weights.get(motionId) ?? 0) + radialWeight * branch.weight);
    }
  }
  return weights;
}

function cartesianWeights(
  children: readonly BlendTree2dChild[],
  parameter: readonly [number, number],
): Map<string, number> {
  const exact = children.find((child) => distanceSquared(child.position, parameter) <= POSITION_EPSILON ** 2);
  if (exact) return new Map([[exact.motionId, 1]]);
  const weights = new Map<string, number>();
  for (const child of children) {
    let weight = 1;
    const offset = subtract(parameter, child.position);
    for (const other of children) {
      if (other === child) continue;
      const band = subtract(other.position, child.position);
      weight = Math.min(weight, 1 - dot(offset, band) / lengthSquared(band));
    }
    weights.set(child.motionId, clamp01(weight));
  }
  const total = sumWeights(weights);
  return total > WEIGHT_EPSILON ? weights : inverseDistanceWeights(children, parameter);
}

type DirectionGroup = Readonly<{
  angle: number;
  children: readonly BlendTree2dChild[];
}>;

function directionGroups(children: readonly BlendTree2dChild[]): DirectionGroup[] {
  const sorted = [...children].sort((left, right) => (
    positiveAngle(Math.atan2(left.position[1], left.position[0]))
      - positiveAngle(Math.atan2(right.position[1], right.position[0]))
    || Math.hypot(...left.position) - Math.hypot(...right.position)
    || left.motionId.localeCompare(right.motionId)
  ));
  const groups: Array<{ angle: number; children: BlendTree2dChild[] }> = [];
  for (const child of sorted) {
    const angle = positiveAngle(Math.atan2(child.position[1], child.position[0]));
    const previous = groups[groups.length - 1];
    if (previous && samePositiveDirection(previous.children[0]!.position, child.position)) {
      previous.children.push(child);
    } else {
      groups.push({ angle, children: [child] });
    }
  }
  groups.forEach((group) => group.children.sort((left, right) => (
    Math.hypot(...left.position) - Math.hypot(...right.position)
    || left.motionId.localeCompare(right.motionId)
  )));
  return groups;
}

function angularBranches(
  groups: readonly DirectionGroup[],
  angle: number,
): readonly Readonly<{ group: DirectionGroup; weight: number }>[] {
  if (groups.length === 1) return [{ group: groups[0]!, weight: 1 }];
  const exact = groups.find((group) => angularDistance(group.angle, angle) <= POSITION_EPSILON);
  if (exact) return [{ group: exact, weight: 1 }];
  const rightIndex = groups.findIndex((group) => group.angle > angle);
  const resolvedRightIndex = rightIndex < 0 ? 0 : rightIndex;
  const right = groups[resolvedRightIndex]!;
  const left = groups[(resolvedRightIndex - 1 + groups.length) % groups.length]!;
  const span = positiveAngle(right.angle - left.angle);
  const rightWeight = span <= POSITION_EPSILON ? 0 : positiveAngle(angle - left.angle) / span;
  return [
    { group: left, weight: 1 - rightWeight },
    { group: right, weight: rightWeight },
  ];
}

function radialWeights(
  children: readonly BlendTree2dChild[],
  center: BlendTree2dChild | undefined,
  radius: number,
): Map<string, number> {
  const first = children[0]!;
  const firstRadius = Math.hypot(...first.position);
  if (radius <= firstRadius) {
    if (!center) return new Map([[first.motionId, 1]]);
    const childWeight = clamp01(radius / firstRadius);
    return new Map([[center.motionId, 1 - childWeight], [first.motionId, childWeight]]);
  }
  for (let index = 1; index < children.length; index += 1) {
    const right = children[index]!;
    const rightRadius = Math.hypot(...right.position);
    if (radius > rightRadius) continue;
    const left = children[index - 1]!;
    const leftRadius = Math.hypot(...left.position);
    const rightWeight = (radius - leftRadius) / (rightRadius - leftRadius);
    return new Map([[left.motionId, 1 - rightWeight], [right.motionId, rightWeight]]);
  }
  return new Map([[children[children.length - 1]!.motionId, 1]]);
}

function inverseDistanceWeights(
  children: readonly BlendTree2dChild[],
  parameter: readonly [number, number],
): Map<string, number> {
  const weights = new Map<string, number>();
  children.forEach((child) => weights.set(
    child.motionId,
    1 / Math.max(POSITION_EPSILON ** 2, distanceSquared(child.position, parameter)),
  ));
  return weights;
}

function normalizedWeights(
  children: readonly BlendTree2dChild[],
  weights: ReadonlyMap<string, number>,
): BlendTreeMotionWeight[] {
  const total = sumWeights(weights);
  if (total <= WEIGHT_EPSILON) return [{ motionId: children[0]!.motionId, weight: 1 }];
  return children.flatMap((child) => {
    const weight = (weights.get(child.motionId) ?? 0) / total;
    return weight > WEIGHT_EPSILON ? [{ motionId: child.motionId, weight }] : [];
  });
}

function isCollinear(children: readonly BlendTree2dChild[]): boolean {
  const origin = children[0]!.position;
  const axis = subtract(children[1]!.position, origin);
  return children.slice(2).every((child) => Math.abs(cross(axis, subtract(child.position, origin))) <= POSITION_EPSILON);
}

function samePositiveDirection(left: readonly [number, number], right: readonly [number, number]): boolean {
  if (lengthSquared(left) <= POSITION_EPSILON ** 2 || lengthSquared(right) <= POSITION_EPSILON ** 2) return false;
  const scale = Math.sqrt(lengthSquared(left) * lengthSquared(right));
  return Math.abs(cross(left, right)) <= POSITION_EPSILON * scale && dot(left, right) > 0;
}

function distanceSquared(left: readonly [number, number], right: readonly [number, number]): number {
  return lengthSquared(subtract(left, right));
}

function subtract(left: readonly [number, number], right: readonly [number, number]): [number, number] {
  return [left[0] - right[0], left[1] - right[1]];
}

function dot(left: readonly [number, number], right: readonly [number, number]): number {
  return left[0] * right[0] + left[1] * right[1];
}

function cross(left: readonly [number, number], right: readonly [number, number]): number {
  return left[0] * right[1] - left[1] * right[0];
}

function lengthSquared(value: readonly [number, number]): number {
  return dot(value, value);
}

function positiveAngle(value: number): number {
  const turn = Math.PI * 2;
  return ((value % turn) + turn) % turn;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(left - right);
  return Math.min(difference, Math.PI * 2 - difference);
}

function sumWeights(weights: ReadonlyMap<string, number>): number {
  let total = 0;
  weights.forEach((weight) => { total += Math.max(0, weight); });
  return total;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function error(code: string, message: string): CharacterRuntimeDiagnostic {
  return { code, severity: "error", message };
}
