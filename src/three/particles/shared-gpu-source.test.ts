import { afterEach, describe, expect, it, vi } from "vitest";
import { createSharedParticleGpuResolver, resolveSharedParticleGpu } from "./shared-gpu-source";

afterEach(() => vi.unstubAllGlobals());

describe("shared particle GPU source", () => {
  it("reads the already-initialized session device without scheduling another clock", () => {
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    const device = {} as GPUDevice;

    expect(resolveSharedParticleGpu({
      device: () => device,
      colorFormat: () => "rgba16float",
    })).toEqual({ status: "ready", gpu: { device, colorFormat: "rgba16float" } });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("returns a clear unavailable result for viewport-sync retry", () => {
    expect(resolveSharedParticleGpu({ device: () => null, colorFormat: () => "rgba16float" })).toEqual({
      status: "unavailable",
      detail: "the shared render-session device is not ready",
    });
    expect(resolveSharedParticleGpu({ device: () => ({} as GPUDevice) })).toEqual({
      status: "unavailable",
      detail: "the shared render-session color-format provider is missing",
    });
  });

  it("retries on each sync read while reporting the same failure only once", () => {
    const device = vi.fn(() => null);
    const report = vi.fn();
    const resolve = createSharedParticleGpuResolver({
      device,
      colorFormat: () => "rgba16float",
    }, report);

    expect(resolve()).toBeNull();
    expect(resolve()).toBeNull();

    expect(device).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      "the shared render-session device is not ready; particle initialization will retry on viewport sync.",
    );
  });
});
