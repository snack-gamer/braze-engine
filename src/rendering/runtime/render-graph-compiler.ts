import type {
  CompiledRenderGraph,
  RenderGraphDefinition,
  RenderGraphPass,
  RenderGraphResource,
  RenderPassId,
  RenderResourceId,
} from "./render-graph-definition";

export type RenderGraphCompileErrorCode =
  | "cycle"
  | "duplicate-pass"
  | "duplicate-resource"
  | "empty-id"
  | "missing-producer"
  | "multiple-writers"
  | "read-write-conflict"
  | "unknown-output"
  | "unknown-resource";

export class RenderGraphCompileError extends Error {
  constructor(
    readonly code: RenderGraphCompileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RenderGraphCompileError";
  }
}

type IndexedGraph<Descriptor, Payload> = Readonly<{
  resources: Map<RenderResourceId, RenderGraphResource<Descriptor>>;
  passes: Map<RenderPassId, RenderGraphPass<Payload>>;
  writers: Map<RenderResourceId, RenderPassId>;
}>;

/** Validates, prunes, and deterministically orders one immutable graph definition. */
export function compileRenderGraph<Descriptor = unknown, Payload = unknown>(
  definition: RenderGraphDefinition<Descriptor, Payload>,
): CompiledRenderGraph<Descriptor, Payload> {
  const indexed = indexAndValidate(definition);
  const orderedPasses = topologicalOrder(indexed);
  const livePasses = collectLivePasses(definition, indexed);
  const passes = orderedPasses.filter((pass) => livePasses.has(pass.id));
  const liveResources = collectLiveResources(definition.outputs, passes);
  const resources = [...liveResources]
    .map((id) => indexed.resources.get(id)!)
    .sort((left, right) => compareIds(left.id, right.id));
  const prunedPasses = orderedPasses
    .filter((pass) => !livePasses.has(pass.id))
    .map((pass) => pass.id);

  return {
    resources,
    passes,
    outputs: [...definition.outputs],
    prunedPasses,
  };
}

function indexAndValidate<Descriptor, Payload>(
  definition: RenderGraphDefinition<Descriptor, Payload>,
): IndexedGraph<Descriptor, Payload> {
  const resources = new Map<RenderResourceId, RenderGraphResource<Descriptor>>();
  for (const resource of definition.resources) {
    requireId(resource.id, "resource");
    if (resources.has(resource.id)) {
      fail("duplicate-resource", `Render graph resource '${resource.id}' is declared more than once.`);
    }
    resources.set(resource.id, resource);
  }

  const passes = new Map<RenderPassId, RenderGraphPass<Payload>>();
  for (const pass of definition.passes) {
    requireId(pass.id, "pass");
    if (passes.has(pass.id)) {
      fail("duplicate-pass", `Render graph pass '${pass.id}' is declared more than once.`);
    }
    passes.set(pass.id, pass);
  }

  for (const output of definition.outputs) {
    if (!resources.has(output)) {
      fail("unknown-output", `Render graph output '${output}' is not a declared resource.`);
    }
  }

  const writers = new Map<RenderResourceId, RenderPassId>();
  for (const pass of definition.passes) {
    const reads = new Set(pass.reads);
    for (const resourceId of [...pass.reads, ...pass.writes]) {
      if (!resources.has(resourceId)) {
        fail(
          "unknown-resource",
          `Render graph pass '${pass.id}' references undeclared resource '${resourceId}'.`,
        );
      }
    }
    for (const resourceId of pass.writes) {
      if (reads.has(resourceId)) {
        fail(
          "read-write-conflict",
          `Render graph pass '${pass.id}' reads and writes '${resourceId}' without a version boundary.`,
        );
      }
      const existing = writers.get(resourceId);
      if (existing) {
        fail(
          "multiple-writers",
          `Render graph resource '${resourceId}' is written by both '${existing}' and '${pass.id}'.`,
        );
      }
      writers.set(resourceId, pass.id);
    }
  }

  for (const pass of definition.passes) {
    for (const resourceId of pass.reads) {
      const resource = resources.get(resourceId)!;
      if (resource.source === "graph" && !writers.has(resourceId)) {
        fail(
          "missing-producer",
          `Render graph resource '${resourceId}' is read by '${pass.id}' but has no producer.`,
        );
      }
    }
  }
  for (const output of definition.outputs) {
    const resource = resources.get(output)!;
    if (resource.source === "graph" && !writers.has(output)) {
      fail("missing-producer", `Render graph output '${output}' has no producer.`);
    }
  }

  return { resources, passes, writers };
}

