import type { CompiledRenderGraph } from "../render-graph-definition";
import type {
  ViewportRenderPassPayload,
  ViewportResourceDescriptor,
} from "../viewport-render-graph";

/** Canonical, lossless identity for the compiled executable topology. */
export function viewportTopologySignature(
  graph: CompiledRenderGraph<ViewportResourceDescriptor, ViewportRenderPassPayload>,
): string {
  const topology = {
    resources: graph.resources.map(({ id, source, descriptor }) => [
      id,
      source,
      descriptor?.extent ?? null,
      descriptor?.format ?? null,
      descriptor?.lifetime ?? null,
    ]),
    passes: graph.passes.map(({ id, reads, writes, sideEffect, payload }) => [
      id,
      [...reads],
      [...writes],
      sideEffect === true,
      payload?.kind ?? null,
      payload?.basePassCompatibility ?? [],
    ]),
    outputs: [...graph.outputs],
  };
  return `viewport-topology:v2:${JSON.stringify(topology)}`;
}
