import type {
  CompiledRenderGraph,
  RenderResourceId,
  RenderResourceSource,
} from "../render-graph-definition";
import type {
  TransientResourceAllocationPlan,
  TransientResourceSlotId,
} from "../transient-resource-allocation";
import type {
  ViewportRenderPassPayload,
  ViewportResourceDescriptor,
} from "../viewport-render-graph";

export type ViewportResourceByteEstimateInput = Readonly<{
  resourceId: RenderResourceId;
  source: RenderResourceSource;
  lifetime: ViewportResourceDescriptor["lifetime"];
  extent: ViewportResourceDescriptor["extent"];
  format: ViewportResourceDescriptor["format"];
  extentBasis: "viewport" | "shadow";
  widthDivisor: 1 | 2 | 4;
  heightDivisor: 1 | 2 | 4;
  transientSlotId: TransientResourceSlotId | null;
}>;

export type ViewportLogicalAliasByteEstimateInput = Readonly<{
  slotId: TransientResourceSlotId;
  descriptorKey: string;
  logicalResources: readonly RenderResourceId[];
  extent: ViewportResourceDescriptor["extent"];
  format: ViewportResourceDescriptor["format"];
  extentBasis: "viewport" | "shadow";
  widthDivisor: 1 | 2 | 4;
  heightDivisor: 1 | 2 | 4;
}>;

export type ViewportByteEstimateInputs = Readonly<{
  logicalResources: readonly ViewportResourceByteEstimateInput[];
  /** Hypothetical alias slots, not allocations owned by a platform adapter. */
  logicalAliasSlots: readonly ViewportLogicalAliasByteEstimateInput[];
}>;

/** Produces symbolic inputs; the platform adapter supplies concrete extents and bytes per texel. */
export function createViewportByteEstimateInputs(
  graph: CompiledRenderGraph<ViewportResourceDescriptor, ViewportRenderPassPayload>,
  allocations: TransientResourceAllocationPlan<ViewportResourceDescriptor>,
): ViewportByteEstimateInputs {
  const slotByResource = new Map(
    allocations.allocations.map(({ resourceId, slotId }) => [resourceId, slotId]),
  );
  const logicalResources = graph.resources.map((resource) => {
    const descriptor = requireDescriptor(resource.id, resource.descriptor);
    return Object.freeze({
      resourceId: resource.id,
      source: resource.source,
      lifetime: descriptor.lifetime,
      extent: descriptor.extent,
      format: descriptor.format,
      ...extentFactors(descriptor.extent),
      transientSlotId: slotByResource.get(resource.id) ?? null,
    });
  });
  const logicalAliasSlots = allocations.slots.map((slot) => Object.freeze({
    slotId: slot.id,
    descriptorKey: slot.descriptorKey,
    logicalResources: Object.freeze(allocations.allocations
      .filter(({ slotId }) => slotId === slot.id)
      .map(({ resourceId }) => resourceId)
      .sort(compareIds)),
    extent: slot.descriptor.extent,
    format: slot.descriptor.format,
    ...extentFactors(slot.descriptor.extent),
  }));
  return Object.freeze({
    logicalResources: Object.freeze(logicalResources),
    logicalAliasSlots: Object.freeze(logicalAliasSlots),
  });
}

function requireDescriptor(
  resourceId: RenderResourceId,
  descriptor: ViewportResourceDescriptor | undefined,
): ViewportResourceDescriptor {
  if (!descriptor) throw new Error(`Viewport resource '${resourceId}' has no descriptor.`);
  return descriptor;
}

function extentFactors(extent: ViewportResourceDescriptor["extent"]): Readonly<{
  extentBasis: "viewport" | "shadow";
  widthDivisor: 1 | 2 | 4;
  heightDivisor: 1 | 2 | 4;
}> {
  if (extent === "shadow") return { extentBasis: "shadow", widthDivisor: 1, heightDivisor: 1 };
  const divisor = extent === "full" ? 1 : extent === "half" ? 2 : 4;
  return { extentBasis: "viewport", widthDivisor: divisor, heightDivisor: divisor };
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
