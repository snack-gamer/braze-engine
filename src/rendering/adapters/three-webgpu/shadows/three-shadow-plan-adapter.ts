import type { RenderPassId, RenderResourceId } from "../../../runtime/render-graph-definition";
import type { ShadowCameraCell } from "../../../runtime/shadows/shadow-cascade-policy";
import {
  createShadowCascadeUpdatePlanner,
  type ShadowCascadeUpdateInput,
  type ShadowCascadeUpdatePlan,
  type ShadowCascadeUpdateReason,
} from "../../../runtime/shadows/shadow-cascade-update-planner";
import type { ShadowCascadeTier } from "../../../runtime/shadows/shadow-cascade-splits";
import {
  createThreeShadowGraphContract,
  type ThreeShadowGraphContract,
} from "./three-shadow-graph-contract";

export type ThreeShadowCascadeUpdateCommand = Readonly<{
  tier: ShadowCascadeTier;
  passId: RenderPassId;
  depthResourceId: RenderResourceId;
  update: boolean;
  reasons: readonly ShadowCascadeUpdateReason[];
  mapSize: number;
  casterScope: "static-and-dynamic" | "static-only";
  cameraCell: ShadowCameraCell | null;
}>;

export type ThreeShadowFramePlan = Readonly<{
  graphContract: ThreeShadowGraphContract;
  runtimePlan: ShadowCascadeUpdatePlan;
  commands: readonly ThreeShadowCascadeUpdateCommand[];
  normalizedBreaks: readonly [number, number, 1];
  shadowFar: number;
  updateFrustums: boolean;
}>;

export type ThreeShadowPlanAdapter = Readonly<{
  plan: (input: ShadowCascadeUpdateInput) => ThreeShadowFramePlan;
  reset: () => void;
}>;

/** Projects the platform-neutral policy into Three-facing graph and update identities. */
export function createThreeShadowPlanAdapter(practicalSplitLambda = 0.65): ThreeShadowPlanAdapter {
  const planner = createShadowCascadeUpdatePlanner(practicalSplitLambda);
  let graphContract: ThreeShadowGraphContract | null = null;
  return Object.freeze({
    plan: (input: ShadowCascadeUpdateInput) => {
      const runtimePlan = planner.plan(input);
      graphContract ??= createThreeShadowGraphContract(
        runtimePlan.cascades.map(({ policy }) => policy),
      );
      const commands = Object.freeze(runtimePlan.cascades.map((decision) => Object.freeze({
        tier: decision.tier,
        passId: graphContract!.passIds[decision.tier],
        depthResourceId: graphContract!.depthResourceIds[decision.tier],
        update: decision.update,
        reasons: decision.reasons,
        mapSize: decision.policy.mapSize,
        casterScope: decision.policy.casterScope,
        cameraCell: decision.cameraCell,
      })));
      const shadowFar = runtimePlan.cascades[2].policy.split.far;
      const normalizedBreaks = Object.freeze([
        runtimePlan.cascades[0].policy.split.far / shadowFar,
        runtimePlan.cascades[1].policy.split.far / shadowFar,
        1,
      ]) as readonly [number, number, 1];
      return Object.freeze({
        graphContract,
        runtimePlan,
        commands,
        normalizedBreaks,
        shadowFar,
        updateFrustums: commands.some(({ reasons }) => reasons.some(isFrustumReason)),
      });
    },
    reset: () => planner.reset(),
  });
}

function isFrustumReason(reason: ShadowCascadeUpdateReason): boolean {
  return reason === "initial" || reason === "camera-generation" || reason === "camera-range";
}
