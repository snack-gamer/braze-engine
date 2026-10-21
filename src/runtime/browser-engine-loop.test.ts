import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(async () => {
  const runtime = await import("./browser-engine-loop");
  runtime.disposeSharedBrowserEngineLoop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared browser engine loop lifetime", () => {
  it("owns one visibility listener and releases it with scheduled frame work", async () => {
    const listeners = new Set<() => void>();
    const requestFrame = vi.fn(() => 41);
    const cancelFrame = vi.fn();
    vi.stubGlobal("window", { requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame });
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    });

    const runtime = await import("./browser-engine-loop");
    const first = runtime.sharedBrowserEngineLoop();
    expect(runtime.sharedBrowserEngineLoop()).toBe(first);
    expect(listeners.size).toBe(1);

    first.createParticipant({ render: () => undefined }).requestFrame();
    expect(requestFrame).toHaveBeenCalledOnce();
    runtime.disposeSharedBrowserEngineLoop();

    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(listeners.size).toBe(0);
    expect(runtime.sharedBrowserEngineLoop()).not.toBe(first);
    expect(listeners.size).toBe(1);
  });
});
