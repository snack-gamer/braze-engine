import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  createRoot: vi.fn(),
  createTimelinePlayback: vi.fn(),
  decodePlayerPackage: vi.fn(),
  installImportDocuments: vi.fn(),
  installImportSettings: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  default: { createRoot: mocks.createRoot },
}));
vi.mock("../../assets/application/model-import-document-provider", () => ({
  installBundledModelImportDocuments: mocks.installImportDocuments,
}));
vi.mock("../../rendering/application/browser-render-session-owner", () => ({
  sharedBrowserRenderSessionOwner: () => ({ acquire: mocks.acquire }),
}));
vi.mock("../../three/model-import-settings", () => ({
  installBundledModelImportSettings: mocks.installImportSettings,
}));
vi.mock("../components/PlayerApplication", () => ({ PlayerApplication: () => null }));
vi.mock("../runtime/player-timeline-playback", () => ({
  createPlayerTimelinePlayback: mocks.createTimelinePlayback,
}));
vi.mock("../serialization/player-package-codec", () => ({
  decodePlayerPackage: mocks.decodePlayerPackage,
}));

import { mountPlayer } from "./mount-player";

describe("mountPlayer lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { search: "" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not acquire or install resources when startup was already aborted", async () => {
    const harness = installHarness();
    const startup = new AbortController();
    const abortReason = new DOMException("page hidden", "AbortError");
    startup.abort(abortReason);

    await expect(mountPlayer(harness.rootElement, {}, { signal: startup.signal }))
      .rejects.toBe(abortReason);

    expect(mocks.decodePlayerPackage).not.toHaveBeenCalled();
    expect(mocks.installImportDocuments).not.toHaveBeenCalled();
    expect(mocks.installImportSettings).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.createRoot).not.toHaveBeenCalled();
  });

  it("cleans provisional resources and a session that arrives after abort", async () => {
    const acquisition = deferred<BrowserThreeWebGpuRenderSession>();
    const session = fakeSession();
    const harness = installHarness();
    mocks.acquire.mockReturnValue(acquisition.promise);
    const startup = new AbortController();
    const abortReason = new DOMException("startup replaced", "AbortError");
    const mounted = mountPlayer(harness.rootElement, {}, { signal: startup.signal });
    await vi.waitFor(() => expect(mocks.acquire).toHaveBeenCalledOnce());

    startup.abort(abortReason);
    acquisition.resolve(session);

    await expect(mounted).rejects.toBe(abortReason);
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(harness.timeline.start).not.toHaveBeenCalled();
    expect(harness.timeline.dispose).toHaveBeenCalledOnce();
    expect(harness.uninstallImportSettings).toHaveBeenCalledOnce();
    expect(harness.uninstallImportDocuments).toHaveBeenCalledOnce();
    expect(mocks.createRoot).not.toHaveBeenCalled();
  });

  it("disposes an acquired session when abort happens during renderer readiness", async () => {
    const readiness = deferred<void>();
    const readyObserved = deferred<void>();
    const session = fakeSession(readiness.promise, () => readyObserved.resolve(undefined));
    const harness = installHarness();
    mocks.acquire.mockResolvedValue(session);
    const startup = new AbortController();
    const abortReason = new DOMException("page hidden", "AbortError");
    const mounted = mountPlayer(harness.rootElement, {}, { signal: startup.signal });
    await readyObserved.promise;

    startup.abort(abortReason);
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    readiness.resolve(undefined);

    await expect(mounted).rejects.toBe(abortReason);
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(harness.timeline.dispose).toHaveBeenCalledOnce();
    expect(harness.uninstallImportSettings).toHaveBeenCalledOnce();
    expect(harness.uninstallImportDocuments).toHaveBeenCalledOnce();
    expect(mocks.createRoot).not.toHaveBeenCalled();
  });

  it("tears down a mounted player once and suppresses late failure publication after abort", async () => {
    const session = fakeSession();
    const harness = installHarness();
    mocks.acquire.mockResolvedValue(session);
    const startup = new AbortController();
    const publishFailure = vi.fn();
    const dispose = await mountPlayer(harness.rootElement, {}, {
      signal: startup.signal,
      onRendererFailure: publishFailure,
    });

    expect(harness.root.render).toHaveBeenCalledOnce();
    expect(harness.timeline.start).toHaveBeenCalledOnce();
    startup.abort(new DOMException("hot replacement", "AbortError"));

    expect(harness.root.unmount).toHaveBeenCalledOnce();
    expect(harness.timeline.dispose).toHaveBeenCalledOnce();
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(harness.uninstallImportSettings).toHaveBeenCalledOnce();
    expect(harness.uninstallImportDocuments).toHaveBeenCalledOnce();
    const settingsCleanupOrder = harness.uninstallImportSettings.mock.invocationCallOrder[0];
    const documentsCleanupOrder = harness.uninstallImportDocuments.mock.invocationCallOrder[0];
    expect(settingsCleanupOrder).toBeLessThan(documentsCleanupOrder);

    const failureCallback = mocks.acquire.mock.calls[0][0].onRendererFailure as (
      diagnostic: RendererFailureDiagnostic,
    ) => void;
    failureCallback({
      kind: "device-lost",
      reason: "unknown",
      message: "The old renderer failed after abort.",
    });
    dispose();

    expect(publishFailure).not.toHaveBeenCalled();
    expect(harness.root.unmount).toHaveBeenCalledOnce();
    expect(harness.timeline.dispose).toHaveBeenCalledOnce();
    expect(session.disposeAsync).toHaveBeenCalledOnce();
    expect(harness.uninstallImportSettings).toHaveBeenCalledOnce();
    expect(harness.uninstallImportDocuments).toHaveBeenCalledOnce();
  });

  it("creates and starts playback for an authored Prime timeline", async () => {
    const session = fakeSession();
    const harness = installHarness();
    const primeTimeline = {
      version: "braze/timeline-v1",
      tracks: [{ id: "prime-track", clips: [] }],
    };
    mocks.decodePlayerPackage.mockReturnValue({
      modelImportDocuments: {},
      features: { timeline: true },
      scene: { timeline: primeTimeline },
    });
    mocks.acquire.mockResolvedValue(session);

    const dispose = await mountPlayer(harness.rootElement, {});

    expect(mocks.createTimelinePlayback).toHaveBeenCalledWith(primeTimeline);
    expect(harness.timeline.start).toHaveBeenCalledOnce();
    dispose();
  });
});

