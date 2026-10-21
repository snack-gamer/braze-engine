import type { RenderResourceId } from "./render-graph-definition";
import type {
  TransientResourceAllocationPlan,
  TransientResourceSlotId,
} from "./transient-resource-allocation";

export type TransientResourceFactory<Descriptor, Resource> = Readonly<{
  create: (descriptor: Descriptor, descriptorKey: string) => Resource;
  destroy: (resource: Resource) => void;
}>;

export type TransientResourceLease<Resource> = Readonly<{
  get: (resourceId: RenderResourceId) => Resource;
  release: () => void;
}>;

type PoolEntry<Resource> = {
  descriptorKey: string;
  resource: Resource;
  leased: boolean;
};

/** Owns reusable physical resources while each lease binds one allocation plan. */
export class TransientResourceLeasePool<Descriptor, Resource> {
  private readonly entries: PoolEntry<Resource>[] = [];
  private disposed = false;

  constructor(private readonly factory: TransientResourceFactory<Descriptor, Resource>) {}

  lease(plan: TransientResourceAllocationPlan<Descriptor>): TransientResourceLease<Resource> {
    if (this.disposed) throw new Error("Cannot lease resources from a disposed transient pool.");
    const acquired: PoolEntry<Resource>[] = [];
    const bySlot = new Map<TransientResourceSlotId, PoolEntry<Resource>>();
    try {
      for (const slot of plan.slots) {
        let entry = this.entries.find((candidate) => (
          !candidate.leased && candidate.descriptorKey === slot.descriptorKey
        ));
        if (!entry) {
          entry = {
            descriptorKey: slot.descriptorKey,
            resource: this.factory.create(slot.descriptor, slot.descriptorKey),
            leased: false,
          };
          this.entries.push(entry);
        }
        entry.leased = true;
        acquired.push(entry);
        bySlot.set(slot.id, entry);
      }
    } catch (error) {
      acquired.forEach((entry) => { entry.leased = false; });
      throw error;
    }

    const byResource = new Map<RenderResourceId, Resource>();
    for (const allocation of plan.allocations) {
      byResource.set(allocation.resourceId, bySlot.get(allocation.slotId)!.resource);
    }
    let released = false;
    return Object.freeze({
      get: (resourceId: RenderResourceId) => {
        if (released || this.disposed) throw new Error("Transient resource lease is no longer active.");
        if (!byResource.has(resourceId)) {
          throw new Error(`Resource '${resourceId}' is not part of this transient lease.`);
        }
        return byResource.get(resourceId)!;
      },
      release: () => {
        if (released) return;
        released = true;
        if (this.disposed) return;
        acquired.forEach((entry) => { entry.leased = false; });
      },
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries) this.factory.destroy(entry.resource);
    this.entries.length = 0;
  }
}
