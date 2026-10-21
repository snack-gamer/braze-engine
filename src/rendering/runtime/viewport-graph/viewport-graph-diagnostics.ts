import type {
  CompiledRenderGraph,
  RenderPassId,
  RenderResourceId,
} from "../render-graph-definition";
import type { TransientResourceAllocationPlan } from "../transient-resource-allocation";
import type {
  ViewportRenderPassPayload,
  ViewportResourceDescriptor,
} from "../viewport-render-graph";

export type ViewportGraphDiagnostics = Readonly<{
  livePasses: readonly RenderPassId[];
  prunedPasses: readonly RenderPassId[];
  logicalTransientCount: number;
  logicalAliasSlotCount: number;
  externalResources: readonly RenderResourceId[];
  historyResources: readonly RenderResourceId[];
  lines: readonly string[];
}>;

/** Creates stable machine-readable fields plus concise operator-facing lines. */
export function createViewportGraphDiagnostics(
  graph: CompiledRenderGraph<ViewportResourceDescriptor, ViewportRenderPassPayload>,
  allocations: TransientResourceAllocationPlan<ViewportResourceDescriptor>,
): ViewportGraphDiagnostics {
  const livePasses = frozenIds(graph.passes.map(({ id }) => id));
  const prunedPasses = frozenIds(graph.prunedPasses);
  const externalResources = frozenIds(graph.resources
    .filter(({ descriptor }) => descriptor?.lifetime === "external")
    .map(({ id }) => id));
  const historyResources = frozenIds(graph.resources
    .filter(({ descriptor }) => descriptor?.lifetime === "history")
    .map(({ id }) => id));
  const logicalTransientCount = graph.resources
    .filter(({ descriptor }) => descriptor?.lifetime === "transient").length;
  const logicalAliasSlotCount = allocations.slots.length;
  const lines = Object.freeze([
    `Live passes (${livePasses.length}): ${listOrNone(livePasses)}.`,
    `Pruned passes (${prunedPasses.length}): ${listOrNone(prunedPasses)}.`,
    `Logical transients: ${logicalTransientCount}; compatible alias slots: ${logicalAliasSlotCount} (analysis only).`,
    `External resources (${externalResources.length}): ${listOrNone(externalResources)}.`,
    `History resources (${historyResources.length}): ${listOrNone(historyResources)}.`,
  ]);
  return Object.freeze({
    livePasses,
    prunedPasses,
    logicalTransientCount,
    logicalAliasSlotCount,
    externalResources,
    historyResources,
    lines,
  });
}

function frozenIds<T extends RenderPassId | RenderResourceId>(ids: readonly T[]): readonly T[] {
  return Object.freeze([...ids]);
}

function listOrNone(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(", ") : "none";
}
