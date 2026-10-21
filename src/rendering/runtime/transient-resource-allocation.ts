import type { RenderResourceId } from "./render-graph-definition";
import type { RenderResourceLifetime } from "./render-resource-lifetimes";

export type TransientResourceSlotId = number & { readonly __transientSlot: true };

export type TransientResourceSlot<Descriptor> = Readonly<{
  id: TransientResourceSlotId;
  descriptorKey: string;
  descriptor: Descriptor;
  exclusive: boolean;
}>;

export type TransientResourceAllocation = Readonly<{
  resourceId: RenderResourceId;
  slotId: TransientResourceSlotId;
  firstUse: number;
  lastUse: number;
  exported: boolean;
}>;

export type TransientResourceAllocationPlan<Descriptor> = Readonly<{
  slots: readonly TransientResourceSlot<Descriptor>[];
  allocations: readonly TransientResourceAllocation[];
}>;

export class TransientResourceAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientResourceAllocationError";
  }
}

type MutableSlot<Descriptor> = {
  id: TransientResourceSlotId;
  descriptorKey: string;
  descriptor: Descriptor;
  exclusive: boolean;
  availableAfter: number;
};

/**
 * Assigns graph-owned logical resources to descriptor-compatible physical
 * slots. Exported resources are deliberately exclusive because their consumer
 * lives outside the compiled pass interval.
 */
export function planTransientResourceAllocations<Descriptor>(
  lifetimes: readonly RenderResourceLifetime<Descriptor>[],
  descriptorKey: (descriptor: Descriptor) => string,
): TransientResourceAllocationPlan<Descriptor> {
  const candidates = lifetimes
    .filter(({ resource }) => resource.source === "graph")
    .map((lifetime) => {
      if (lifetime.resource.descriptor === undefined) {
        throw new TransientResourceAllocationError(
          `Graph resource '${lifetime.resource.id}' has no transient allocation descriptor.`,
        );
      }
      return {
        ...lifetime,
        descriptor: lifetime.resource.descriptor,
        descriptorKey: descriptorKey(lifetime.resource.descriptor),
      };
    })
    .sort((left, right) => (
      left.firstUse - right.firstUse
      || compareIds(left.resource.id, right.resource.id)
    ));

  const slots: MutableSlot<Descriptor>[] = [];
  const allocations: TransientResourceAllocation[] = [];
  for (const lifetime of candidates) {
    const reusable = lifetime.exported
      ? undefined
      : slots.find((slot) => (
          !slot.exclusive
          && slot.descriptorKey === lifetime.descriptorKey
          && slot.availableAfter < lifetime.firstUse
        ));
    const slot = reusable ?? createSlot(
      slots.length,
      lifetime.descriptorKey,
      lifetime.descriptor,
      lifetime.exported,
      lifetime.lastUse,
    );
    if (!reusable) slots.push(slot);
    else slot.availableAfter = lifetime.lastUse;
    allocations.push(Object.freeze({
      resourceId: lifetime.resource.id,
      slotId: slot.id,
      firstUse: lifetime.firstUse,
      lastUse: lifetime.lastUse,
      exported: lifetime.exported,
    }));
  }

  return Object.freeze({
    slots: Object.freeze(slots.map(({ availableAfter: _, ...slot }) => Object.freeze(slot))),
    allocations: Object.freeze(allocations.sort((left, right) => compareIds(left.resourceId, right.resourceId))),
  });
}

function createSlot<Descriptor>(
  index: number,
  descriptorKey: string,
  descriptor: Descriptor,
  exclusive: boolean,
  availableAfter: number,
): MutableSlot<Descriptor> {
  return {
    id: index as TransientResourceSlotId,
    descriptorKey,
    descriptor,
    exclusive,
    availableAfter,
  };
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
