import { describe, expect, it } from "vitest";
import {
  EngineLoop,
  type EngineLoopDriver,
  type EngineLoopPhase,
} from "../runtime/engine-loop";

type ScheduledFrame = (nowMilliseconds: number) => void;

function createCountingDriver() {
  let nextFrameId = 1;
  let requestedFrames = 0;
  let cancelledFrames = 0;
  let firedFrames = 0;
  let maxPendingFrames = 0;
  const pendingFrames = new Map<number, ScheduledFrame>();
  const cancelledCallbacks: ScheduledFrame[] = [];
  const errors: Array<{ error: unknown; phase: EngineLoopPhase }> = [];

  const driver: EngineLoopDriver = {
    requestFrame: (callback) => {
      const frameId = nextFrameId++;
      requestedFrames += 1;
      pendingFrames.set(frameId, callback);
      maxPendingFrames = Math.max(maxPendingFrames, pendingFrames.size);
      return frameId;
    },
    cancelFrame: (frameId) => {
      const callback = pendingFrames.get(frameId);
      if (!callback) return;
      pendingFrames.delete(frameId);
      cancelledCallbacks.push(callback);
      cancelledFrames += 1;
    },
    reportError: (error, phase) => errors.push({ error, phase }),
  };

  return {
    driver,
    errors,
    pendingCount: () => pendingFrames.size,
    fireNext(nowMilliseconds: number) {
      const entry = pendingFrames.entries().next().value as
        | [number, ScheduledFrame]
        | undefined;
      if (!entry) throw new Error("The deterministic driver has no pending frame.");
      pendingFrames.delete(entry[0]);
      firedFrames += 1;
      entry[1](nowMilliseconds);
    },
    invokeCancelledCallbacks(nowMilliseconds: number) {
      for (const callback of cancelledCallbacks) callback(nowMilliseconds);
    },
    diagnostics: () => ({
      requestedFrames,
      cancelledFrames,
      firedFrames,
      maxPendingFrames,
    }),
  };
}

describe("EngineLoop deterministic soak", () => {
  it("owns one browser callback through 50,000 frames, pauses, and disposal", () => {
    const frameCount = 50_000;
    const pauseInterval = 1_000;
    const pauseCount = frameCount / pauseInterval - 1;
    const driver = createCountingDriver();
    const loop = new EngineLoop(driver.driver);
    const phaseCounts: Record<EngineLoopPhase, number> = {
      gameplay: 0,
      timeline: 0,
      simulation: 0,
      render: 0,
      afterRender: 0,
    };
    let zeroDeltaFrames = 0;
    let lastFrameIndex = 0;

    const participant = loop.createParticipant({
      timeline: () => { phaseCounts.timeline += 1; },
      simulation: () => { phaseCounts.simulation += 1; },
      render: (frame) => {
        phaseCounts.render += 1;
        lastFrameIndex = frame.index;
        if (frame.deltaSeconds === 0) zeroDeltaFrames += 1;
        participant.requestFrame();
      },
      afterRender: () => { phaseCounts.afterRender += 1; },
    });

    participant.requestFrame();
    for (let frameIndex = 1; frameIndex <= frameCount; frameIndex += 1) {
      driver.fireNext(frameIndex * 16);
      if (frameIndex % pauseInterval !== 0 || frameIndex === frameCount) continue;

      loop.setPaused(true);
      expect(driver.pendingCount()).toBe(0);
      loop.setPaused(false);
    }

    participant.dispose();
    loop.dispose();
    loop.dispose();
    expect(driver.pendingCount()).toBe(0);

    const callsBeforeStaleCallbacks = { ...phaseCounts };
    driver.invokeCancelledCallbacks(1_000_000);

    expect(phaseCounts).toEqual({
      gameplay: 0,
      timeline: frameCount,
      simulation: frameCount,
      render: frameCount,
      afterRender: frameCount,
    });
    expect(phaseCounts).toEqual(callsBeforeStaleCallbacks);
    expect(lastFrameIndex).toBe(frameCount);
    expect(zeroDeltaFrames).toBe(pauseCount + 1);
    expect(driver.errors).toEqual([]);
    expect(driver.diagnostics()).toEqual({
      requestedFrames: frameCount + pauseCount + 1,
      cancelledFrames: pauseCount + 1,
      firedFrames: frameCount,
      maxPendingFrames: 1,
    });
  });
});
