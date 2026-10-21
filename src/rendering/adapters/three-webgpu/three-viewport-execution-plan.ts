import { compileRenderGraph } from "../../runtime/render-graph-compiler";
import type { RenderGraphPass } from "../../runtime/render-graph-definition";
import {
  buildViewportRenderGraph,
  type ViewportRenderFeatures,
  type ViewportRenderPassPayload,
} from "../../runtime/viewport-render-graph";
import type { ViewportRenderGraphPackage } from "../../runtime/viewport-graph/viewport-graph-package";
import { viewportTopologySignature } from "../../runtime/viewport-graph/viewport-topology-signature";

export type ThreeViewportAoNormalSource = "reconstructed-from-depth" | "scene-normal";

export type ThreeViewportExecutionPlan = Readonly<{
  logicalTopologySignature: string;
  logicalPassKinds: readonly ViewportRenderPassPayload["kind"][];
  shadowsActive: boolean;
  particleBasePassCompatibilityActive: boolean;
  scenePassMode: "direct-to-surface" | "offscreen-color-depth" | "offscreen-material-mrt";
  ambientOcclusion: null | Readonly<{ normalSource: ThreeViewportAoNormalSource }>;
  bloomActive: boolean;
  cloudsActive: boolean;
  godraysActive: boolean;
  screenSpaceReflectionsActive: boolean;
  postProcessingActive: boolean;
  terminal: "base-scene-direct" | "composite-present";
}>;

export type ThreeViewportExecutionPlanErrorCode =
  | "feature-pass-mismatch"
  | "invalid-godrays-chain"
  | "invalid-terminal"
  | "missing-base-scene"
  | "noncanonical-topology"
  | "signature-mismatch"
  | "unsupported-pass";

export class ThreeViewportExecutionPlanError extends Error {
  constructor(
    readonly code: ThreeViewportExecutionPlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ThreeViewportExecutionPlanError";
  }
}

const planCache = new WeakMap<ViewportRenderGraphPackage, ThreeViewportExecutionPlan>();

/**
 * Adapts the compiled logical graph to the exact topology supported by Three r184.
 * Package feature flags are checked for drift, but never select physical branches.
 */
export function compileThreeViewportExecutionPlan(
  graphPackage: ViewportRenderGraphPackage,
): ThreeViewportExecutionPlan {
  const cached = planCache.get(graphPackage);
  if (cached) return cached;

  const actualSignature = viewportTopologySignature(graphPackage.graph);
  if (actualSignature !== graphPackage.topologySignature) {
    fail("signature-mismatch", "Viewport graph package signature does not describe its compiled graph.");
  }

  const passes = graphPackage.graph.passes;
  const passKinds = passes.map((pass) => readSupportedKind(pass));
  const baseScene = passes.find((pass) => pass.payload?.kind === "base-scene");
  if (!baseScene) fail("missing-base-scene", "Three viewport execution requires one base-scene pass.");

  const particles = readParticleCompatibility(baseScene);
  const godraysSource = passKinds.includes("godrays-source-mask");
  const godraysResult = passKinds.includes("godrays");
  if (godraysSource !== godraysResult) {
    fail("invalid-godrays-chain", "Godrays require both source-mask and radial-result passes.");
  }

  const derivedFeatures: ViewportRenderFeatures = Object.freeze({
    ambientOcclusion: passKinds.includes("ambient-occlusion"),
    bloom: passKinds.includes("bloom"),
    clouds: passKinds.includes("clouds"),
    godrays: godraysSource,
    overlays: passKinds.includes("overlays"),
    particleBasePassCompatibility: particles,
    screenSpaceReflections: passKinds.includes("screen-space-reflections"),
    shadows: passKinds.includes("shadows"),
  });
  requireFeatureAgreement(graphPackage.features, derivedFeatures);

  const postProcessingActive = hasPostProcessing(derivedFeatures);
  requireTerminal(passKinds, postProcessingActive);
  requireCanonicalTopology(actualSignature, derivedFeatures);

  const ambientOcclusionPass = passes.find(
    (pass) => pass.payload?.kind === "ambient-occlusion",
  );
  const ambientOcclusion = ambientOcclusionPass
    ? Object.freeze({
        normalSource: ambientOcclusionPass.reads.some((resource) => resource === "scene-normal")
          ? "scene-normal" as const
          : "reconstructed-from-depth" as const,
      })
    : null;
  const plan = Object.freeze({
    logicalTopologySignature: actualSignature,
    logicalPassKinds: Object.freeze(passKinds),
    shadowsActive: derivedFeatures.shadows,
    particleBasePassCompatibilityActive: particles,
    scenePassMode: !postProcessingActive
      ? "direct-to-surface" as const
      : derivedFeatures.screenSpaceReflections
        ? "offscreen-material-mrt" as const
        : "offscreen-color-depth" as const,
    ambientOcclusion,
    bloomActive: derivedFeatures.bloom,
    cloudsActive: derivedFeatures.clouds,
    godraysActive: derivedFeatures.godrays,
    screenSpaceReflectionsActive: derivedFeatures.screenSpaceReflections,
    postProcessingActive,
    terminal: postProcessingActive ? "composite-present" as const : "base-scene-direct" as const,
  });
  if (isImmutablePackage(graphPackage)) planCache.set(graphPackage, plan);
  return plan;
}

