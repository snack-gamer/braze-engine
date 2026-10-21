import { describe, expect, it, vi } from "vitest";
import { normalizePrimeTimelineDocument } from "./document";
import { TimelinePlaybackSession, type TimelinePlaybackStep } from "./playback-session";

describe("TimelinePlaybackSession", () => {
  it("emits playback ticks without committing authored state", () => {
    const emitted: TimelinePlaybackStep[] = [];
    const commitFinalFrame = vi.fn();
    let runtimeDocument = normalizePrimeTimelineDocument({
      fps: 10,
      minFrame: 0,
      maxFrame: 100,
      previewStartFrame: 0,
      previewEndFrame: 100,
      currentFrame: 0,
      playMode: "once",
    });
    const session = new TimelinePlaybackSession(runtimeDocument, 1, {
      emitFrame: (step) => {
        emitted.push(step);
        runtimeDocument = step.document;
      },
      commitFinalFrame,
    });

    expect(session.advance(runtimeDocument, 1, 0)).toBe(true);
    expect(session.advance(runtimeDocument, 1, 0.1)).toBe(true);
    expect(session.advance(runtimeDocument, 1, 0.1)).toBe(true);

    expect(emitted.map((step) => step.document.currentFrame)).toEqual([1, 2]);
    expect(commitFinalFrame).not.toHaveBeenCalled();
  });

  it("emits and commits the exact final frame once at a once-mode boundary", () => {
    const emitted: TimelinePlaybackStep[] = [];
    const commitFinalFrame = vi.fn();
    let runtimeDocument = normalizePrimeTimelineDocument({
      fps: 10,
      minFrame: 0,
      maxFrame: 3,
      previewStartFrame: 0,
      previewEndFrame: 3,
      currentFrame: 2,
      playMode: "once",
    });
    const session = new TimelinePlaybackSession(runtimeDocument, 1, {
      emitFrame: (step) => {
        emitted.push(step);
        runtimeDocument = step.document;
      },
      commitFinalFrame,
    });

    expect(session.advance(runtimeDocument, 1, 0)).toBe(true);
    expect(session.advance(runtimeDocument, 1, 0.2)).toBe(false);
    expect(session.advance(runtimeDocument, 1, 0.2)).toBe(false);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ direction: 1, stopped: true });
    expect(emitted[0]?.document.currentFrame).toBe(3);
    expect(commitFinalFrame).toHaveBeenCalledTimes(1);
    expect(commitFinalFrame).toHaveBeenCalledWith(emitted[0]?.document);
  });

  it("rebases at ping-pong boundaries without committing authored state", () => {
    const emitted: TimelinePlaybackStep[] = [];
    const commitFinalFrame = vi.fn();
    let runtimeDocument = normalizePrimeTimelineDocument({
      fps: 10,
      minFrame: 0,
      maxFrame: 4,
      previewStartFrame: 0,
      previewEndFrame: 4,
      currentFrame: 3,
      playMode: "pingpong",
    });
    let direction: 1 | -1 = 1;
    const session = new TimelinePlaybackSession(runtimeDocument, direction, {
      emitFrame: (step) => {
        emitted.push(step);
        runtimeDocument = step.document;
        direction = step.direction;
      },
      commitFinalFrame,
    });

    expect(session.advance(runtimeDocument, direction, 0)).toBe(true);
    expect(session.advance(runtimeDocument, direction, 0.2)).toBe(true);
    expect(session.advance(runtimeDocument, direction, 0.1)).toBe(true);

    expect(emitted.map((step) => [step.document.currentFrame, step.direction])).toEqual([
      [3, -1],
      [2, -1],
    ]);
    expect(commitFinalFrame).not.toHaveBeenCalled();
  });

  it("rebases after an explicit scrub changes the runtime frame", () => {
    const frames: number[] = [];
    let runtimeDocument = normalizePrimeTimelineDocument({
      fps: 10,
      minFrame: 0,
      maxFrame: 100,
      currentFrame: 0,
      playMode: "loop",
    });
    const session = new TimelinePlaybackSession(runtimeDocument, 1, {
      emitFrame: (step) => {
        runtimeDocument = step.document;
        frames.push(step.document.currentFrame);
      },
      commitFinalFrame: vi.fn(),
    });

    session.advance(runtimeDocument, 1, 0);
    session.advance(runtimeDocument, 1, 0.2);
    runtimeDocument = { ...runtimeDocument, currentFrame: 50 };
    session.advance(runtimeDocument, 1, 0.1);
    session.advance(runtimeDocument, 1, 0.1);

    expect(frames).toEqual([2, 51, 52]);
  });
});
