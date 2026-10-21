import type { EntityReservationPort } from "../../world/runtime/entity-reservations";
import { createPrefabPool } from "./prefab-pool";
import type { AssetRef } from "../../assets/domain/asset-reference";
import { EntityWorldError, type EntityCommand, type EntityWorld } from "../../world/domain/entity-world";
import type { PrefabBatchState, PrefabInstance, PrefabPlacement, RuntimePrefabs } from "../domain/runtime-prefab";

export type RuntimePrefabTemplate = Readonly<{
  asset: Readonly<AssetRef>; name: string; revision: string; nodes: number; rootKey: string;
  create: (placement?: PrefabPlacement) => readonly EntityCommand[];
}>;

/** Instance ownership over the world's atomic queue; no per-frame work or retained ticket log. */
export function createRuntimePrefabs(world: EntityWorld, templates: readonly RuntimePrefabTemplate[], reservations?: EntityReservationPort): RuntimePrefabs {
  const catalog = new Map(templates.map((template) => [template.asset.guid, template]));
  let pools = 0;
  const instances = new WeakSet<PrefabInstance>();
  const list = Object.freeze(templates.map(({ asset, name, revision, nodes }) => Object.freeze({ asset, name, revision, nodes })));
  const active = () => { if (world.stats().ended) throw new EntityWorldError("world-ended", "This prefab world has ended."); };
  const resolve = (asset: AssetRef) => {
    active();
    const template = catalog.get(asset?.guid?.toLowerCase());
    if (!template || (asset.localId !== undefined && asset.localId !== "main")) throw new EntityWorldError("missing-asset", "Prefab is not in this Play snapshot. Register its AssetRef in runtimePrefabs and restart Play.");
    return template;
  };
  return Object.freeze({
    list() { active(); return list; },
    instantiate(asset: AssetRef, placement?: PrefabPlacement) {
      const template = resolve(asset);
      const ticket = world.submit(template.create(placement));
      let committed: PrefabBatchState | null = null;
      return Object.freeze({ read(): PrefabBatchState {
        if (committed) return committed;
        const result = ticket.read(); if (result.status !== "committed") return result;
        const instance = Object.freeze({ asset: template.asset, revision: template.revision, root: result.created[template.rootKey], entities: result.created });
        instances.add(instance); committed = Object.freeze({ status: "committed", tick: result.tick, instance }); return committed;
      } });
    },
    destroy(instance: PrefabInstance) {
      active();
      if (!instances.has(instance) || !world.isAlive(instance.root)) throw new EntityWorldError("stale-handle", "Prefab instance is stale or belongs to another world.");
      return world.submit(Object.values(instance.entities).filter(world.isAlive).map((handle) => ({ op: "destroy", handle })));
    },
    createPool(asset: AssetRef, options: Readonly<{ capacity: number }>) {
      const template = resolve(asset), capacity = options?.capacity;
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 64 || pools >= 32) throw new EntityWorldError("capacity", "Use 1–64 instances per pool and at most 32 live pools per world.");
      if (!reservations) throw new EntityWorldError("unsupported-component", "This prefab host does not support pool reservations.");
      const group = reservations.allocate(capacity * template.nodes), pool = createPrefabPool(world, template, capacity, group);
      pools++; let disposed = false;
      return Object.freeze({ ...pool, dispose() { if (disposed) return; pool.dispose(); disposed = true; pools--; } });
    },
    isAlive: (instance: PrefabInstance) => instances.has(instance) && world.isAlive(instance.root),
  });
}
