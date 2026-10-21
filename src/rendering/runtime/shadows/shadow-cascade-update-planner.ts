import {
  createShadowCascadePolicies,
  snapShadowCameraCell,
  type ShadowCameraCell,
  type ShadowCascadePolicy,
  type ShadowWorldPosition,
} from "./shadow-cascade-policy";
import {
  calculateShadowCascadeSplits,
  type ShadowCameraRange,
  type ShadowCascadeTier,
} from "./shadow-cascade-splits";
import type { ShadowGenerationSnapshot } from "./shadow-generations";

export type ShadowCascadeUpdateReason =
  | "initial"
  | "camera-generation"
  | "camera-range"
  | "camera-pose-generation"
  | "snapped-camera-cell"
  | "light-generation"
  | "extent-generation"
  | "static-caster-generation"
  | "dynamic-caster-generation";

export type ShadowCascadeUpdateDecision = Readonly<{
  tier: ShadowCascadeTier;
  policy: ShadowCascadePolicy;
  cameraCell: ShadowCameraCell | null;
  update: boolean;
  reasons: readonly ShadowCascadeUpdateReason[];
}>;

export type ShadowCascadeUpdateCounters = Readonly<{
  cascadesEvaluated: number;
  cascadesUpdated: number;
  cascadesReused: number;
  reasons: Readonly<Record<ShadowCascadeUpdateReason, number>>;
}>;

export type ShadowCascadeCumulativeCounters = ShadowCascadeUpdateCounters & Readonly<{
  plans: number;
}>;

export type ShadowCascadeUpdatePlan = Readonly<{
  cascades: readonly ShadowCascadeUpdateDecision[];
  counters: ShadowCascadeUpdateCounters;
  totals: ShadowCascadeCumulativeCounters;
}>;

export type ShadowCascadeUpdateInput = Readonly<{
  camera: ShadowCameraRange;
  cameraPosition: ShadowWorldPosition;
  generations: ShadowGenerationSnapshot;
}>;

export type ShadowCascadeUpdatePlanner = Readonly<{
  plan: (input: ShadowCascadeUpdateInput) => ShadowCascadeUpdatePlan;
  reset: () => void;
}>;

type CascadeState = Readonly<{
  cameraCell: ShadowCameraCell | null;
}>;

type PlannerState = Readonly<{
  generations: ShadowGenerationSnapshot;
  cascades: readonly CascadeState[];
}>;

const REASON_ORDER: readonly ShadowCascadeUpdateReason[] = Object.freeze([
  "initial",
  "camera-generation",
  "camera-range",
  "camera-pose-generation",
  "snapped-camera-cell",
  "light-generation",
  "extent-generation",
  "static-caster-generation",
  "dynamic-caster-generation",
]);

/** Stateful only by generation/cell snapshots; callers explicitly request each plan. */
export function createShadowCascadeUpdatePlanner(
  practicalSplitLambda = 0.65,
): ShadowCascadeUpdatePlanner {
  let previous: PlannerState | null = null;
  let policies: readonly ShadowCascadePolicy[] | null = null;
  let policyNear = Number.NaN;
  let policyFar = Number.NaN;
  let policyMaxDistance = Number.NaN;
  let effectiveNear = Number.NaN;
  let effectiveFar = Number.NaN;
  let totals = mutableCounters();
  let plans = 0;

  return Object.freeze({
    plan: (input: ShadowCascadeUpdateInput) => {
      const nextEffectiveFar = Math.min(input.camera.far, input.camera.maxShadowDistance);
      const rangeChanged = input.camera.near !== effectiveNear || nextEffectiveFar !== effectiveFar;
      if (
        policies === null
        || input.camera.near !== policyNear
        || input.camera.far !== policyFar
        || input.camera.maxShadowDistance !== policyMaxDistance
      ) {
        policies = createShadowCascadePolicies(
          calculateShadowCascadeSplits(input.camera, practicalSplitLambda),
        );
        policyNear = input.camera.near;
        policyFar = input.camera.far;
        policyMaxDistance = input.camera.maxShadowDistance;
        effectiveNear = input.camera.near;
        effectiveFar = nextEffectiveFar;
      }
      const states = policies.map((policy) => stateFor(policy, input.cameraPosition));
      const decisions = policies.map((policy, index) => {
        const reasons = reasonsFor(
          policy,
          states[index],
          input.generations,
          previous?.cascades[index],
          previous?.generations,
          rangeChanged,
        );
        return Object.freeze({
          tier: policy.tier,
          policy,
          cameraCell: states[index].cameraCell,
          update: reasons.length > 0,
          reasons,
        });
      });
      const counters = countersFor(decisions);
      plans += 1;
      accumulate(totals, counters);
      previous = Object.freeze({
        generations: Object.freeze({ ...input.generations }),
        cascades: Object.freeze(states),
      });
      return Object.freeze({
        cascades: Object.freeze(decisions),
        counters,
        totals: freezeTotals(plans, totals),
      });
    },
    reset: () => {
      previous = null;
      plans = 0;
      totals = mutableCounters();
    },
  });
}

