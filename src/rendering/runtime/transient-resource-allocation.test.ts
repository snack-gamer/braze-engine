import { describe, expect, it, vi } from "vitest";
import { compileRenderGraph } from "./render-graph-compiler";
import {
  renderPassId,
  renderResourceId,
  type RenderGraphDefinition,
} from "./render-graph-definition";
import { analyzeRenderResourceLifetimes } from "./render-resource-lifetimes";
import { planTransientResourceAllocations } from "./transient-resource-allocation";
import { TransientResourceLeasePool } from "./transient-resource-lease-pool";

type Descriptor = Readonly<{ format: string; extent: string }>;
type Physical = Readonly<{ id: number; key: string }>;

const hdr: Descriptor = { format: "rgba16float", extent: "full" };
const mask: Descriptor = { format: "r8unorm", extent: "half" };

function allocationPlan() {
  const graph: RenderGraphDefinition<Descriptor> = {
    resources: [
      { id: renderResourceId("first"), source: "graph", descriptor: hdr },
      { id: renderResourceId("bridge"), source: "graph", descriptor: mask },
      { id: renderResourceId("second"), source: "graph", descriptor: hdr },
      { id: renderResourceId("overlap"), source: "graph", descriptor: hdr },
      { id: renderResourceId("final"), source: "graph", descriptor: hdr },
      { id: renderResourceId("asset"), source: "external", descriptor: hdr },
    ],
    passes: [
      {
        id: renderPassId("a-first"),
        reads: [renderResourceId("asset")],
        writes: [renderResourceId("first"), renderResourceId("overlap")],
      },
      {
        id: renderPassId("b-bridge"),
        reads: [renderResourceId("first")],
        writes: [renderResourceId("bridge")],
      },
      {
        id: renderPassId("c-second"),
        reads: [renderResourceId("bridge")],
        writes: [renderResourceId("second")],
      },
      {
        id: renderPassId("d-final"),
        reads: [renderResourceId("second"), renderResourceId("overlap")],
        writes: [renderResourceId("final")],
      },
    ],
    outputs: [renderResourceId("final")],
  };
  const compiled = compileRenderGraph(graph);
  const lifetimes = analyzeRenderResourceLifetimes(compiled);
  return planTransientResourceAllocations(
    lifetimes,
    (descriptor) => `${descriptor.format}:${descriptor.extent}`,
  );
}

describe("transient resource allocation", () => {
  it("aliases compatible non-overlapping intervals but isolates overlaps and exports", () => {
    const plan = allocationPlan();
    const byResource = new Map(plan.allocations.map((allocation) => [allocation.resourceId, allocation]));

    expect(byResource.get(renderResourceId("first"))?.slotId)
      .toBe(byResource.get(renderResourceId("second"))?.slotId);
    expect(byResource.get(renderResourceId("overlap"))?.slotId)
      .not.toBe(byResource.get(renderResourceId("first"))?.slotId);
    expect(byResource.get(renderResourceId("final"))?.slotId)
      .not.toBe(byResource.get(renderResourceId("first"))?.slotId);
    expect(plan.slots.find(({ id }) => id === byResource.get(renderResourceId("final"))?.slotId)?.exclusive)
      .toBe(true);
    expect(byResource.has(renderResourceId("asset"))).toBe(false);
  });

  it("leases one physical resource per slot and reuses it after release", () => {
    let nextId = 1;
    const destroy = vi.fn();
    const pool = new TransientResourceLeasePool<Descriptor, Physical>({
      create: (_descriptor, key) => ({ id: nextId++, key }),
      destroy,
    });
    const plan = allocationPlan();

    const firstLease = pool.lease(plan);
    const firstPhysical = firstLease.get(renderResourceId("first"));
    expect(firstLease.get(renderResourceId("second"))).toBe(firstPhysical);
    expect(firstLease.get(renderResourceId("overlap"))).not.toBe(firstPhysical);
    expect(firstLease.get(renderResourceId("final"))).not.toBe(firstPhysical);

    firstLease.release();
    const secondLease = pool.lease(plan);
    expect(secondLease.get(renderResourceId("first"))).toBe(firstPhysical);
    secondLease.release();
    pool.dispose();

    expect(destroy).toHaveBeenCalledTimes(plan.slots.length);
    expect(() => pool.lease(plan)).toThrow(/disposed/);
  });
});
