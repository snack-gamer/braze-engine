import {
  renderPassId,
  renderResourceId,
  type RenderGraphDefinition,
  type RenderGraphPass,
  type RenderGraphResource,
  type RenderResourceId,
} from "./render-graph-definition";
import {
  addCloudContribution,
  addGodrayContribution,
  type ViewportPassAppender,
  type ViewportResourceAppender,
} from "./viewport-render-contributions";

export type ViewportRenderFeatures = Readonly<{
  ambientOcclusion: boolean;
  bloom: boolean;
  clouds: boolean;
  godrays: boolean;
  overlays: boolean;
  /** The pinned particle bridge records inside base-scene; it is not a graph pass. */
  particleBasePassCompatibility: boolean;
  screenSpaceReflections: boolean;
  shadows: boolean;
}>;

export type ViewportResourceDescriptor = Readonly<{
  extent: "full" | "half" | "quarter" | "shadow";
  format: "color" | "depth" | "mask" | "material" | "normal" | "scalar";
  lifetime: "external" | "history" | "transient";
}>;

export type ViewportRenderPassPayload = Readonly<{
  kind:
    | "ambient-occlusion"
    | "base-scene"
    | "bloom"
    | "clouds"
    | "composite"
    | "composite-present"
    | "godrays"
    | "godrays-source-mask"
    | "overlays"
    | "present"
    | "screen-space-reflections"
    | "shadows";
  /** Draws injected inside Three's base pass until a public pass API exists. */
  basePassCompatibility?: readonly "particles"[];
}>;

type Graph = RenderGraphDefinition<ViewportResourceDescriptor, ViewportRenderPassPayload>;

/** Builds a logical dependency graph whose semantic resources follow live consumers. */
export function buildViewportRenderGraph(features: ViewportRenderFeatures): Graph {
  const resources: RenderGraphResource<ViewportResourceDescriptor>[] = [];
  const passes: RenderGraphPass<ViewportRenderPassPayload>[] = [];
  const addResource = resourceAdder(resources);
  const addPass = passAdder(passes);

  const world = addResource("world", "full", "color", "external");
  const view = addResource("view", "full", "color", "external");
  const surface = addResource("presentation-surface", "full", "color", "external");
  const sceneReads = [world, view];
  const basePassCompatibility = features.particleBasePassCompatibility
    ? (["particles"] as const)
    : undefined;

  if (features.shadows) {
    const shadowAtlas = addResource("shadow-atlas", "shadow", "depth", "history");
    addPass("shadows", "shadows", [world, view], [shadowAtlas]);
    sceneReads.push(shadowAtlas);
  }

  const needsColorChain = features.ambientOcclusion
    || features.bloom
    || features.clouds
    || features.godrays
    || features.overlays
    || features.screenSpaceReflections;
  if (!needsColorChain) {
    addPass("base-scene", "base-scene", sceneReads, [surface], true, basePassCompatibility);
    return { resources, passes, outputs: [surface] };
  }

  const sceneColor = addResource("scene-color", "full", "color", "transient");
  const sceneDepth = addResource("scene-depth", "full", "depth", "transient");
  const needsNormals = features.screenSpaceReflections;
  const sceneWrites = [sceneColor, sceneDepth];
  if (needsNormals) sceneWrites.push(addResource("scene-normal", "full", "normal", "transient"));
  if (features.screenSpaceReflections) {
    sceneWrites.push(addResource("scene-metalness", "full", "material", "transient"));
    sceneWrites.push(addResource("scene-roughness", "full", "material", "transient"));
  }
  addPass("base-scene", "base-scene", sceneReads, sceneWrites, false, basePassCompatibility);

  let currentColor = sceneColor;
  const contributions: RenderResourceId[] = [];
  if (features.clouds) {
    contributions.push(addCloudContribution({ addResource, addPass, view }));
  }
  if (features.ambientOcclusion) {
    const ao = addResource("ambient-occlusion", "half", "mask", "transient");
    // GTAO reconstructs view normals from depth when SSR has not requested an
    // MRT normal attachment. AO alone must not force an extra full-size target.
    const aoReads = features.screenSpaceReflections
      ? [sceneDepth, id("scene-normal"), view]
      : [sceneDepth, view];
    addPass("ambient-occlusion", "ambient-occlusion", aoReads, [ao]);
    contributions.push(ao);
  }
  if (features.screenSpaceReflections) {
    const reflections = addResource("screen-space-reflections", "half", "color", "transient");
    addPass("screen-space-reflections", "screen-space-reflections", [
      currentColor,
      sceneDepth,
      id("scene-normal"),
      id("scene-metalness"),
      id("scene-roughness"),
      view,
    ], [reflections]);
    contributions.push(reflections);
  }
  if (features.godrays) {
    contributions.push(addGodrayContribution({
      addResource, addPass, input: currentColor, depth: sceneDepth, view,
    }));
  }
  if (features.bloom) {
    const bloom = addResource("bloom", "half", "color", "transient");
    addPass("bloom", "bloom", [currentColor], [bloom]);
    contributions.push(bloom);
  }

  if (contributions.length > 0 && !features.overlays) {
    // Three fuses contribution composition and CanvasTarget presentation into
    // one fullscreen execution. Keep that semantic boundary explicit here.
    addPass("composite-present", "composite-present", [
      currentColor,
      sceneDepth,
      ...contributions,
    ], [surface], true);
    return { resources, passes, outputs: [surface] };
  }
  if (contributions.length > 0) {
    const composited = addResource("composited-color", "full", "color", "transient");
    addPass("composite", "composite", [currentColor, sceneDepth, ...contributions], [composited]);
    currentColor = composited;
  }
  if (features.overlays) {
    const overlayColor = addResource("color-after-overlays", "full", "color", "transient");
    addPass("overlays", "overlays", [currentColor, sceneDepth, view], [overlayColor]);
    currentColor = overlayColor;
  }

  addPass("present", "present", [currentColor], [surface], true);
  return { resources, passes, outputs: [surface] };
}

function resourceAdder(
  resources: RenderGraphResource<ViewportResourceDescriptor>[],
): ViewportResourceAppender {
  return (
    name: string,
    extent: ViewportResourceDescriptor["extent"],
    format: ViewportResourceDescriptor["format"],
    lifetime: ViewportResourceDescriptor["lifetime"],
  ): RenderResourceId => {
    const resourceId = id(name);
    resources.push({ id: resourceId, source: lifetime === "external" ? "external" : "graph", descriptor: {
      extent,
      format,
      lifetime,
    } });
    return resourceId;
  };
}

function passAdder(
  passes: RenderGraphPass<ViewportRenderPassPayload>[],
): ViewportPassAppender {
  return (
    name: string,
    kind: ViewportRenderPassPayload["kind"],
    reads: readonly RenderResourceId[],
    writes: readonly RenderResourceId[],
    sideEffect = false,
    basePassCompatibility?: ViewportRenderPassPayload["basePassCompatibility"],
  ): void => {
    passes.push({
      id: renderPassId(name),
      reads,
      writes,
      sideEffect,
      payload: { kind, ...(basePassCompatibility ? { basePassCompatibility } : {}) },
    });
  };
}

function id(name: string): RenderResourceId {
  return renderResourceId(name);
}
