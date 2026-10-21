import { validateBehaviorRegistry } from "../domain/behavior-registry";
import type { BehaviorRegistration } from "../domain/behavior-registration";

export type BehaviorCatalogSnapshot = Readonly<{
  status: "loading" | "ready" | "failed";
  definitions: readonly BehaviorRegistration[];
  message?: string;
}>;

/** One editor surface owns its asynchronous catalog load; stale completions cannot publish. */
export function createBehaviorCatalog(load: () => Promise<readonly BehaviorRegistration[]>) {
  let request = 0;
  let snapshot: BehaviorCatalogSnapshot = { status: "loading", definitions: [] };
  const listeners = new Set<() => void>();
  const publish = (value: BehaviorCatalogSnapshot) => {
    snapshot = value;
    for (const listener of listeners) listener();
  };
  return {
    read: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async reload() {
      const token = ++request;
      publish({ status: "loading", definitions: [] });
      try {
        const definitions = validateBehaviorRegistry(await load());
        if (token === request) publish({ status: "ready", definitions });
      } catch (error) {
        if (token === request) publish({ status: "failed", definitions: [], message: error instanceof Error ? error.message : String(error) });
      }
    },
    cancel() { request += 1; },
  };
}
