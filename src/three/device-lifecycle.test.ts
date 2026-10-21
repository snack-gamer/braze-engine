import { describe, expect, it, vi } from "vitest";
import { observeGpuDeviceLoss, rendererInitializationDiagnostic } from "./device-lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("WebGPU device lifecycle", () => {
  it("publishes a structured device-loss diagnostic", async () => {
    const lost = deferred<{ reason: string; message: string }>();
    const listener = vi.fn();
    observeGpuDeviceLoss({ lost: lost.promise }, listener);

    lost.resolve({ reason: "unknown", message: "adapter reset" });
    await lost.promise;
    await Promise.resolve();

    expect(listener).toHaveBeenCalledWith({
      kind: "device-lost",
      reason: "unknown",
      message: "WebGPU device lost (unknown): adapter reset",
    });
  });

  it("ignores loss completion after viewport disposal", async () => {
    const lost = deferred<{ reason: string }>();
    const listener = vi.fn();
    const dispose = observeGpuDeviceLoss({ lost: lost.promise }, listener);
    dispose();

    lost.resolve({ reason: "destroyed" });
    await lost.promise;
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });

  it("normalizes initialization errors", () => {
    expect(rendererInitializationDiagnostic(new Error("adapter unavailable"))).toEqual({
      kind: "initialization",
      reason: "initialization-failed",
      message: "WebGPU renderer initialization failed: adapter unavailable",
    });
  });
});
