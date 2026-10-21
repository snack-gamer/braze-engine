import { describe, expect, it, vi } from "vitest";
import type { ViewportRenderer } from "../../three/renderer";
import { createThreeWebGpuRenderSession } from "./three-webgpu-render-session";
import type { ThreeWebGpuRenderSessionOptions } from "./three-webgpu-render-session-contract";
import type {
  ThreeWebGpuRenderHost,
  ThreeWebGpuRenderSurface,
} from "./three-webgpu-render-host";

describe("Three WebGPU render session device-task lanes", () => {
  it("retires detached resources after the current submission without stopping other lanes", async () => {
    const fixture = createFixture(); await fixture.session.ready;
    const lane = fixture.session.registerDeviceTaskLane("lifecycle");
    let retired = false, retirement!: Promise<void>;
    lane.request(fixture.session.opportunityForFrame(1, 16), () => {
      retirement = fixture.session.retireResources().then(() => { retired = true; });
      expect(fixture.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    });
    await flushCompletion();
    expect(fixture.completions).toHaveLength(2); expect(retired).toBe(false);
    fixture.completions[0].resolve(); await flushCompletion(); expect(retired).toBe(false);
    fixture.completions[1].resolve(); await retirement; expect(retired).toBe(true);
    expect(fixture.session.getStatus()).toBe("ready");
    const disposal = fixture.session.disposeAsync(); await flushCompletion(); fixture.completions[2].resolve(); await disposal;
  });
  it("shares fair queue admission and RAF telemetry without registering a canvas target", async () => {
    const fixture = createFixture({ maxEpochsInFlight: 1 });
    const probe = fixture.session.registerDeviceTaskLane("reflection-probe");
    expect(fixture.registerSurface).not.toHaveBeenCalled();
    const scene = fixture.session.registerSurface("scene", {} as HTMLCanvasElement);
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    const executed: string[] = [];

    expect(probe.request(opportunity, (renderer) => {
      expect(renderer).toBe(fixture.renderer);
      executed.push("probe-first");
    })).toBe("submitted");
    expect(probe.request(opportunity, () => executed.push("probe-old"))).toBe("queued");
    expect(scene.request(opportunity, () => executed.push("scene"))).toBe("queued");
    expect(probe.request(opportunity, () => executed.push("probe-latest"))).toBe("queued");

    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.registerSurface).toHaveBeenCalledOnce();
    expect(fixture.session.summarize()).toMatchObject({
      rafOpportunities: 1,
      renderAttempts: 4,
      submittedRenderAttempts: 1,
      pendingRenderAttempts: 2,
      rejectedRenderAttempts: 1,
      coalescedRenderAttempts: 1,
    });

    fixture.completions[0].resolve();
    await flushCompletion();
    expect(executed).toEqual(["probe-first", "probe-latest"]);
    fixture.completions[1].resolve();
    await flushCompletion();
    expect(executed).toEqual(["probe-first", "probe-latest", "scene"]);
    fixture.completions[2].resolve();
    await flushCompletion();

    expect(executed).not.toContain("probe-old");
    expect(fixture.execute).toHaveBeenCalledTimes(2);
    expect(fixture.renderSurface).toHaveBeenCalledOnce();
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 4,
      submittedRenderAttempts: 3,
      rejectedRenderAttempts: 1,
      retiredRenderSubmissions: 3,
      pendingRenderAttempts: 0,
    });
    fixture.session.dispose();
  });

  it("releases named task lanes and fences a failed synchronous recording", async () => {
    const failure = new Error("probe recording failed");
    const onError = vi.fn();
    const fixture = createFixture({ onError });
    const stale = fixture.session.registerDeviceTaskLane("reflection-probe");
    expect(() => fixture.session.registerDeviceTaskLane("reflection-probe")).toThrow(
      "already registered",
    );
    stale.dispose();
    const replacement = fixture.session.registerDeviceTaskLane("reflection-probe");
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    let failedRetirement: Promise<"completed" | "failed" | "cancelled"> | null = null;

    expect(stale.request(opportunity, () => undefined)).toBe("rejected");
    expect(replacement.request(opportunity, (_renderer, context) => {
      failedRetirement = context!.retirement;
      throw failure;
    })).toBe("rejected");
    expect(onError).toHaveBeenCalledWith(failure);
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 1,
      submittedRenderAttempts: 1,
      rejectedRenderAttempts: 0,
    });

    fixture.completions[0].resolve();
    await flushCompletion();
    await expect(failedRetirement!).resolves.toBe("failed");

    const disposal = fixture.session.disposeAsync();
    await Promise.resolve();
    fixture.completions[1].resolve();
    await disposal;
    expect(replacement.request(opportunity, () => undefined)).toBe("rejected");
    expect(fixture.hostDispose).toHaveBeenCalledOnce();
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}

async function flushCompletion(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createFixture(overrides: Partial<ThreeWebGpuRenderSessionOptions> = {}) {
  const completions: ReturnType<typeof deferred>[] = [];
  const queue = {
    onSubmittedWorkDone: vi.fn(() => {
      const completion = deferred();
      completions.push(completion);
      return completion.promise;
    }),
  };
  const device = { queue } as unknown as GPUDevice;
  const renderer = { marker: "shared-renderer" } as unknown as ViewportRenderer;
  const execute = vi.fn<ThreeWebGpuRenderHost["execute"]>((submission, context) => {
    submission(renderer, context);
    return true;
  });
  const renderSurface = vi.fn<ThreeWebGpuRenderSurface["render"]>((submission, context) => {
    submission(renderer, context);
    return true;
  });
  const hostDispose = vi.fn();
  const registerSurface = vi.fn((): ThreeWebGpuRenderSurface => ({
    configure: () => true,
    render: renderSurface,
    resize: () => true,
    dispose: vi.fn(),
  }));
  const host: ThreeWebGpuRenderHost = {
    ready: Promise.resolve(),
    getStatus: () => "ready",
    beginDeviceFrame: () => true,
    execute,
    registerSurface,
    dispose: hostDispose,
  };
  let now = 100;
  const session = createThreeWebGpuRenderSession({
    deviceScopeId: "device-task-test",
    device,
    gpuTimingEnabled: false,
    clockMilliseconds: () => now++,
    ...overrides,
  }, { createRenderHost: () => host });
  return {
    completions,
    execute,
    hostDispose,
    queue,
    registerSurface,
    renderer,
    renderSurface,
    session,
  };
}
