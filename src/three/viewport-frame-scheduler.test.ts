import { describe, expect, it, vi } from "vitest";
import type { EngineFrame, EngineLoop, EngineLoopCallbacks } from "../runtime/engine-loop";
import { createViewportFrameScheduler } from "./viewport-frame-scheduler";

describe("viewport frame scheduler", () => {
  it("joins one demand loop and pauses work while the document is hidden", () => {
    const requestFrame = vi.fn();
    const cancelFrame = vi.fn();
    const disposeParticipant = vi.fn();
    let callbacks: EngineLoopCallbacks = {};
    const loop = {
      createParticipant: vi.fn((next: EngineLoopCallbacks) => {
        callbacks = next;
        return { requestFrame, cancelFrame, dispose: disposeParticipant };
      }),
    } as unknown as Pick<EngineLoop, "createParticipant">;
    let visibilityListener: () => void = () => undefined;
    const visibility = {
      hidden: false,
      addEventListener: vi.fn((_type: "visibilitychange", listener: () => void) => {
        visibilityListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    const setRenderLoopActive = vi.fn();
    const onFrame = vi.fn();
    const onVisible = vi.fn();
    const scheduler = createViewportFrameScheduler({
      diagnostics: { setRenderLoopActive },
      loop,
      visibility,
      onFrame,
      onVisible,
    });

    scheduler.requestFrame();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(setRenderLoopActive).toHaveBeenLastCalledWith(true);
    callbacks.render?.({} as EngineFrame);
    expect(onFrame).toHaveBeenCalledOnce();

    visibility.hidden = true;
    visibilityListener();
    scheduler.requestFrame();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(setRenderLoopActive).toHaveBeenLastCalledWith(false);

    visibility.hidden = false;
    visibilityListener();
    expect(onVisible).toHaveBeenCalledOnce();
    scheduler.dispose();
    expect(disposeParticipant).toHaveBeenCalledOnce();
    expect(visibility.removeEventListener).toHaveBeenCalledOnce();
  });
});
