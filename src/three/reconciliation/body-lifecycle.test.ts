import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Runtime } from "../runtime";
import {
  emitRuntimeBodyLifecycle,
  subscribeRuntimeBodyLifecycle,
} from "./body-lifecycle";

function event(node: THREE.Group) {
  return {
    phase: "didChange" as const,
    objectId: "hero",
    node,
    previousBody: null,
    nextBody: new THREE.Group(),
    nextKind: "asset" as const,
  };
}

describe("runtime body lifecycle", () => {
  it("scopes listeners to one runtime and detaches idempotently", () => {
    const first = {} as Runtime;
    const second = {} as Runtime;
    const node = new THREE.Group();
    const listener = vi.fn();
    const unsubscribe = subscribeRuntimeBodyLifecycle(first, listener);

    emitRuntimeBodyLifecycle(second, event(node));
    emitRuntimeBodyLifecycle(first, event(node));
    unsubscribe();
    unsubscribe();
    emitRuntimeBodyLifecycle(first, event(node));

    expect(listener).toHaveBeenCalledOnce();
  });

  it("isolates a faulty listener from the reconciliation caller", () => {
    const runtime = {} as Runtime;
    const node = new THREE.Group();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unsubscribe = subscribeRuntimeBodyLifecycle(runtime, () => {
      throw new Error("listener failed");
    });

    expect(() => emitRuntimeBodyLifecycle(runtime, event(node))).not.toThrow();
    expect(logged).toHaveBeenCalledOnce();
    unsubscribe();
    logged.mockRestore();
  });
});
