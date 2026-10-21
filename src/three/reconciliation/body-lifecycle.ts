import type * as THREE from "three";
import type { BodyKind, Runtime } from "../runtime";

export type RuntimeBodyLifecycleEvent = Readonly<{
  phase: "willChange" | "didChange";
  objectId: string;
  node: THREE.Group;
  previousBody: THREE.Object3D | null;
  nextBody: THREE.Object3D | null;
  nextKind: BodyKind | "removed";
}>;

type RuntimeBodyLifecycleListener = (event: RuntimeBodyLifecycleEvent) => void;

const listenersByRuntime = new WeakMap<Runtime, Set<RuntimeBodyLifecycleListener>>();

/** Runtime-scoped listener; disposal removes the only retained callback. */
export function subscribeRuntimeBodyLifecycle(
  runtime: Runtime,
  listener: RuntimeBodyLifecycleListener,
): () => void {
  const listeners = listenersByRuntime.get(runtime) ?? new Set<RuntimeBodyLifecycleListener>();
  listeners.add(listener);
  listenersByRuntime.set(runtime, listeners);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners.delete(listener);
    if (listeners.size === 0) listenersByRuntime.delete(runtime);
  };
}

export function emitRuntimeBodyLifecycle(
  runtime: Runtime,
  event: RuntimeBodyLifecycleEvent,
): void {
  for (const listener of [...(listenersByRuntime.get(runtime) ?? [])]) {
    try {
      listener(event);
    } catch (error) {
      console.error("runtime body lifecycle listener failed", error);
    }
  }
}
