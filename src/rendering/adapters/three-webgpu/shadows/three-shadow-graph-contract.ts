import { compileRenderGraph } from "../../../runtime/render-graph-compiler";
import {
  renderPassId,
  renderResourceId,
  type CompiledRenderGraph,
  type RenderGraphDefinition,
  type RenderPassId,
  type RenderResourceId,
} from "../../../runtime/render-graph-definition";
import type {
  ShadowCascadePolicy,
} from "../../../runtime/shadows/shadow-cascade-policy";
import type { ShadowCascadeTier } from "../../../runtime/shadows/shadow-cascade-splits";

export type ThreeShadowResourceDescriptor =
  | Readonly<{
      kind: "input";
      role: "camera" | "dynamic-casters" | "light" | "static-casters";
    }>
  | Readonly<{
      kind: "cascade-depth";
      tier: ShadowCascadeTier;
      width: number;
      height: number;
      lifetime: "history";
      owner: "three-shadow-node";
      sampling: "comparison-depth";
    }>;

export type ThreeShadowPassPayload = Readonly<{
  kind: "directional-shadow-cascade";
  tier: ShadowCascadeTier;
  casterScope: ShadowCascadePolicy["casterScope"];
  mapSize: number;
}>;

export type ThreeShadowGraphContract = Readonly<{
  graph: CompiledRenderGraph<ThreeShadowResourceDescriptor, ThreeShadowPassPayload>;
  passIds: Readonly<Record<ShadowCascadeTier, RenderPassId>>;
  depthResourceIds: Readonly<Record<ShadowCascadeTier, RenderResourceId>>;
}>;

const INPUT_IDS = Object.freeze({
  camera: renderResourceId("shadow-input-camera"),
  dynamicCasters: renderResourceId("shadow-input-dynamic-casters"),
  light: renderResourceId("shadow-input-light"),
  staticCasters: renderResourceId("shadow-input-static-casters"),
});

const PASS_IDS = Object.freeze({
  near: renderPassId("shadow-cascade-0-near-update"),
  mid: renderPassId("shadow-cascade-1-mid-update"),
  far: renderPassId("shadow-cascade-2-far-update"),
});

const DEPTH_IDS = Object.freeze({
  near: renderResourceId("shadow-depth-near"),
  mid: renderResourceId("shadow-depth-mid"),
  far: renderResourceId("shadow-depth-far"),
});

/** Builds the persistent cascade subgraph. History resources are imported and writable. */
export function createThreeShadowGraphContract(
  policies: readonly ShadowCascadePolicy[],
): ThreeShadowGraphContract {
  if (policies.length !== 3) throw new RangeError("Three shadow graphs require three cascade policies.");
  const policyByTier = new Map(policies.map((policy) => [policy.tier, policy]));
  const resources: RenderGraphDefinition<ThreeShadowResourceDescriptor, ThreeShadowPassPayload>["resources"] =
    Object.freeze([
      inputResource(INPUT_IDS.camera, "camera"),
      inputResource(INPUT_IDS.dynamicCasters, "dynamic-casters"),
      inputResource(INPUT_IDS.light, "light"),
      inputResource(INPUT_IDS.staticCasters, "static-casters"),
      ...(["near", "mid", "far"] as const).map((tier) => {
        const policy = requiredPolicy(policyByTier, tier);
        return Object.freeze({
          id: DEPTH_IDS[tier],
          source: "external" as const,
          descriptor: Object.freeze({
            kind: "cascade-depth" as const,
            tier,
            width: policy.mapSize,
            height: policy.mapSize,
            lifetime: "history" as const,
            owner: "three-shadow-node" as const,
            sampling: "comparison-depth" as const,
          }),
        });
      }),
    ]);
  const passes = Object.freeze((["near", "mid", "far"] as const).map((tier) => {
    const policy = requiredPolicy(policyByTier, tier);
    const reads = [INPUT_IDS.camera, INPUT_IDS.light, INPUT_IDS.staticCasters];
    if (policy.casterScope === "static-and-dynamic") reads.push(INPUT_IDS.dynamicCasters);
    return Object.freeze({
      id: PASS_IDS[tier],
      reads: Object.freeze(reads),
      writes: Object.freeze([DEPTH_IDS[tier]]),
      payload: Object.freeze({
        kind: "directional-shadow-cascade" as const,
        tier,
        casterScope: policy.casterScope,
        mapSize: policy.mapSize,
      }),
    });
  }));
  const definition = Object.freeze({
    resources,
    passes,
    outputs: Object.freeze([DEPTH_IDS.near, DEPTH_IDS.mid, DEPTH_IDS.far]),
  });
  const compiled = compileRenderGraph(definition);
  return Object.freeze({
    graph: Object.freeze({
      resources: Object.freeze(compiled.resources),
      passes: Object.freeze(compiled.passes),
      outputs: Object.freeze(compiled.outputs),
      prunedPasses: Object.freeze(compiled.prunedPasses),
    }),
    passIds: PASS_IDS,
    depthResourceIds: DEPTH_IDS,
  });
}

function inputResource(
  id: RenderResourceId,
  role: Extract<ThreeShadowResourceDescriptor, { kind: "input" }>["role"],
) {
  return Object.freeze({
    id,
    source: "external" as const,
    descriptor: Object.freeze({ kind: "input" as const, role }),
  });
}

function requiredPolicy(
  policies: ReadonlyMap<ShadowCascadeTier, ShadowCascadePolicy>,
  tier: ShadowCascadeTier,
): ShadowCascadePolicy {
  const policy = policies.get(tier);
  if (!policy) throw new Error(`Missing '${tier}' shadow cascade policy.`);
  return policy;
}
