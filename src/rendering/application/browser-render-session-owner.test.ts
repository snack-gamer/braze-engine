import { describe, expect, it, vi } from "vitest";
import type { BrowserThreeWebGpuRenderSession } from "../adapters/browser-three-webgpu-session";
import { createBrowserRenderSessionOwner } from "./browser-render-session-owner";

describe("browser render session owner", () => {
  it("does not acquire a successor until native disposal releases the active turn", async () => {
    const firstDisposal = deferred<void>();
    const sessions = [fakeSession(firstDisposal.promise), fakeSession()];
    const createSession = vi.fn(async () => sessions.shift()!);
    const owner = createBrowserRenderSessionOwner({ createSession });

    const first = await owner.acquire();
    const secondRequest = owner.acquire();
    await Promise.resolve();
    expect(createSession).toHaveBeenCalledTimes(1);

    const disposing = first.disposeAsync();
    await Promise.resolve();
    expect(createSession).toHaveBeenCalledTimes(1);
    firstDisposal.resolve(undefined);
    await disposing;

    const second = await secondRequest;
    expect(createSession).toHaveBeenCalledTimes(2);
    await second.disposeAsync();
  });

  it("removes an aborted queued generation without deadlocking followers", async () => {
    const sessions = [fakeSession(), fakeSession()];
    const createSession = vi.fn(async () => sessions.shift()!);
    const owner = createBrowserRenderSessionOwner({ createSession });
    const first = await owner.acquire();
    const cancelled = new AbortController();
    const cancelledRequest = owner.acquire({ signal: cancelled.signal });
    const followerRequest = owner.acquire();

    cancelled.abort(new DOMException("replaced", "AbortError"));
    await expect(cancelledRequest).rejects.toMatchObject({ name: "AbortError" });
    await first.disposeAsync();

    const follower = await followerRequest;
    expect(createSession).toHaveBeenCalledTimes(2);
    await follower.disposeAsync();
  });

  it("disposes a session that resolves after its startup signal was aborted", async () => {
    const acquisition = deferred<BrowserThreeWebGpuRenderSession>();
    const late = fakeSession();
    const createSession = vi.fn(() => acquisition.promise);
    const owner = createBrowserRenderSessionOwner({ createSession });
    const startup = new AbortController();
    const request = owner.acquire({ signal: startup.signal });
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());

    startup.abort(new DOMException("page hidden", "AbortError"));
    acquisition.resolve(late);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(late.disposeAsync).toHaveBeenCalledTimes(1);
  });

  it("advances ownership after disposal and readiness failures", async () => {
    const disposalFailure = new Error("device destroy failed");
    const firstDisposal = deferred<void>();
    const failedDisposal = fakeSession(firstDisposal.promise);
    const readiness = deferred<void>();
    const readinessFailure = fakeSession(Promise.resolve(), readiness.promise);
    const successor = fakeSession();
    const createSession = vi.fn()
      .mockResolvedValueOnce(failedDisposal)
      .mockResolvedValueOnce(readinessFailure)
      .mockResolvedValueOnce(successor);
    const owner = createBrowserRenderSessionOwner({ createSession });

    const first = await owner.acquire();
    const failedDispose = first.disposeAsync();
    firstDisposal.reject(disposalFailure);
    await expect(failedDispose).rejects.toBe(disposalFailure);
    const second = await owner.acquire();
    readiness.reject(new Error("renderer init failed"));
    await expect(second.ready).rejects.toThrow("renderer init failed");
    const third = await owner.acquire();
    await third.disposeAsync();

    expect(createSession).toHaveBeenCalledTimes(3);
  });

  it("releases ownership on renderer failure before forwarding the diagnostic", async () => {
    const first = fakeSession();
    const second = fakeSession();
    const createSession = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const onRendererFailure = vi.fn();
    const owner = createBrowserRenderSessionOwner({ createSession });
    const active = await owner.acquire({ onRendererFailure });
    const failureCallback = createSession.mock.calls[0][0].onRendererFailure!;
    const diagnostic = {
      kind: "device-lost",
      reason: "unknown",
      message: "WebGPU device was lost.",
    } as const;

    failureCallback(diagnostic);
    expect(first.disposeAsync).toHaveBeenCalledOnce();
    expect(onRendererFailure).toHaveBeenCalledWith(diagnostic);

    const successor = await owner.acquire();
    expect(createSession).toHaveBeenCalledTimes(2);
    await active.disposeAsync();
    await successor.disposeAsync();
  });

  it("releases a turn when renderer failure occurs before the session is published", async () => {
    const failed = fakeSession();
    const successor = fakeSession();
    const createSession = vi.fn()
      .mockImplementationOnce(async (options) => {
        options.onRendererFailure?.({
          kind: "device-lost",
          reason: "unknown",
          message: "WebGPU device was lost during startup.",
        });
        return failed;
      })
      .mockResolvedValueOnce(successor);
    const owner = createBrowserRenderSessionOwner({ createSession });

    await owner.acquire();
    const next = await owner.acquire();

    expect(failed.disposeAsync).toHaveBeenCalledOnce();
    await next.disposeAsync();
  });
});

function fakeSession(
  disposal: Promise<void> = Promise.resolve(),
  ready: Promise<void> = Promise.resolve(),
): BrowserThreeWebGpuRenderSession {
  return {
    ready,
    retireResources: async () => undefined,
    getStatus: () => "ready",
    opportunityForFrame: vi.fn() as BrowserThreeWebGpuRenderSession["opportunityForFrame"],
    registerSurface: vi.fn() as BrowserThreeWebGpuRenderSession["registerSurface"],
    registerDeviceTaskLane: vi.fn() as BrowserThreeWebGpuRenderSession["registerDeviceTaskLane"],
    diagnostics: vi.fn() as BrowserThreeWebGpuRenderSession["diagnostics"],
    summarize: vi.fn() as BrowserThreeWebGpuRenderSession["summarize"],
    dispose: vi.fn(),
    disposeAsync: vi.fn(() => disposal),
    deviceProfile: {} as BrowserThreeWebGpuRenderSession["deviceProfile"],
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}
