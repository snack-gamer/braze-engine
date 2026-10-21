import type {
  CompiledRenderGraph,
  RenderGraphResource,
  RenderResourceId,
} from "./render-graph-definition";

export type RenderResourceLifetime<Descriptor = unknown> = Readonly<{
  resource: RenderGraphResource<Descriptor>;
  /** Index of the first pass that writes the resource. Null for imported inputs. */
  firstWrite: number | null;
  /** Index of the final pass that reads the resource. Null for write-only outputs. */
  lastRead: number | null;
  firstUse: number;
  /** Outputs remain live through the virtual export boundary after the last pass. */
  lastUse: number;
  exported: boolean;
}>;

type MutableLifetime<Descriptor> = {
  resource: RenderGraphResource<Descriptor>;
  firstWrite: number | null;
  lastRead: number | null;
  firstUse: number | null;
  lastUse: number | null;
  exported: boolean;
};

/** Computes deterministic logical-resource intervals for a compiled pass order. */
export function analyzeRenderResourceLifetimes<Descriptor = unknown, Payload = unknown>(
  graph: CompiledRenderGraph<Descriptor, Payload>,
): readonly RenderResourceLifetime<Descriptor>[] {
  const outputIds = new Set(graph.outputs);
  const lifetimes = new Map<RenderResourceId, MutableLifetime<Descriptor>>();
  for (const resource of graph.resources) {
    lifetimes.set(resource.id, {
      resource,
      firstWrite: null,
      lastRead: null,
      firstUse: null,
      lastUse: null,
      exported: outputIds.has(resource.id),
    });
  }

  graph.passes.forEach((pass, passIndex) => {
    for (const resourceId of pass.reads) {
      const lifetime = lifetimes.get(resourceId)!;
      lifetime.lastRead = passIndex;
      lifetime.firstUse = lifetime.firstUse ?? passIndex;
      lifetime.lastUse = passIndex;
    }
    for (const resourceId of pass.writes) {
      const lifetime = lifetimes.get(resourceId)!;
      lifetime.firstWrite = lifetime.firstWrite ?? passIndex;
      lifetime.firstUse = lifetime.firstUse ?? passIndex;
      lifetime.lastUse = passIndex;
    }
  });

  const exportBoundary = graph.passes.length;
  for (const output of graph.outputs) {
    const lifetime = lifetimes.get(output);
    if (!lifetime) continue;
    lifetime.firstUse = lifetime.firstUse ?? exportBoundary;
    lifetime.lastUse = exportBoundary;
  }

  return [...lifetimes.values()]
    .filter((lifetime): lifetime is MutableLifetime<Descriptor> & {
      firstUse: number;
      lastUse: number;
    } => lifetime.firstUse !== null && lifetime.lastUse !== null)
    .sort((left, right) => compareIds(left.resource.id, right.resource.id))
    .map((lifetime) => ({ ...lifetime }));
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