function topologicalOrder<Descriptor, Payload>(
  graph: IndexedGraph<Descriptor, Payload>,
): RenderGraphPass<Payload>[] {
  const dependencies = new Map<RenderPassId, Set<RenderPassId>>();
  const consumers = new Map<RenderPassId, Set<RenderPassId>>();
  for (const passId of graph.passes.keys()) {
    dependencies.set(passId, new Set());
    consumers.set(passId, new Set());
  }
  for (const pass of graph.passes.values()) {
    for (const resourceId of pass.reads) {
      const producer = graph.writers.get(resourceId);
      if (!producer || producer === pass.id) continue;
      dependencies.get(pass.id)!.add(producer);
      consumers.get(producer)!.add(pass.id);
    }
  }

  const ready = [...graph.passes.keys()]
    .filter((passId) => dependencies.get(passId)!.size === 0)
    .sort(compareIds);
  const ordered: RenderGraphPass<Payload>[] = [];
  while (ready.length > 0) {
    const passId = ready.shift()!;
    ordered.push(graph.passes.get(passId)!);
    for (const consumer of consumers.get(passId)!) {
      const incoming = dependencies.get(consumer)!;
      incoming.delete(passId);
      if (incoming.size === 0) insertSorted(ready, consumer);
    }
  }

  if (ordered.length !== graph.passes.size) {
    const cyclic = [...dependencies]
      .filter(([, incoming]) => incoming.size > 0)
      .map(([passId]) => passId)
      .sort(compareIds);
    fail("cycle", `Render graph contains a cycle involving: ${cyclic.join(", ")}.`);
  }
  return ordered;
}

function collectLivePasses<Descriptor, Payload>(
  definition: RenderGraphDefinition<Descriptor, Payload>,
  graph: IndexedGraph<Descriptor, Payload>,
): Set<RenderPassId> {
  const live = new Set<RenderPassId>();
  const pending: RenderPassId[] = [];
  for (const output of definition.outputs) {
    const writer = graph.writers.get(output);
    if (writer) pending.push(writer);
  }
  for (const pass of definition.passes) {
    if (pass.sideEffect) pending.push(pass.id);
  }

  while (pending.length > 0) {
    const passId = pending.pop()!;
    if (live.has(passId)) continue;
    live.add(passId);
    const pass = graph.passes.get(passId)!;
    for (const resourceId of pass.reads) {
      const writer = graph.writers.get(resourceId);
      if (writer && !live.has(writer)) pending.push(writer);
    }
  }
  return live;
}

function collectLiveResources<Payload>(
  outputs: readonly RenderResourceId[],
  passes: readonly RenderGraphPass<Payload>[],
): Set<RenderResourceId> {
  const live = new Set(outputs);
  for (const pass of passes) {
    pass.reads.forEach((id) => live.add(id));
    pass.writes.forEach((id) => live.add(id));
  }
  return live;
}

function requireId(id: string, kind: "pass" | "resource"): void {
  if (id.trim().length === 0) fail("empty-id", `Render graph ${kind} IDs cannot be empty.`);
}

function insertSorted<T extends string>(values: T[], value: T): void {
  const index = values.findIndex((candidate) => compareIds(value, candidate) < 0);
  if (index === -1) values.push(value);
  else values.splice(index, 0, value);
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function fail(code: RenderGraphCompileErrorCode, message: string): never {
  throw new RenderGraphCompileError(code, message);
}
