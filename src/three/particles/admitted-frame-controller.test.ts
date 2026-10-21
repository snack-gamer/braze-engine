import { describe, expect, it, vi } from "vitest";
import { createParticleAdmittedFrameController } from "./admitted-frame-controller";

describe("particle admitted-frame controller", () => {
  it("does no GPU work before prepareRender and coalesces skipped-frame time", () => {
    const syncGpuForAdmittedRender = vi.fn();
    const tickGpuForAdmittedRender = vi.fn();
    const setEnabled = vi.fn();
    const particles = {
      isActive: vi.fn(() => true),
      syncGpuForAdmittedRender,
      tickGpuForAdmittedRender,
    };
    const controller = createParticleAdmittedFrameController({
      particles: () => particles,
      objects: () => [],
      objectMap: new Map(),
      basePassBridge: { setEnabled },
    });

    expect(controller.observeFrame(0.016, true)).toBe(true);
    expect(controller.observeFrame(0.016, true)).toBe(true);
    expect(syncGpuForAdmittedRender).not.toHaveBeenCalled();
    expect(tickGpuForAdmittedRender).not.toHaveBeenCalled();
    expect(setEnabled).not.toHaveBeenCalled();

    controller.prepareRender();

    expect(syncGpuForAdmittedRender).toHaveBeenCalledOnce();
    expect(tickGpuForAdmittedRender).toHaveBeenCalledWith(0.032);
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it("disables the bridge and clears backlog when no particle runtime exists", () => {
    const setEnabled = vi.fn();
    let particles: null | {
      isActive: () => boolean;
      syncGpuForAdmittedRender: () => void;
      tickGpuForAdmittedRender: (delta: number) => void;
    } = null;
    const controller = createParticleAdmittedFrameController({
      particles: () => particles,
      objects: () => [],
      objectMap: new Map(),
      basePassBridge: { setEnabled },
    });

    controller.observeFrame(0.1, true);
    controller.prepareRender();
    expect(setEnabled).toHaveBeenCalledWith(false);

    const tick = vi.fn();
    particles = {
      isActive: () => true,
      syncGpuForAdmittedRender: vi.fn(),
      tickGpuForAdmittedRender: tick,
    };
    controller.prepareRender();
    expect(tick).not.toHaveBeenCalled();
  });
});
