import { describe, expect, it, vi } from "vitest";
import { observeGpuDeviceLoss } from "../three/device-lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("viewport device-loss lifecycle soak", () => {
  it("suppresses 4,000 stale completions and delivers each live completion once", async () => {
    const staleCount = 4_000;
    const liveCount = 256;
    const staleListener = vi.fn();
    const liveListener = vi.fn();
    const staleDevices = Array.from({ length: staleCount }, () => {
      const lost = deferred<{ reason: string }>();
      const stopObserving = observeGpuDeviceLoss({ lost: lost.promise }, staleListener);
      stopObserving();
      return lost;
    });
    const liveDevices = Array.from({ length: liveCount }, () => {
      const lost = deferred<{ reason: string }>();
      const stopObserving = observeGpuDeviceLoss({ lost: lost.promise }, liveListener);
      return { ...lost, stopObserving };
    });

    for (const device of staleDevices) device.resolve({ reason: "destroyed" });
    for (const device of liveDevices) device.resolve({ reason: "unknown" });
    await Promise.all([
      ...staleDevices.map((device) => device.promise),
      ...liveDevices.map((device) => device.promise),
    ]);
    await Promise.resolve();

    for (const device of liveDevices) device.stopObserving();
    expect(staleListener).not.toHaveBeenCalled();
    expect(liveListener).toHaveBeenCalledTimes(liveCount);
  });
});
