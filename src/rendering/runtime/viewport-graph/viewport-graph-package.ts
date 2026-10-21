import { compileRenderGraph } from "../render-graph-compiler";
import type {
  CompiledRenderGraph,
  RenderGraphPass,
  RenderGraphResource,
} from "../render-graph-definition";
import {
  analyzeRenderResourceLifetimes,
  type RenderResourceLifetime,
} from "../render-resource-lifetimes";
import {
  planTransientResourceAllocations,
  type TransientResourceAllocationPlan,
} from "../transient-resource-allocation";
import {
  buildViewportRenderGraph,
  type ViewportRenderFeatures,
  type ViewportRenderPassPayload,
  type ViewportResourceDescriptor,
} from "../viewport-render-graph";
import { normalizeViewportRenderFeatures } from "./viewport-feature-set";
import {
  createViewportGraphDiagnostics,
  type ViewportGraphDiagnostics,
} from "./viewport-graph-diagnostics";
import {
  createViewportByteEstimateInputs,
  type ViewportByteEstimateInputs,
} from "./viewport-resource-estimate-inputs";
import { viewportTopologySignature } from "./viewport-topology-signature";

type CompiledViewportGraph = CompiledRenderGraph<
  ViewportResourceDescriptor,
  ViewportRenderPassPayload
>;

export type ViewportRenderGraphPackage = Readonly<{
  features: ViewportRenderFeatures;
  graph: CompiledViewportGraph;
  lifetimes: readonly RenderResourceLifetime<ViewportResourceDescriptor>[];
  /** Theoretical descriptor-compatible aliases; Three does not allocate from this plan. */
  logicalAliasPlan: TransientResourceAllocationPlan<ViewportResourceDescriptor>;
  topologySignature: string;
  logicalByteEstimateInputs: ViewportByteEstimateInputs;
  diagnostics: ViewportGraphDiagnostics;
}>;

/** Compiles one self-contained immutable package for a normalized feature topology. */
export function compileViewportRenderGraphPackage(
  requestedFeatures: ViewportRenderFeatures,
): ViewportRenderGraphPackage {
  const features = normalizeViewportRenderFeatures(requestedFeatures);
  const graph = freezeGraph(compileRenderGraph(buildViewportRenderGraph(features)));
  const lifetimes = Object.freeze(analyzeRenderResourceLifetimes(graph)
    .map((lifetime) => Object.freeze({ ...lifetime })));
  const transientLifetimes = lifetimes
    .filter(({ resource }) => resource.descriptor?.lifetime === "transient");
  const logicalAliasPlan = planTransientResourceAllocations(
    transientLifetimes,
    descriptorKey,
  );
  return Object.freeze({
    features,
    graph,
    lifetimes,
    logicalAliasPlan,
    topologySignature: viewportTopologySignature(graph),
    logicalByteEstimateInputs: createViewportByteEstimateInputs(graph, logicalAliasPlan),
    diagnostics: createViewportGraphDiagnostics(graph, logicalAliasPlan),
  });
}

function freezeGraph(graph: CompiledViewportGraph): CompiledViewportGraph {
  const resources = Object.freeze(graph.resources.map((resource) => Object.freeze({
    ...resource,
    descriptor: resource.descriptor
      ? Object.freeze({ ...resource.descriptor })
      : undefined,
  }) satisfies RenderGraphResource<ViewportResourceDescriptor>));
  const passes = Object.freeze(graph.passes.map((pass) => Object.freeze({
    ...pass,
    reads: Object.freeze([...pass.reads]),
    writes: Object.freeze([...pass.writes]),
    payload: pass.payload ? Object.freeze({
      ...pass.payload,
      ...(pass.payload.basePassCompatibility
        ? { basePassCompatibility: Object.freeze([...pass.payload.basePassCompatibility]) }
        : {}),
    }) : undefined,
  }) satisfies RenderGraphPass<ViewportRenderPassPayload>));
  return Object.freeze({
    resources,
    passes,
    outputs: Object.freeze([...graph.outputs]),
    prunedPasses: Object.freeze([...graph.prunedPasses]),
  });
}

function descriptorKey(descriptor: ViewportResourceDescriptor): string {
  return `${descriptor.extent}:${descriptor.format}:${descriptor.lifetime}`;
}
