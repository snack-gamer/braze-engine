import type { Object3D } from "three";
import type { Runtime } from "../../../three/runtime";
import { disposeObject } from "../../../three/dispose";
import { EntityWorldError } from "../../../world/domain/entity-world";
import type { EntityLifecycleBackend } from "../../../world/runtime/entity-world";
import { RUNTIME_CHARACTER_CAPABILITIES } from "../../../character-controller/domain/runtime-character";
import { createRuntimeModelAssets } from "./runtime-model-assets";
import { createRuntimeModelViews, type RuntimeModelRecord, type RuntimeModelPoseBinder } from "./runtime-model-views";
import type { RuntimePrefabResourceCatalog } from "../runtime-prefab-resource-catalog";
import type { RuntimeModelAnimation } from "./runtime-model-animation";

/** Transactional model ownership, including dormant pool resources and cancelled loads. */
export function createRuntimeModelBackend(catalog: RuntimePrefabResourceCatalog, bindPose: RuntimeModelPoseBinder, fence: () => Promise<void>, assets = createRuntimeModelAssets(catalog), animation?: RuntimeModelAnimation) {
  const active = new Map<number, RuntimeModelRecord>(), dormant = new Map<symbol, RuntimeModelRecord>();
  const views = createRuntimeModelViews(bindPose, fence, animation), retiring = new Set<Promise<void>>();
  const owned = new Set<Object3D>();
  let disposed = false;
  const cleanup = (actions: Iterable<() => void>, original?: unknown) => {
    const errors: unknown[] = original === undefined ? [] : [original];
    for (const action of actions) { try { action(); } catch (error) { errors.push(error); } }
    if (!errors.length) return;
    if (errors.length === 1) throw errors[0];
    const message = `Runtime model cleanup failed: ${errors.map(String).join("; ")}`;
    throw original instanceof EntityWorldError ? new EntityWorldError(original.code, message) : new Error(message);
  };
  const later = (work: () => void) => {
    const promise = Promise.resolve().then(fence).then(work);
    retiring.add(promise); void promise.finally(() => retiring.delete(promise)).catch((error) => console.error("[runtime-models] Resource retirement failed", error));
    return promise;
  };
  const release = (record: RuntimeModelRecord) => {
    const errors: unknown[] = [];
    for (const action of [() => views.release(record), () => { if (owned.delete(record.object)) disposeObject(record.object); }, () => assets.collect()]) {
      try { action(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new Error(`Runtime model release failed: ${errors.map(String).join("; ")}`);
  };
  const backend: EntityLifecycleBackend = {
    components: animation ? [...RUNTIME_CHARACTER_CAPABILITIES, { id: "animator", requires: ["transform", "meshFilter", "meshRenderer"] }] : RUNTIME_CHARACTER_CAPABILITIES,
    async prepare(plan, signal) {
      if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime model world has ended.");
      const requested = plan.created.filter(({ entity }) => entity.model);
      if (owned.size + requested.filter(({ entity }) => { const token = plan.reservations?.get(entity.handle); return token === undefined || !dormant.has(token); }).length > 128) throw new EntityWorldError("capacity", "Runtime model capacity reached (128 including dormant pool instances).");
      const created: Array<{ record: RuntimeModelRecord; reused?: RuntimeModelRecord }> = [];
      const removed = plan.removed.flatMap((entity) => { const record = active.get(entity.handle.slot); return record ? [record] : []; });
      let animators: Awaited<ReturnType<RuntimeModelAnimation["prepare"]>>;
      try {
        for (const { entity } of requested) {
          const reservation = plan.reservations?.get(entity.handle), reused = reservation === undefined ? undefined : dormant.get(reservation);
          const object = reused?.object ?? await assets.prepare(entity, signal);
          owned.add(object);
          created.push({ record: { entity, object, reservation }, reused });
          if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime model preparation was cancelled.");
        }
        if (!animation && created.some(({ record }) => record.entity.model?.animator?.enabled)) throw new EntityWorldError("missing-dependency", "Runtime Animator support is not installed.");
        animators = await animation?.prepare(created.map(({ record }) => record), removed, signal);
        if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime model preparation was cancelled.");
      } catch (error) {
        cleanup([() => animators?.rollback(), ...created.filter(({ reused }) => !reused).map(({ record }) => () => release(record))], error);
        throw error;
      }
      let published = false, rolledBack = false;
      return {
        publish() {
          if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime model world has ended.");
          published = true;
          animators?.publish();
          for (const { record } of created) {
            if (record.reservation !== undefined) dormant.delete(record.reservation);
            active.set(record.entity.handle.slot, record); views.show(record);
          }
          for (const record of removed) { active.delete(record.entity.handle.slot); views.hide(record); }
        },
        rollback() {
          if (rolledBack) return; rolledBack = true;
          cleanup([() => animators?.rollback(), () => {
            if (published && !disposed) {
              for (const { record, reused } of created) {
                active.delete(record.entity.handle.slot); views.hide(record);
                if (reused && record.reservation !== undefined) dormant.set(record.reservation, reused);
              }
              for (const record of removed) { active.set(record.entity.handle.slot, record); views.show(record); }
            }
          }, () => {
            void later(() => cleanup(created.map(({ record, reused }) => () => reused ? views.release(record) : release(record))));
          }]);
        },
        retire() {
          if (!removed.length) { animators?.retire(); return; }
          return later(() => {
            cleanup([...removed.map((record) => () => {
              if (!disposed && record.reservation !== undefined) {
                try { views.release(record); } finally { dormant.set(record.reservation, record); }
              } else release(record);
            }), () => animators?.retire()]);
          });
        },
      };
    },
    releaseReservations(tokens) {
      cleanup(tokens.map((token) => () => { const record = dormant.get(token); if (record) { dormant.delete(token); release(record); } }));
    },
    async dispose() {
      if (disposed) return; disposed = true;
      const errors: unknown[] = [];
      const cleanup = (action: () => void) => { try { action(); } catch (error) { errors.push(error); } };
      cleanup(() => animation?.dispose());
      try { await views.dispose(); } catch (error) { errors.push(error); }
      for (const result of await Promise.allSettled([...retiring])) if (result.status === "rejected") errors.push(result.reason);
      active.forEach((record) => cleanup(() => release(record))); dormant.forEach((record) => cleanup(() => release(record))); active.clear(); dormant.clear();
      // Failed transaction fences quarantine resources until unconditional world teardown.
      owned.forEach((object) => cleanup(() => disposeObject(object))); owned.clear(); cleanup(() => assets.dispose());
      if (errors.length) throw new Error(`Runtime model world cleanup failed: ${errors.map(String).join("; ")}`);
    },
  };
  return { backend,
    attach: (runtime: Runtime) => { if (!disposed) views.attach(runtime, active.values()); },
    detach: (runtime: Runtime) => views.detach(runtime),
    diagnostics: () => ({ active: active.size, dormant: dormant.size, owned: owned.size, sources: assets.diagnostics() }),
  };
}
export type RuntimeModelBackend = ReturnType<typeof createRuntimeModelBackend>;
