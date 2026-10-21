import { describe, expect, it, vi } from "vitest";
import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";
import type { ViewportRenderer } from "../../three/renderer";
import { createThreeWebGpuRenderSession } from "./three-webgpu-render-session";
import type {
  ThreeWebGpuRenderSessionDependencies,
  ThreeWebGpuRenderSessionOptions,
} from "./three-webgpu-render-session-contract";
import type { ThreeAggregateGpuTimingController } from "./three-webgpu/telemetry/three-aggregate-gpu-timing-controller";
import type {
  ThreeWebGpuRenderHost,
  ThreeWebGpuRenderHostOptions,
  ThreeWebGpuRenderSurface,
} from "./three-webgpu-render-host";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function canvas(name: string): HTMLCanvasElement {
  return { dataset: { testName: name }, height: 1, width: 1 } as unknown as HTMLCanvasElement;
}
async function flushQueueCompletion(completion: ReturnType<typeof deferred>): Promise<void> {
  await completion.promise;
  await Promise.resolve();
  await Promise.resolve();
}

function createFixture(
  overrides: Partial<ThreeWebGpuRenderSessionOptions> = {},
  dependencyOverrides: Pick<ThreeWebGpuRenderSessionDependencies, "createGpuTimingController"> = {},
) {
  const completions: ReturnType<typeof deferred>[] = [];
  const queue = {
    onSubmittedWorkDone: vi.fn(() => {
      const completion = deferred();
      completions.push(completion);
      return completion.promise;
    }),
  };
  const device = { queue } as unknown as GPUDevice;
  const resolveTimestampsAsync = vi.fn(async () => 4);
  const renderer = {
    marker: "shared-renderer",
    resolveTimestampsAsync,
  } as unknown as ViewportRenderer;
  const renderEvents: string[] = [];
  const registered = new Map<string, {
    api: ThreeWebGpuRenderSurface;
    configure: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
  }>();
  let hostStatus: ReturnType<ThreeWebGpuRenderHost["getStatus"]> = "ready";
  let hostOptions: ThreeWebGpuRenderHostOptions | null = null;
  const hostDispose = vi.fn(() => { hostStatus = "disposed"; });
  const beginDeviceFrame = vi.fn(() => hostStatus === "initializing" || hostStatus === "ready");
  const createRenderHost = vi.fn((options: ThreeWebGpuRenderHostOptions): ThreeWebGpuRenderHost => {
    hostOptions = options;
    return {
      ready: Promise.resolve(),
      getStatus: () => hostStatus,
      beginDeviceFrame,
      execute: (submission, context) => {
        if (hostStatus !== "ready") return false;
        submission(renderer, context);
        return true;
      },
      registerSurface: (surfaceCanvas) => {
        const name = "dataset" in surfaceCanvas
          ? (surfaceCanvas as HTMLCanvasElement).dataset.testName ?? "surface"
          : "offscreen";
        let surfaceDisposed = false;
        const dispose = vi.fn(() => { surfaceDisposed = true; });
        const resize = vi.fn(() => !surfaceDisposed && hostStatus === "ready");
        const configure = vi.fn((configuration) => {
          if (surfaceDisposed || (hostStatus !== "initializing" && hostStatus !== "ready")) return false;
          renderEvents.push(`configure:${name}`);
          configuration(renderer);
          return true;
        });
        const render = vi.fn<ThreeWebGpuRenderSurface["render"]>((submission, context) => {
          if (surfaceDisposed || hostStatus !== "ready") return false;
          renderEvents.push(`select:${name}`);
          submission(renderer, context);
          return true;
        });
        const api: ThreeWebGpuRenderSurface = { configure, dispose, render, resize };
        registered.set(name, { api, configure, dispose, render, resize });
        return api;
      },
      dispose: hostDispose,
    };
  });
  let now = 100;
  const session = createThreeWebGpuRenderSession(
    {
      deviceScopeId: "device-session",
      device,
      gpuTimingEnabled: false,
      clockMilliseconds: () => now++,
      ...overrides,
    },
    { createRenderHost, ...dependencyOverrides },
  );
  return {
    beginDeviceFrame,
    completions,
    createRenderHost,
    device,
    emitHostFailure: (diagnostic: RendererFailureDiagnostic) => {
      hostStatus = "device-lost";
      hostOptions?.onFailure?.(diagnostic);
    },
    getHostOptions: () => hostOptions,
    hostDispose,
    queue,
    registered,
    renderEvents,
    renderer,
    resolveTimestampsAsync,
    session,
  };
}

