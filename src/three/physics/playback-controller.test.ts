import { afterEach, describe, expect, it, vi } from "vitest";
import type { Renderer } from "three/webgpu";
import { rigidPlaybackBackend } from "./rigid-playback-backend";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuDeviceTaskLane,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { ThreeWebGpuRenderSubmission } from "../../rendering/adapters/three-webgpu-render-host";
import type { Runtime } from "../runtime";
import { createPhysicsPlaybackController } from "./playback-controller";

afterEach(() => vi.restoreAllMocks());

describe("Physics playback controller device preparation", () => {
  it("keeps rejected preparation retryable without starting device work", () => {
    const prepare = vi.spyOn(rigidPlaybackBackend, "prepare");
    const lane = fakeLane(() => "rejected");
    const runtime = fakeRuntime();
    const controller = createPhysicsPlaybackController(lane, runtime.requestFrame);

    controller.prepare(runtime.renderer);
    expect(runtime.requestFrame).toHaveBeenCalled();
    expect(controller.hasPendingDeviceWork()).toBe(true);
    expect(controller.schedule(editSchedule(runtime, 1))).toBe(false);
    expect(controller.schedule(editSchedule(runtime, 2))).toBe(false);

    expect(lane.request).toHaveBeenCalledTimes(2);
    expect(prepare).not.toHaveBeenCalled();
    expect(controller.hasPendingAdmission()).toBe(false);
    expect(controller.hasPendingDeviceWork()).toBe(true);
    controller.dispose();
    expect(lane.dispose).toHaveBeenCalledOnce();
    expect(controller.hasPendingDeviceWork()).toBe(false);
  });

  it("starts async pipeline preparation only from the admitted callback", async () => {
    const factory = { createWorld: vi.fn() };
    const prepare = vi.spyOn(rigidPlaybackBackend, "prepare").mockResolvedValue(factory as never);
    let queued: ThreeWebGpuRenderSubmission | null = null;
    const lane = fakeLane((_opportunity, submission) => {
      queued = submission;
      return "queued";
    });
    const runtime = fakeRuntime();
    const controller = createPhysicsPlaybackController(lane, runtime.requestFrame);

    controller.prepare(runtime.renderer);
    expect(controller.schedule(editSchedule(runtime, 1))).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(controller.hasPendingAdmission()).toBe(true);

    const executeQueued = queued as ThreeWebGpuRenderSubmission | null;
    if (!executeQueued) throw new Error("Expected queued preparation work.");
    const device = { createBuffer: vi.fn() } as unknown as GPUDevice;
    executeQueued(
      { backend: { device, isWebGPUBackend: true } } as unknown as Renderer,
      { retirement: Promise.resolve("completed") },
    );
    expect(prepare).toHaveBeenCalledWith(device);
    expect(controller.hasPendingAdmission()).toBe(false);
    expect(controller.hasPendingDeviceWork()).toBe(true);
    await flushPromises();
    expect(controller.hasPendingDeviceWork()).toBe(false);
    controller.dispose();
  });
});

function editSchedule(runtime: Runtime, opportunity: number) {
  return {
    renderer: runtime.renderer,
    objects: [],
    worldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS,
    mode: "edit" as const,
    stepToken: 0,
    frameDeltaSeconds: 1 / 60,
    opportunity: opportunity as DeviceRenderOpportunity,
  };
}

function fakeRuntime(): Runtime {
  return {
    disposed: false,
    framesSinceSceneChange: 3,
    requestFrame: vi.fn(),
    renderer: {},
  } as unknown as Runtime;
}

function fakeLane(request: ThreeWebGpuDeviceTaskLane["request"]): ThreeWebGpuDeviceTaskLane {
  return {
    name: "scene:physics",
    request: vi.fn(request),
    dispose: vi.fn(),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