function readSupportedKind(
  pass: RenderGraphPass<ViewportRenderPassPayload>,
): ViewportRenderPassPayload["kind"] {
  const kind = pass.payload?.kind;
  if (kind === "composite" || kind === "overlays" || kind === "present") {
    fail("unsupported-pass", `Three r184 has no viewport execution binding for '${kind}'.`);
  }
  if (!kind || !SUPPORTED_KINDS.has(kind)) {
    fail("unsupported-pass", `Three r184 cannot execute viewport pass '${String(kind)}'.`);
  }
  return kind;
}

function readParticleCompatibility(pass: RenderGraphPass<ViewportRenderPassPayload>): boolean {
  const compatibility = pass.payload?.basePassCompatibility;
  if (compatibility === undefined) return false;
  if (compatibility.length === 1 && compatibility[0] === "particles") return true;
  fail("noncanonical-topology", "Base-scene compatibility must be exactly the pinned particle bridge.");
}

function requireFeatureAgreement(
  declared: ViewportRenderFeatures,
  derived: ViewportRenderFeatures,
): void {
  for (const feature of FEATURE_KEYS) {
    if (declared[feature] !== derived[feature]) {
      fail(
        "feature-pass-mismatch",
        `Viewport feature '${feature}' disagrees with the compiled pass topology.`,
      );
    }
  }
}

function requireTerminal(
  passKinds: readonly ViewportRenderPassPayload["kind"][],
  postProcessingActive: boolean,
): void {
  const expected = postProcessingActive ? "composite-present" : "base-scene";
  const terminal = passKinds[passKinds.length - 1];
  if (terminal !== expected) {
    fail("invalid-terminal", `Three viewport topology must terminate with '${expected}', received '${terminal}'.`);
  }
}

function requireCanonicalTopology(
  actualSignature: string,
  features: ViewportRenderFeatures,
): void {
  const expectedGraph = compileRenderGraph(buildViewportRenderGraph(features));
  if (viewportTopologySignature(expectedGraph) !== actualSignature) {
    fail(
      "noncanonical-topology",
      "Compiled viewport pass order, resources, or payloads drifted from the Three r184 contract.",
    );
  }
}

function hasPostProcessing(features: ViewportRenderFeatures): boolean {
  return features.ambientOcclusion || features.bloom || features.clouds || features.godrays
    || features.overlays || features.screenSpaceReflections;
}

function isImmutablePackage(graphPackage: ViewportRenderGraphPackage): boolean {
  return Object.isFrozen(graphPackage)
    && Object.isFrozen(graphPackage.graph)
    && Object.isFrozen(graphPackage.graph.passes)
    && Object.isFrozen(graphPackage.graph.resources);
}

function fail(code: ThreeViewportExecutionPlanErrorCode, message: string): never {
  throw new ThreeViewportExecutionPlanError(code, message);
}

const FEATURE_KEYS = [
  "ambientOcclusion",
  "bloom",
  "clouds",
  "godrays",
  "overlays",
  "particleBasePassCompatibility",
  "screenSpaceReflections",
  "shadows",
] as const satisfies readonly (keyof ViewportRenderFeatures)[];

const SUPPORTED_KINDS = new Set<ViewportRenderPassPayload["kind"]>([
  "ambient-occlusion",
  "base-scene",
  "bloom",
  "clouds",
  "composite-present",
  "godrays",
  "godrays-source-mask",
  "screen-space-reflections",
  "shadows",
]);
