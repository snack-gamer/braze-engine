import { describe, expect, it, vi } from "vitest";
import type { ThreeWebGpuRenderSession } from "../../rendering/adapters/three-webgpu-render-session-contract";
import { EngineLoop } from "../../runtime/engine-loop";
import type { ViewportRenderer } from "../../three/renderer";
import { AssetPreviewRenderSurface } from "./asset-preview-render-surface";

function deferred() {
  let resolve!: (status: "completed" | "failed" | "cancelled") => void;
  const promise = new Promise<"completed" | "failed" | "cancelled">((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(dispositions: Array<"submitted" | "queued" | "rejected">) {
  const frames: Array<(now: number) => void> = [];
  const loop = new EngineLoop({
    requestFrame: vi.fn((callback) => {
      frames.push(callback);
      return frames.length;
    }),
    cancelFrame: vi.fn(),
    reportError: vi.fn(),
  });
  const completion = deferred();
  const renderer = {} as ViewportRenderer;
  const resize = vi.fn(() => true);
  const disposeSurface = vi.fn();
  const request = vi.fn((_opportunity, submission: (
    value: ViewportRenderer,
    context: { retirement: Promise<"completed" | "failed" | "cancelled"> },
  ) => void) => {
    const disposition = dispositions.shift() ?? "rejected";
    if (disposition === "submitted") submission(renderer, { retirement: completion.promise });
    return disposition;
  });
  const session = {
    ready: Promise.resolve(),
    getStatus: () => "ready",
    opportunityForFrame: vi.fn(() => "opportunity"),
    registerSurface: vi.fn(() => ({
      name: "asset-preview:test",
      configure: () => true,
      request,
      resize,
      dispose: disposeSurface,
    })),
    registerDeviceTaskLane: vi.fn(),
    diagnostics: vi.fn(),
    summarize: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ThreeWebGpuRenderSession;
  const canvasToObjectUrl = vi.fn(async () => "blob:preview");
  const renderScene = vi.fn();
  const canvas = {} as HTMLCanvasElement;
  const surface = new AssetPreviewRenderSurface(session, {
    engineLoop: loop,
    canvas,
    renderScene,
    canvasToObjectUrl,
    disposeObjectUrl: vi.fn(),
  });
  return {
    canvasToObjectUrl,
    completion,
    disposeSurface,
    frames,
    renderScene,
    request,
    resize,
    surface,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AssetPreviewRenderSurface", () => {
  it("releases its registered surface when participant construction fails", () => {
    const failure = new Error("participant construction failed");
    const cleanupFailure = new Error("surface cleanup failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loop = new EngineLoop({
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
      reportError: vi.fn(),
    });
    vi.spyOn(loop, "createParticipant").mockImplementation(() => { throw failure; });
    const disposeSurface = vi.fn(() => { throw cleanupFailure; });
    const session = {
      registerSurface: vi.fn(() => ({
        name: "asset-preview:construction-failure",
        configure: vi.fn(() => true),
        request: vi.fn(() => "rejected" as const),
        resize: vi.fn(() => true),
        dispose: disposeSurface,
      })),
    } as unknown as ThreeWebGpuRenderSession;

    expect(() => new AssetPreviewRenderSurface(session, {
      engineLoop: loop,
      canvas: {} as HTMLCanvasElement,
      renderScene: vi.fn(),
      canvasToObjectUrl: vi.fn(async () => null),
      disposeObjectUrl: vi.fn(),
    })).toThrow(failure);
    expect(disposeSurface).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      "[asset-preview] Failed to dispose asset preview construction resource.",
      cleanupFailure,
    );
    report.mockRestore();
  });

  it("settles active work and continues normal disposal after cleanup failure", async () => {
    const cleanupFailure = new Error("frame cancellation failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loop = new EngineLoop({
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
      reportError: vi.fn(),
    });
    const participant = {
      requestFrame: vi.fn(),
      cancelFrame: vi.fn(() => { throw cleanupFailure; }),
      dispose: vi.fn(),
    };
    vi.spyOn(loop, "createParticipant").mockReturnValue(participant);
    const disposeSurface = vi.fn();
    const session = {
      registerSurface: vi.fn(() => ({
        name: "asset-preview:normal-disposal",
        configure: vi.fn(() => true),
        request: vi.fn(() => "rejected" as const),
        resize: vi.fn(() => true),
        dispose: disposeSurface,
      })),
    } as unknown as ThreeWebGpuRenderSession;
    const owned = new AssetPreviewRenderSurface(session, {
      engineLoop: loop,
      canvas: {} as HTMLCanvasElement,
      renderScene: vi.fn(),
      canvasToObjectUrl: vi.fn(async () => null),
      disposeObjectUrl: vi.fn(),
    });
    const result = owned.render(
      {} as never,
      {} as never,
      { width: 64, height: 64 },
      new AbortController().signal,
    );

    owned.dispose();
    owned.dispose();

    await expect(result).resolves.toBeNull();
    expect(participant.cancelFrame).toHaveBeenCalledOnce();
    expect(participant.dispose).toHaveBeenCalledOnce();
    expect(disposeSurface).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      "[asset-preview] Failed to dispose asset preview frame request.",
      cleanupFailure,
    );
    report.mockRestore();
  });

  it("reoffers queued work and reads the hidden canvas only after GPU completion", async () => {
    const test = fixture(["queued", "submitted"]);
    const result = test.surface.render(
      {} as never,
      {} as never,
      { width: 192, height: 192 },
      new AbortController().signal,
    );

    test.frames.shift()?.(16);
    expect(test.request).toHaveBeenCalledOnce();
    expect(test.renderScene).not.toHaveBeenCalled();
    expect(test.frames).toHaveLength(1);

    test.frames.shift()?.(32);
    expect(test.renderScene).toHaveBeenCalledOnce();
    expect(test.canvasToObjectUrl).not.toHaveBeenCalled();
    test.completion.resolve("completed");
    await flush();

    await expect(result).resolves.toBe("blob:preview");
    expect(test.resize).toHaveBeenCalledWith({ width: 192, height: 192, pixelRatio: 1 });
    test.surface.dispose();
    expect(test.disposeSurface).toHaveBeenCalledOnce();
  });

  it("settles rejected and disposed queued work without reading stale pixels", async () => {
    const rejected = fixture(["rejected"]);
    const rejectedResult = rejected.surface.render(
      {} as never,
      {} as never,
      { width: 512, height: 352 },
      new AbortController().signal,
    );
    rejected.frames.shift()?.(16);
    await expect(rejectedResult).resolves.toBeNull();
    expect(rejected.canvasToObjectUrl).not.toHaveBeenCalled();

    const queued = fixture(["queued"]);
    const queuedResult = queued.surface.render(
      {} as never,
      {} as never,
      { width: 192, height: 192 },
      new AbortController().signal,
    );
    queued.frames.shift()?.(16);
    queued.surface.dispose();
    await expect(queuedResult).resolves.toBeNull();
    expect(queued.canvasToObjectUrl).not.toHaveBeenCalled();
  });

  it("retains submitted preview work until its governed GPU retirement", async () => {
    const test = fixture(["submitted"]);
    const result = test.surface.render(
      {} as never,
      {} as never,
      { width: 192, height: 192 },
      new AbortController().signal,
    );
    let settled = false;
    void result.then(() => { settled = true; });

    test.frames.shift()?.(16);
    test.surface.dispose();
    await flush();

    expect(settled).toBe(false);
    expect(test.canvasToObjectUrl).not.toHaveBeenCalled();
    test.completion.resolve("completed");
    await expect(result).resolves.toBeNull();
    expect(test.canvasToObjectUrl).not.toHaveBeenCalled();
  });
});
