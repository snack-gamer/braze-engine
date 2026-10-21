import { describe, expect, it, vi } from "vitest";
import { EngineLoop, type EngineLoopDriver } from "./engine-loop";

function createDriver() {
  let nextId = 1;
  const callbacks = new Map<number, (now: number) => void>();
  const errors: Array<{ error: unknown; phase: string }> = [];
  const driver: EngineLoopDriver = {
    requestFrame: (callback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      callbacks.delete(id);
    },
    reportError: (error, phase) => errors.push({ error, phase }),
  };
  return {
    driver,
    errors,
    pending: () => callbacks.size,
    fire(now: number) {
      const entry = callbacks.entries().next().value as [number, (time: number) => void] | undefined;
      if (!entry) throw new Error("No engine frame is pending.");
      callbacks.delete(entry[0]);
      entry[1](now);
    },
  };
}

describe("EngineLoop", () => {
  it("runs participants in phase order with one shared frame sample", () => {
    const fake = createDriver();
    const loop = new EngineLoop(fake.driver);
    const calls: string[] = [];
    const frames = new Set<object>();
    const first = loop.createParticipant({
      render: (frame) => {
        calls.push("first:render");
        frames.add(frame);
      },
      timeline: (frame) => {
        calls.push("first:timeline");
        frames.add(frame);
      },
      afterRender: (frame) => {
        calls.push("first:after");
        frames.add(frame);
      },
    });
    const second = loop.createParticipant({
      gameplay: (frame) => {
        calls.push("second:gameplay");
        frames.add(frame);
      },
      simulation: (frame) => {
        calls.push("second:simulation");
        frames.add(frame);
      },
      render: (frame) => {
        calls.push("second:render");
        frames.add(frame);
      },
    });

    second.requestFrame();
    first.requestFrame();
    expect(fake.pending()).toBe(1);
    fake.fire(100);

    expect(calls).toEqual([
      "second:gameplay",
      "first:timeline",
      "second:simulation",
      "first:render",
      "second:render",
      "first:after",
    ]);
    expect(frames.size).toBe(1);
    expect(fake.pending()).toBe(0);
  });

  it("uses active cadence and resets delta after idle or pause", () => {
    const fake = createDriver();
    const loop = new EngineLoop(fake.driver);
    const deltas: number[] = [];
    let continuous = true;
    const participant = loop.createParticipant({
      simulation: (frame) => {
        deltas.push(frame.deltaSeconds);
        if (continuous) participant.requestFrame();
      },
    });

    participant.requestFrame();
    fake.fire(1_000);
    fake.fire(1_016);
    continuous = false;
    fake.fire(1_032);
    participant.requestFrame();
    fake.fire(9_000);
    continuous = true;
    participant.requestFrame();
    fake.fire(9_016);
    loop.setPaused(true);
    expect(fake.pending()).toBe(0);
    loop.setPaused(false);
    fake.fire(20_000);

    expect(deltas).toEqual([0, 0.016, 0.016, 0, 0, 0]);
  });

  it("lets an earlier phase wake a later-phase participant in the same frame", () => {
    const fake = createDriver();
    const loop = new EngineLoop(fake.driver);
    const render = vi.fn();
    const renderer = loop.createParticipant({ render });
    const timeline = loop.createParticipant({ timeline: () => renderer.requestFrame() });

    timeline.requestFrame();
    fake.fire(100);

    expect(render).toHaveBeenCalledOnce();
    expect(fake.pending()).toBe(0);
  });

  it("cancels disposed work and isolates callback failures", () => {
    const fake = createDriver();
    const loop = new EngineLoop(fake.driver);
    const surviving = vi.fn();
    const failing = loop.createParticipant({ render: () => { throw new Error("bad frame"); } });
    const disposed = loop.createParticipant({ render: vi.fn() });
    const survivor = loop.createParticipant({ render: surviving });

    disposed.requestFrame();
    disposed.dispose();
    failing.requestFrame();
    survivor.requestFrame();
    fake.fire(100);

    expect(surviving).toHaveBeenCalledOnce();
    expect(fake.errors).toMatchObject([{ phase: "render" }]);
    loop.dispose();
    survivor.requestFrame();
    expect(fake.pending()).toBe(0);
  });

  it("publishes scaled and unscaled clocks from one frame sample", () => {
    const fake = createDriver();
    const loop = new EngineLoop(fake.driver);
    const frames: Array<{ scaled: number; unscaled: number; scale: number }> = [];
    const participant = loop.createParticipant({ simulation: (frame) => {
      frames.push({
        scaled: frame.deltaSeconds,
        unscaled: frame.unscaledDeltaSeconds,
        scale: frame.timeScale,
      });
      if (frames.length < 3) participant.requestFrame();
    } });
    loop.setTimeScale(0.5);
    participant.requestFrame();
    fake.fire(1_000);
    fake.fire(1_100);
    loop.setTimeScale(0);
    fake.fire(1_200);

    expect(frames).toEqual([
      { scaled: 0, unscaled: 0, scale: 0.5 },
      { scaled: 0.05, unscaled: 0.1, scale: 0.5 },
      { scaled: 0, unscaled: 0.1, scale: 0 },
    ]);
  });

  it("wakes scaled gameplay after time resumes without accumulating the stopped interval", () => {
    const fake = createDriver(), loop = new EngineLoop(fake.driver);
    const deltas: number[] = [];
    const participant = loop.createParticipant({ gameplay: (frame) => {
      deltas.push(frame.deltaSeconds);
      if (frame.timeScale > 0) participant.requestFrame();
    } });
    participant.requestFrame(); fake.fire(100);
    loop.setTimeScale(0); fake.fire(116);
    expect(fake.pending()).toBe(0);
    loop.setTimeScale(1); expect(fake.pending()).toBe(1);
    fake.fire(10_000); fake.fire(10_016);
    expect(deltas).toEqual([0, 0, 0, 0.016]);
    participant.dispose(); loop.dispose();
  });
});