function installHarness() {
  const root = { render: vi.fn(), unmount: vi.fn() };
  const timeline = {
    subscribe: vi.fn(),
    start: vi.fn(),
    dispose: vi.fn(),
  };
  const uninstallImportDocuments = vi.fn();
  const uninstallImportSettings = vi.fn();
  mocks.createRoot.mockReturnValue(root);
  mocks.createTimelinePlayback.mockReturnValue(timeline);
  mocks.installImportDocuments.mockReturnValue(uninstallImportDocuments);
  mocks.installImportSettings.mockReturnValue(uninstallImportSettings);
  mocks.decodePlayerPackage.mockReturnValue({
    modelImportDocuments: {
      "Hero.fbx": { settings: { scaleFactor: 2 } },
    },
    features: { timeline: true },
    scene: { timeline: {} },
  });
  return {
    root,
    rootElement: {} as HTMLElement,
    timeline,
    uninstallImportDocuments,
    uninstallImportSettings,
  };
}

function fakeSession(
  ready: Promise<void> = Promise.resolve(),
  onReadyRead?: () => void,
): BrowserThreeWebGpuRenderSession {
  const session = {
    getStatus: vi.fn(() => "ready" as const),
    opportunityForFrame: vi.fn(),
    registerSurface: vi.fn(),
    registerDeviceTaskLane: vi.fn(),
    diagnostics: vi.fn(),
    summarize: vi.fn(),
    dispose: vi.fn(),
    disposeAsync: vi.fn(async () => undefined),
    deviceProfile: {},
  };
  Object.defineProperty(session, "ready", {
    configurable: true,
    enumerable: true,
    get: () => {
      onReadyRead?.();
      return ready;
    },
  });
  return session as unknown as BrowserThreeWebGpuRenderSession;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
