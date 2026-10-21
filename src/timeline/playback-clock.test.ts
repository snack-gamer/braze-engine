import { describe, expect, it } from "vitest";
import { normalizePrimeTimelineDocument } from "./document";
import { resolveTimelineBoundary, TimelinePlaybackClock } from "./playback-clock";

function advanceAtCadence(hz: number): number {
  let document = normalizePrimeTimelineDocument({
    currentFrame: 0,
    fps: 60,
    maxFrame: 600,
    previewEndFrame: 600,
    frameMode: "realtime",
  });
  const clock = new TimelinePlaybackClock(document, 1);
  for (let index = 0; index < hz; index += 1) {
    const frame = clock.advance(document, 1, 1 / hz);
    document = { ...document, currentFrame: frame };
  }
  return document.currentFrame;
}

describe("TimelinePlaybackClock", () => {
  it("reaches the same realtime frame at different display cadences", () => {
    expect(advanceAtCadence(30)).toBe(60);
    expect(advanceAtCadence(60)).toBe(60);
    expect(advanceAtCadence(120)).toBe(60);
  });

  it("advances at most one authored frame per callback in all-frames mode", () => {
    let document = normalizePrimeTimelineDocument({
      currentFrame: 0,
      fps: 60,
      maxFrame: 600,
      previewEndFrame: 600,
      frameMode: "allFrames",
    });
    const clock = new TimelinePlaybackClock(document, 1);
    for (let index = 0; index < 10; index += 1) {
      document = { ...document, currentFrame: clock.advance(document, 1, 0.2) };
    }
    expect(document.currentFrame).toBe(10);
  });

  it("resolves once, loop, and ping-pong boundaries deterministically", () => {
    const once = normalizePrimeTimelineDocument({
      previewStartFrame: 10,
      previewEndFrame: 20,
      playMode: "once",
    });
    expect(resolveTimelineBoundary(25, 1, once)).toEqual({ frame: 20, direction: 1, stop: true });
    expect(resolveTimelineBoundary(5, -1, { ...once, playMode: "loop" }))
      .toEqual({ frame: 16, direction: -1, stop: false });
    expect(resolveTimelineBoundary(23, 1, { ...once, playMode: "pingpong" }))
      .toEqual({ frame: 17, direction: -1, stop: false });
  });

  it("rebases cleanly when direction or cadence policy changes", () => {
    let document = normalizePrimeTimelineDocument({
      currentFrame: 30,
      fps: 60,
      maxFrame: 600,
      previewEndFrame: 600,
      frameMode: "realtime",
    });
    const clock = new TimelinePlaybackClock(document, 1);
    document = { ...document, currentFrame: clock.advance(document, 1, 0.5) };
    expect(document.currentFrame).toBe(60);
    expect(clock.advance(document, -1, 1 / 60)).toBe(59);
    document = { ...document, currentFrame: 59, frameMode: "allFrames" };
    expect(clock.advance(document, -1, 0)).toBe(59);
  });
});
