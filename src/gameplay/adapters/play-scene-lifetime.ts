import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { SceneObject } from "../../scene/domain/scene-object";

/** Presentation tombstones belong to a Play world, never to the saved scene or an individual viewport. */
export function createPlaySceneLifetime() {
  let removed: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  let source: SceneObject[] | undefined, revision: ReadonlySet<string> | undefined, filtered: SceneObject[] = [];
  const notify = () => {
    for (const listener of listeners) {
      try { listener(); } catch (error) { console.error("[gameplay] Scene lifetime observer failed", error); }
    }
  };
  return {
    snapshot: () => removed,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    objects(objects: SceneObject[]) {
      if (!removed.size) return objects;
      if (source !== objects || revision !== removed) {
        source = objects; revision = removed; filtered = objects.filter((object) => !removed.has(object.id));
      }
      return filtered;
    },
    prepare(ids: readonly string[]) {
      const previous = removed;
      const next = ids.length ? new Set([...removed, ...ids]) : removed;
      return {
        publish() { if (next !== removed) { removed = next; notify(); } },
        rollback() { if (removed === next && previous !== next) { removed = previous; notify(); } },
      };
    },
    clear() {
      source = undefined; revision = undefined; filtered = [];
      if (removed.size) { removed = new Set(); notify(); }
    },
  };
}

const lifetimes = new WeakMap<BrowserThreeWebGpuRenderSession, ReturnType<typeof createPlaySceneLifetime>>();
export function playSceneLifetimeFor(session: BrowserThreeWebGpuRenderSession) {
  let lifetime = lifetimes.get(session);
  if (!lifetime) { lifetime = createPlaySceneLifetime(); lifetimes.set(session, lifetime); }
  return lifetime;
}
