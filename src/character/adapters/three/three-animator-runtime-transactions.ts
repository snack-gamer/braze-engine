import type { PreparedRuntimeAnimatorChange, RuntimeAnimatorCreation } from "./three-animator-runtime-contracts";
import type { ThreeAnimatorWorldEntry } from "./three-animator-world-entry";
import { THREE_ANIMATOR_PLAYBACK_LIMITS } from "./three-animator-playback-limits";
import type { EntityHandle } from "../../../world/domain/entity-world";

type Options = Readonly<{
  entries: Map<string, ThreeAnimatorWorldEntry>;
  authoredIds: ReadonlySet<string>;
  pendingCount: () => number;
  create: (creation: RuntimeAnimatorCreation) => ThreeAnimatorWorldEntry;
  show: (entry: ThreeAnimatorWorldEntry) => void;
  suspend: (id: string) => void;
  resume: (id: string) => void;
  hide: (id: string) => void;
  release: (entry: ThreeAnimatorWorldEntry) => void;
  releaseRig: (creation: RuntimeAnimatorCreation) => void;
  changed: (id: string) => void;
}>;

/** Prepared and retiring sessions reserve the same bounded world admission budget. */
export function createThreeAnimatorRuntimeTransactions(options: Options) {
  const reserved = new Map<string, ThreeAnimatorWorldEntry>();
  const retiring = new Set<ThreeAnimatorWorldEntry>();
  const lockedRemovals = new Set<string>();
  const changes = new Set<PreparedRuntimeAnimatorChange>();
  const identities = new Map<symbol, Map<number, ThreeAnimatorWorldEntry>>();
  const entities = new Map<string, EntityHandle>();
  let disposed = false;
  const count = () => options.entries.size + options.pendingCount() + reserved.size + retiring.size;
  const active = () => { if (disposed) throw new Error("The animation world has ended."); };
  const bind = (entry: ThreeAnimatorWorldEntry) => {
    if (!entry.entity) return;
    const world = identities.get(entry.entity.world) ?? new Map<number, ThreeAnimatorWorldEntry>();
    world.set(entry.entity.slot, entry); identities.set(entry.entity.world, world); entities.set(entry.object.id, entry.entity);
  };
  const unbind = (entry: ThreeAnimatorWorldEntry) => {
    if (entry.entity) {
      const world = identities.get(entry.entity.world);
      if (world?.get(entry.entity.slot) === entry) world.delete(entry.entity.slot);
      if (!world?.size) identities.delete(entry.entity.world);
    }
    entities.delete(entry.object.id);
  };
  return {
    reservedCount: () => reserved.size,
    runtimeAnimatorId(handle: EntityHandle) {
      const entry = identities.get(handle.world)?.get(handle.slot), entity = entry?.entity;
      return !disposed && entity?.world === handle.world && entity.generation === handle.generation ? entry?.object.id : undefined;
    },
    runtimeEntity: (id: string) => disposed ? undefined : entities.get(id),
    removed(entry: ThreeAnimatorWorldEntry) { unbind(entry); },
    prepare(created: readonly RuntimeAnimatorCreation[], removedIds: readonly string[]): PreparedRuntimeAnimatorChange {
      const next: ThreeAnimatorWorldEntry[] = [], previous: ThreeAnimatorWorldEntry[] = [];
      const initialized = new Set<RuntimeAnimatorCreation>();
      try {
        active();
        if (count() + created.length > THREE_ANIMATOR_PLAYBACK_LIMITS.maximumLiveSessions) throw new Error("Animator world capacity reached (32 including prepared and retiring sessions).");
        const ids = new Set<string>(), rigs = new Set<RuntimeAnimatorCreation["rig"]>();
        const handles = [...options.entries.values(), ...reserved.values(), ...retiring].flatMap((entry) => entry.entity ? [entry.entity] : []);
        for (const creation of created) {
          const id = creation.object.id;
          if (!id || ids.has(id) || options.authoredIds.has(id) || options.entries.has(id) || reserved.has(id)) throw new Error(`Runtime Animator ID '${id}' is duplicate or belongs to authored content.`);
          if (rigs.has(creation.rig)) throw new Error("Each runtime Animator must own a distinct prepared rig.");
          rigs.add(creation.rig);
          ids.add(id);
          if (creation.entity) {
            const entity = creation.entity;
            if (typeof entity.world !== "symbol" || !Number.isSafeInteger(entity.slot) || entity.slot < 0 || !Number.isSafeInteger(entity.generation) || entity.generation < 1) throw new Error("Runtime Animator requires a valid entity handle.");
            if (handles.some((handle) => handle.world === entity.world && handle.slot === entity.slot)) throw new Error("This runtime entity already owns an active, prepared, or retiring Animator.");
            handles.push(entity);
          }
        }
        const removals = new Set<string>();
        for (const id of removedIds) {
          const entry = options.entries.get(id);
          if (removals.has(id) || lockedRemovals.has(id) || !entry || entry.kind !== "runtime") throw new Error(`Runtime Animator '${id}' is unavailable for removal.`);
          removals.add(id); previous.push(entry);
        }
        for (const creation of created) {
          const entry = options.create(creation);
          initialized.add(creation); next.push(entry); reserved.set(entry.object.id, entry);
        }
        previous.forEach((entry) => lockedRemovals.add(entry.object.id));
      } catch (error) {
        const releasedRigs = new Set(next.map((entry) => entry.rig));
        for (const entry of next) { reserved.delete(entry.object.id); options.release(entry); }
        for (const creation of created) if (!initialized.has(creation) && !releasedRigs.has(creation.rig)) { options.releaseRig(creation); releasedRigs.add(creation.rig); }
        throw error;
      }
      let state: "prepared" | "published" | "rolledBack" | "retired" = "prepared";
      const finish = () => { changes.delete(change); previous.forEach((entry) => lockedRemovals.delete(entry.object.id)); };
      const rollback = () => {
        if (state === "rolledBack" || state === "retired") return;
        const published = state === "published"; state = "rolledBack";
        for (const entry of next) {
          reserved.delete(entry.object.id);
          if (options.entries.get(entry.object.id) === entry) options.entries.delete(entry.object.id);
          unbind(entry); options.hide(entry.object.id); options.release(entry); options.changed(entry.object.id);
        }
        if (published) for (const entry of previous) {
          retiring.delete(entry);
          if (!disposed) { options.entries.set(entry.object.id, entry); bind(entry); options.resume(entry.object.id); options.changed(entry.object.id); }
          else { options.hide(entry.object.id); options.release(entry); }
        }
        finish();
      };
      const change: PreparedRuntimeAnimatorChange = {
        publish() {
          active();
          if (state === "published") return;
          if (state !== "prepared") throw new Error("This Animator transaction has ended.");
          for (const entry of previous) if (options.entries.get(entry.object.id) !== entry) throw new Error("A prepared Animator removal became stale.");
          state = "published";
          try {
            for (const entry of previous) {
              options.entries.delete(entry.object.id); unbind(entry); retiring.add(entry); options.suspend(entry.object.id); options.changed(entry.object.id);
            }
            for (const entry of next) {
              reserved.delete(entry.object.id); options.entries.set(entry.object.id, entry); bind(entry); options.show(entry); options.changed(entry.object.id);
            }
          } catch (error) { rollback(); throw error; }
        },
        rollback,
        retire() {
          if (state === "retired" || state === "rolledBack") return;
          if (state !== "published") throw new Error("Publish an Animator transaction before retiring it.");
          state = "retired";
          for (const entry of previous) { retiring.delete(entry); options.hide(entry.object.id); options.release(entry); }
          finish();
        },
      };
      changes.add(change); return change;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const change of changes) change.rollback();
      reserved.clear(); retiring.clear(); lockedRemovals.clear(); changes.clear(); identities.clear(); entities.clear();
    },
  };
}
