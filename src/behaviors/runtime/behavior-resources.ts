import { ENTITY_BEHAVIOR_LIMITS, EntityBehaviorError, type EntityBehaviorDefinition, type EntityBehaviorDiagnostic,
  type EntityBehaviorDisposeReason, type EntityBehaviorInstance, type EntityBehaviorPhase } from "../domain/entity-behaviors";
import type { EntityHandle } from "../../world/domain/entity-world";

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<unknown>).then === "function";
}
function synchronous(value: unknown) {
  if (!isThenable(value)) return;
  void Promise.resolve(value).catch(() => undefined);
  throw new EntityBehaviorError("invalid-behavior", "Behavior callbacks must be synchronous; use the attachment abort signal for asynchronous work.");
}

/** Owns one attachment's callbacks and resources, including invalid late factory results. */
export function createBehaviorResources(entity: EntityHandle, name: string, report: (diagnostic: EntityBehaviorDiagnostic) => void) {
  const abort = new AbortController(), cleanups: Array<() => void> = [];
  let instance: EntityBehaviorInstance | undefined, closed: EntityBehaviorDisposeReason | undefined;
  const diagnostic = (phase: EntityBehaviorPhase, error: unknown) => {
    try { report(Object.freeze({ entity, name, phase, message: error instanceof Error ? error.message : String(error) })); }
    catch { /* Diagnostic observers cannot retain resources or stop siblings. */ }
  };
  const cleanup = (callback: () => unknown, phase: "cleanup" | "dispose") => {
    try { synchronous(callback()); } catch (error) { diagnostic(phase, error); }
  };
  const disposeResult = (result: unknown, reason: EntityBehaviorDisposeReason) => {
    if (result && typeof (result as EntityBehaviorInstance).dispose === "function") cleanup(() => (result as EntityBehaviorInstance).dispose(reason), "dispose");
  };
  return {
    diagnostic,
    create(factory: EntityBehaviorDefinition["create"]) {
      const result: unknown = factory(Object.freeze({ entity, signal: abort.signal, defer(callback: () => void) {
        if (typeof callback !== "function") throw new EntityBehaviorError("invalid-behavior", "Behavior cleanup must be a function.");
        if (closed) cleanup(callback, "cleanup");
        else {
          if (cleanups.length >= ENTITY_BEHAVIOR_LIMITS.cleanups) throw new EntityBehaviorError("capacity", "Behavior cleanup capacity exceeded (32).");
          cleanups.push(callback);
        }
      } }));
      if (isThenable(result)) {
        void Promise.resolve(result).then((late) => disposeResult(late, closed ?? "failed"), () => undefined);
        throw new EntityBehaviorError("invalid-behavior", "Behavior factories must be synchronous.");
      }
      if (closed) { disposeResult(result, closed); return; }
      if (!result || typeof (result as EntityBehaviorInstance).dispose !== "function") throw new EntityBehaviorError("invalid-behavior", "Behavior create() must return an instance with dispose(reason).");
      // Capture methods so caller mutation cannot change the admitted lifecycle.
      const source = result as EntityBehaviorInstance;
      instance = { dispose: source.dispose.bind(source) };
      const captured = { ...instance } as { -readonly [K in keyof EntityBehaviorInstance]: EntityBehaviorInstance[K] };
      for (const phase of ["onEnable", "start", "fixedUpdate", "onDisable"] as const) {
        const method = source[phase];
        if (method !== undefined && typeof method !== "function") throw new EntityBehaviorError("invalid-behavior", `Behavior ${phase} must be a function.`);
        if (method) {
          if (phase === "fixedUpdate") captured.fixedUpdate = source.fixedUpdate!.bind(source);
          else captured[phase] = source[phase]!.bind(source);
        }
      }
      instance = Object.freeze(captured);
    },
    invoke(phase: "onEnable" | "start" | "fixedUpdate" | "onDisable", tick?: import("../domain/entity-behaviors").EntityBehaviorTick) {
      if (closed) return;
      if (phase === "fixedUpdate") synchronous(instance?.fixedUpdate?.(tick!));
      else synchronous(instance?.[phase]?.());
    },
    dispose(reason: EntityBehaviorDisposeReason) {
      if (closed) return;
      closed = reason; abort.abort();
      const owned = instance; instance = undefined;
      if (owned) cleanup(() => owned.dispose(reason), "dispose");
      while (cleanups.length) cleanup(cleanups.pop()!, "cleanup");
    },
  };
}
