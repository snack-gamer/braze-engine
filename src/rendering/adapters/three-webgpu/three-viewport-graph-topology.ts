import type { ViewportRenderFeatures } from "../../runtime/viewport-render-graph";
import { createViewportRenderGraphPackageCache } from "../../runtime/viewport-graph/viewport-graph-cache";
import type { ViewportRenderGraphPackage } from "../../runtime/viewport-graph/viewport-graph-package";
import type { ActiveViewportPostEffects } from "./viewport-post-effect-state";
import {
  createThreeR184ViewportPhysicalManifest,
  type ThreeR184ViewportPhysicalManifest,
} from "./three-r184-viewport-physical-manifest";
import {
  compileThreeViewportExecutionPlan,
  type ThreeViewportExecutionPlan,
} from "./three-viewport-execution-plan";

const packages = createViewportRenderGraphPackageCache();

export type ThreeViewportGraphTopology = Readonly<{
  graphPackage: ViewportRenderGraphPackage;
  executionPlan: ThreeViewportExecutionPlan;
  physicalManifest: ThreeR184ViewportPhysicalManifest;
  /** Identity of the owned scene/post nodes, excluding separately owned shadows. */
  postGraphKey: string;
  postTopologyKey: string;
  postProcessingActive: boolean;
}>;

/** Maps live Three features onto the engine's compiled, immutable viewport topology. */
export function createThreeViewportGraphTopology(
  effects: ActiveViewportPostEffects,
  shadowsActive: boolean,
  depthFormat: "depth24plus" | "depth32float",
): ThreeViewportGraphTopology {
  const features: ViewportRenderFeatures = {
    ambientOcclusion: Boolean(effects.ambientOcclusion),
    bloom: Boolean(effects.bloom),
    clouds: effects.atmosphereTopology.clouds,
    godrays: effects.atmosphereTopology.godrays,
    // Overlays remain part of Three's base pass but have no compatibility hook.
    overlays: false,
    // The installed r184 bridge is explicitly represented on base-scene.
    particleBasePassCompatibility: true,
    screenSpaceReflections: Boolean(effects.screenSpaceReflections),
    shadows: shadowsActive,
  };
  const graphPackage = packages.get(features);
  const executionPlan = compileThreeViewportExecutionPlan(graphPackage);
  const physicalManifest = createThreeR184ViewportPhysicalManifest(
    executionPlan,
    { depthFormat },
  );
  return Object.freeze({
    graphPackage,
    executionPlan,
    physicalManifest,
    postGraphKey: JSON.stringify([
      // Independent pass ordering can change when a shadow dependency is inserted.
      // The post adapter constructs its own fixed node graph from these features.
      executionPlan.logicalPassKinds.filter((kind) => kind !== "shadows").sort(),
      executionPlan.scenePassMode,
      executionPlan.ambientOcclusion?.normalSource ?? null,
      executionPlan.particleBasePassCompatibilityActive,
      executionPlan.terminal,
      depthFormat,
      effects.topologyKey,
    ]),
    // SSR quality changes its generated node topology despite sharing the
    // same boolean render-graph shape, so retain the baked post key as a suffix.
    postTopologyKey: `${graphPackage.topologySignature}|post:${effects.topologyKey}`,
    postProcessingActive: executionPlan.postProcessingActive,
  });
}