describe("Three WebGPU render session", () => {
  it("owns one timing lane, flushes unique opportunities, and observes only surface submissions", async () => {
    const observeSubmission = vi.fn<ThreeAggregateGpuTimingController["observeSubmission"]>(() => true);
    const flush = vi.fn<ThreeAggregateGpuTimingController["flush"]>(() => "idle");
    const timingDispose = vi.fn();
    const timingController: ThreeAggregateGpuTimingController = {
      observeSubmission,
      flush,
      diagnostics: () => ({}) as never,
      whenSettled: () => null,
      dispose: timingDispose,
    };
    const createGpuTimingController = vi.fn(() => timingController);
    const fixture = createFixture(
      { gpuTimingEnabled: true },
      { createGpuTimingController },
    );
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const maintenance = fixture.session.registerDeviceTaskLane("maintenance");
    const first = fixture.session.opportunityForFrame(1, 16);

    expect(fixture.session.opportunityForFrame(1, 16.5)).toBe(first);
    expect(flush).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledWith(first);
    expect(scene.request(first, () => undefined)).toBe("submitted");
    expect(maintenance.request(first, () => undefined)).toBe("submitted");
    expect(observeSubmission).toHaveBeenCalledOnce();
    expect(observeSubmission).toHaveBeenCalledWith({
      submissionId: expect.any(Number),
      opportunityId: first,
      submittedAtMilliseconds: 103,
    });

    const second = fixture.session.opportunityForFrame(2, 32);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith(second);
    expect(createGpuTimingController).toHaveBeenCalledOnce();
    expect(createGpuTimingController).toHaveBeenCalledWith(expect.objectContaining({
      timestampQuerySupported: true,
      lane: expect.objectContaining({ name: "aggregate-gpu-timing" }),
      identities: expect.objectContaining({ deviceScopeId: "device-session" }),
      telemetry: expect.objectContaining({ deviceScopeId: "device-session" }),
    }));

    const disposal = fixture.session.disposeAsync();
    expect(timingDispose).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(3);
    fixture.completions[0].resolve();
    fixture.completions[1].resolve();
    fixture.completions[2].resolve();
    await disposal;
    expect(timingDispose.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.hostDispose.mock.invocationCallOrder[0],
    );
  });

  it("does not allocate a timing controller when timestamp queries are unsupported", () => {
    const createGpuTimingController = vi.fn(() => ({}) as ThreeAggregateGpuTimingController);
    const fixture = createFixture({}, { createGpuTimingController });

    fixture.session.opportunityForFrame(1, 16);

    expect(createGpuTimingController).not.toHaveBeenCalled();
    fixture.session.dispose();
  });

  it("publishes the governed Three aggregate timestamp into session diagnostics", async () => {
    const fixture = createFixture({ gpuTimingEnabled: true });
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const first = fixture.session.opportunityForFrame(1, 16);
    scene.request(first, () => undefined);

    fixture.session.opportunityForFrame(2, 32);
    await Promise.resolve();
    await Promise.resolve();

    expect(fixture.resolveTimestampsAsync).toHaveBeenCalledOnce();
    expect(fixture.resolveTimestampsAsync).toHaveBeenCalledWith("render");
    expect(fixture.session.diagnostics().gpuPassTiming).toEqual({
      status: "available",
      passes: [{
        passId: "three-render-aggregate-window",
        sampleCount: 1,
        totalMilliseconds: 4,
        p50Milliseconds: 4,
        p95Milliseconds: 4,
        p99Milliseconds: 4,
      }],
    });
    fixture.session.opportunityForFrame(3, 48);
    expect(fixture.resolveTimestampsAsync).toHaveBeenCalledOnce();
    fixture.session.dispose();
  });

  it("records one truthful device timeline without owning a hidden RAF", async () => {
    const fixture = createFixture({ gpuTimingEnabled: true });
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    await fixture.session.ready;
    expect(scene.configure((renderer) => {
      expect(renderer).toBe(fixture.renderer);
      fixture.renderEvents.push("configured:scene");
    })).toBe(true);
    expect(fixture.session.summarize()).toMatchObject({
      rafOpportunities: 0,
      renderAttempts: 0,
      submittedRenderAttempts: 0,
    });
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    expect(fixture.beginDeviceFrame).toHaveBeenCalledOnce();

    expect(scene.request(opportunity, (renderer) => {
      expect(renderer).toBe(fixture.renderer);
      fixture.renderEvents.push("render:scene");
    })).toBe("submitted");

    expect(fixture.createRenderHost).toHaveBeenCalledOnce();
    expect(fixture.getHostOptions()?.rendererOptions).toMatchObject({
      device: fixture.device,
      trackTimestamp: true,
    });
    expect(fixture.renderEvents).toEqual([
      "configure:scene",
      "configured:scene",
      "select:scene",
      "render:scene",
    ]);
    expect(fixture.session.summarize()).toMatchObject({
      deviceScopeId: "device-session",
      rafOpportunities: 1,
      renderAttempts: 1,
      pendingRenderAttempts: 0,
      submittedRenderAttempts: 1,
      retiredRenderSubmissions: 0,
    });

    fixture.completions[0].resolve();
    await flushQueueCompletion(fixture.completions[0]);
    expect(fixture.session.summarize().retiredRenderSubmissions).toBe(1);
    expect(scene.resize({ width: 640, height: 360, pixelRatio: 2 })).toBe(true);
    expect(fixture.beginDeviceFrame).toHaveBeenCalledOnce();
    const disposal = fixture.session.disposeAsync();
    await Promise.resolve();
    for (const completion of fixture.completions) completion.resolve();
    await disposal;
    expect(fixture.hostDispose).toHaveBeenCalledOnce();
    expect(fixture.session.getStatus()).toBe("disposed");
  });

  it("records one opportunity for a shared monotonic device frame index", () => {
    const fixture = createFixture();

    const first = fixture.session.opportunityForFrame(10, 16);
    expect(fixture.session.opportunityForFrame(10, 16.5)).toBe(first);
    const next = fixture.session.opportunityForFrame(12, 32);

    expect(next).not.toBe(first);
    expect(fixture.beginDeviceFrame).toHaveBeenCalledTimes(2);
    expect(fixture.session.summarize().rafOpportunities).toBe(2);
    expect(() => fixture.session.opportunityForFrame(11, 48)).toThrow("older than frame 12");
    expect(() => fixture.session.opportunityForFrame(-1, 48)).toThrow("non-negative safe integer");
    fixture.session.dispose();
  });

  it("keeps surface resize state independent and outside frame telemetry", () => {
    const fixture = createFixture();
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const game = fixture.session.registerSurface("game", canvas("game"));

    expect(scene.resize({ width: 640, height: 360, pixelRatio: 2 })).toBe(true);
    expect(game.resize({ width: 1920, height: 1080, pixelRatio: 1 })).toBe(true);
    expect(fixture.registered.get("scene")?.resize).toHaveBeenCalledWith({
      width: 640,
      height: 360,
      pixelRatio: 2,
    });
    expect(fixture.registered.get("game")?.resize).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      pixelRatio: 1,
    });
    expect(fixture.beginDeviceFrame).not.toHaveBeenCalled();
    expect(fixture.session.summarize()).toMatchObject({
      rafOpportunities: 0,
      renderAttempts: 0,
      submittedRenderAttempts: 0,
    });
    fixture.session.dispose();
  });

  it("coalesces callbacks per surface without starving another surface", async () => {
    const fixture = createFixture({ maxEpochsInFlight: 1 });
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const game = fixture.session.registerSurface("game", canvas("game"));
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    const renders: string[] = [];

    expect(scene.request(opportunity, () => renders.push("scene-first"))).toBe("submitted");
    expect(scene.request(opportunity, () => renders.push("scene-old"))).toBe("queued");
    expect(game.request(opportunity, () => renders.push("game"))).toBe("queued");
    expect(scene.request(opportunity, () => renders.push("scene-latest"))).toBe("queued");
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 4,
      submittedRenderAttempts: 1,
      pendingRenderAttempts: 2,
      rejectedRenderAttempts: 1,
      coalescedRenderAttempts: 1,
    });

    fixture.completions[0].resolve();
    await flushQueueCompletion(fixture.completions[0]);
    expect(renders).toEqual(["scene-first", "scene-latest"]);
    expect(scene.request(opportunity, () => renders.push("scene-after"))).toBe("queued");

    fixture.completions[1].resolve();
    await flushQueueCompletion(fixture.completions[1]);
    expect(renders).toEqual(["scene-first", "scene-latest", "game"]);
    fixture.completions[2].resolve();
    await flushQueueCompletion(fixture.completions[2]);
    expect(renders).toEqual(["scene-first", "scene-latest", "game", "scene-after"]);
    fixture.completions[3].resolve();
    await flushQueueCompletion(fixture.completions[3]);

    expect(renders).not.toContain("scene-old");
    expect(fixture.registered.get("scene")?.render).toHaveBeenCalledTimes(3);
    expect(fixture.registered.get("game")?.render).toHaveBeenCalledOnce();
    expect(fixture.beginDeviceFrame).toHaveBeenCalledOnce();
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 5,
      pendingRenderAttempts: 0,
      submittedRenderAttempts: 4,
      rejectedRenderAttempts: 1,
      retiredRenderSubmissions: 4,
    });
    fixture.session.dispose();
  });

  it("settles queued attempts when the shared device is lost", async () => {
    const observerFailure = new Error("failure observer failed");
    const onError = vi.fn();
    const onRendererFailure = vi.fn(() => { throw observerFailure; });
    const fixture = createFixture({ maxEpochsInFlight: 1, onError, onRendererFailure });
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const game = fixture.session.registerSurface("game", canvas("game"));
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    scene.request(opportunity, () => undefined);
    game.request(opportunity, () => fixture.renderEvents.push("unexpected-game-render"));
    const diagnostic: RendererFailureDiagnostic = {
      kind: "device-lost",
      reason: "unknown",
      message: "WebGPU device lost (unknown): reset",
    };

    expect(() => fixture.emitHostFailure(diagnostic)).not.toThrow();
    expect(onRendererFailure).toHaveBeenCalledWith(diagnostic);
    expect(onError).toHaveBeenCalledWith(observerFailure);
    expect(fixture.session.getStatus()).toBe("disposed");
    expect(scene.configure(() => undefined)).toBe(false);
    expect(scene.request(opportunity, () => undefined)).toBe("rejected");
    expect(() => fixture.session.opportunityForFrame(2, 32)).toThrow("disposed render session");
    expect(() => fixture.session.registerSurface("late", canvas("late"))).toThrow(
      "disposed render session",
    );
    expect(() => fixture.session.registerDeviceTaskLane("late-task")).toThrow(
      "disposed render session",
    );
    expect(fixture.renderEvents).not.toContain("unexpected-game-render");
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 2,
      pendingRenderAttempts: 0,
      submittedRenderAttempts: 1,
      rejectedRenderAttempts: 1,
    });
    const disposal = fixture.session.disposeAsync();
    expect(fixture.session.disposeAsync()).toBe(disposal);
    await disposal;
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(fixture.registered.get("scene")?.dispose).toHaveBeenCalledOnce();
    expect(fixture.registered.get("game")?.dispose).toHaveBeenCalledOnce();
    expect(fixture.hostDispose).toHaveBeenCalledOnce();

    fixture.completions[0].resolve();
    await flushQueueCompletion(fixture.completions[0]);
    expect(fixture.session.summarize().retiredRenderSubmissions).toBe(0);
  });

  it("abandons a pending graceful fence when the device is permanently lost", async () => {
    const fixture = createFixture();
    fixture.session.registerSurface("scene", canvas("scene"));
    await fixture.session.ready;

    const disposal = fixture.session.disposeAsync();
    await Promise.resolve();
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(fixture.hostDispose).not.toHaveBeenCalled();

    fixture.emitHostFailure({
      kind: "device-lost",
      reason: "unknown",
      message: "WebGPU device lost (unknown): reset",
    });
    await disposal;

    expect(fixture.hostDispose).toHaveBeenCalledOnce();
    expect(fixture.registered.get("scene")?.dispose).toHaveBeenCalledOnce();
    fixture.completions[0].resolve();
    await flushQueueCompletion(fixture.completions[0]);
  });

  it("keeps stale named surface leases from affecting replacements", async () => {
    const fixture = createFixture({ maxEpochsInFlight: 1 });
    const blocker = fixture.session.registerSurface("blocker", canvas("blocker"));
    const stale = fixture.session.registerSurface("game", canvas("game-old"));
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    blocker.request(opportunity, () => undefined);
    stale.request(opportunity, () => fixture.renderEvents.push("stale-render"));
    stale.dispose();
    const replacement = fixture.session.registerSurface("game", canvas("game-new"));
    replacement.request(opportunity, () => fixture.renderEvents.push("replacement-render"));

    expect(stale.request(opportunity, () => undefined)).toBe("rejected");
    expect(stale.resize({ width: 1, height: 1, pixelRatio: 1 })).toBe(false);
    fixture.completions[0].resolve();
    await flushQueueCompletion(fixture.completions[0]);

    expect(fixture.renderEvents).not.toContain("stale-render");
    expect(fixture.renderEvents).toContain("replacement-render");
    fixture.session.dispose();
  });

  it("takes the final fence only after a re-entrant disposal callback submits its work", async () => {
    const fixture = createFixture({ maxEpochsInFlight: 1 });
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const game = fixture.session.registerSurface("game", canvas("game"));
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);

    let disposal: Promise<void> | null = null;
    expect(scene.request(opportunity, () => {
      expect(game.request(opportunity, () => fixture.renderEvents.push("unexpected-game"))).toBe(
        "queued",
      );
      disposal = fixture.session.disposeAsync();
      expect(fixture.session.getStatus()).toBe("disposed");
      expect(fixture.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
      expect(fixture.hostDispose).not.toHaveBeenCalled();
    })).toBe("submitted");

    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(fixture.hostDispose).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(2);
    expect(disposal).not.toBeNull();
    expect(fixture.hostDispose).not.toHaveBeenCalled();
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 2,
      submittedRenderAttempts: 1,
      rejectedRenderAttempts: 1,
      pendingRenderAttempts: 0,
      retiredRenderSubmissions: 0,
    });
    expect(fixture.renderEvents).not.toContain("unexpected-game");
    fixture.completions[1].resolve();
    await disposal!;
    expect(fixture.hostDispose).toHaveBeenCalledOnce();
    expect(fixture.session.summarize().retiredRenderSubmissions).toBe(0);
  });

  it("holds a failed recording behind its queue fence before admitting later work", async () => {
    const onError = vi.fn();
    const fixture = createFixture({ maxEpochsInFlight: 1, onError });
    const scene = fixture.session.registerSurface("scene", canvas("scene"));
    const game = fixture.session.registerSurface("game", canvas("game"));
    await fixture.session.ready;
    const opportunity = fixture.session.opportunityForFrame(1, 16);
    const failure = new Error("recording failed");
    let failedRetirement: Promise<"completed" | "failed" | "cancelled"> | null = null;
    const laterRender = vi.fn();

    expect(scene.request(opportunity, (_renderer, context) => {
      failedRetirement = context!.retirement;
      throw failure;
    })).toBe("rejected");
    expect(game.request(opportunity, laterRender)).toBe("queued");
    expect(onError).toHaveBeenCalledWith(failure);
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(laterRender).not.toHaveBeenCalled();
    expect(fixture.session.summarize()).toMatchObject({
      renderAttempts: 2,
      pendingRenderAttempts: 1,
      submittedRenderAttempts: 1,
      rejectedRenderAttempts: 0,
    });

    fixture.completions[0].resolve();
    await flushQueueCompletion(fixture.completions[0]);
    await expect(failedRetirement!).resolves.toBe("failed");
    expect(laterRender).toHaveBeenCalledOnce();
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(2);

    fixture.completions[1].resolve();
    await flushQueueCompletion(fixture.completions[1]);
    expect(fixture.session.summarize()).toMatchObject({
      pendingRenderAttempts: 0,
      submittedRenderAttempts: 2,
      rejectedRenderAttempts: 0,
      retiredRenderSubmissions: 2,
    });

    const disposal = fixture.session.disposeAsync();
    await Promise.resolve();
    fixture.completions[2].resolve();
    await disposal;
  });
});