function stateFor(policy: ShadowCascadePolicy, position: ShadowWorldPosition): CascadeState {
  return Object.freeze({
    cameraCell: policy.cameraCellWorldSize === null
      ? null
      : snapShadowCameraCell(position, policy.cameraCellWorldSize),
  });
}

function reasonsFor(
  policy: ShadowCascadePolicy,
  current: CascadeState,
  generations: ShadowGenerationSnapshot,
  previous: CascadeState | undefined,
  previousGenerations: ShadowGenerationSnapshot | undefined,
  rangeChanged: boolean,
): readonly ShadowCascadeUpdateReason[] {
  if (!previous || !previousGenerations) return Object.freeze(["initial"]);
  const reasons: ShadowCascadeUpdateReason[] = [];
  if (generations.camera !== previousGenerations.camera) reasons.push("camera-generation");
  else if (rangeChanged) reasons.push("camera-range");
  if (policy.cameraTracking === "pose-generation") {
    if (generations.cameraPose !== previousGenerations.cameraPose) {
      reasons.push("camera-pose-generation");
    }
  } else if (!cellsEqual(current.cameraCell, previous.cameraCell)) {
    reasons.push("snapped-camera-cell");
  }
  if (generations.light !== previousGenerations.light) reasons.push("light-generation");
  if (generations.extent !== previousGenerations.extent) reasons.push("extent-generation");
  if (generations.staticCasters !== previousGenerations.staticCasters) {
    reasons.push("static-caster-generation");
  }
  if (
    policy.casterScope === "static-and-dynamic"
    && generations.dynamicCasters !== previousGenerations.dynamicCasters
  ) {
    reasons.push("dynamic-caster-generation");
  }
  return Object.freeze(reasons);
}

function cellsEqual(left: ShadowCameraCell | null, right: ShadowCameraCell | null): boolean {
  return left === right || (
    left !== null && right !== null
    && left.x === right.x && left.y === right.y && left.z === right.z
  );
}

type MutableCounters = {
  cascadesEvaluated: number;
  cascadesUpdated: number;
  cascadesReused: number;
  reasons: Record<ShadowCascadeUpdateReason, number>;
};

function countersFor(decisions: readonly ShadowCascadeUpdateDecision[]): ShadowCascadeUpdateCounters {
  const counters = mutableCounters();
  counters.cascadesEvaluated = decisions.length;
  for (const decision of decisions) {
    if (decision.update) counters.cascadesUpdated += 1;
    else counters.cascadesReused += 1;
    decision.reasons.forEach((reason) => { counters.reasons[reason] += 1; });
  }
  return freezeCounters(counters);
}

function mutableCounters(): MutableCounters {
  return {
    cascadesEvaluated: 0,
    cascadesUpdated: 0,
    cascadesReused: 0,
    reasons: Object.fromEntries(REASON_ORDER.map((reason) => [reason, 0])) as MutableCounters["reasons"],
  };
}

function accumulate(total: MutableCounters, next: ShadowCascadeUpdateCounters): void {
  total.cascadesEvaluated += next.cascadesEvaluated;
  total.cascadesUpdated += next.cascadesUpdated;
  total.cascadesReused += next.cascadesReused;
  REASON_ORDER.forEach((reason) => { total.reasons[reason] += next.reasons[reason]; });
}

function freezeCounters(counters: MutableCounters): ShadowCascadeUpdateCounters {
  return Object.freeze({ ...counters, reasons: Object.freeze({ ...counters.reasons }) });
}

function freezeTotals(plans: number, counters: MutableCounters): ShadowCascadeCumulativeCounters {
  return Object.freeze({ plans, ...freezeCounters(counters) });
}
