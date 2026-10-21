import { describe, expect, it } from "vitest";
import type { AnimatorTransition } from "../../domain/animator-controller";
import {
  animatorClipTimeTicks,
  animatorCrossfadeDragPatch,
  animatorCrossfadePlaybackPercent,
  animatorCrossfadeTimeline,
} from "./animator-crossfade-presentation";

describe("Animator crossfade presentation", () => {
  it("shifts destination Clip time marks by its normalized offset", () => {
    expect(animatorClipTimeTicks(0.15)).toEqual([
      { positionPercent: 10, cycleBoundary: false },
      { positionPercent: 35, cycleBoundary: false },
      { positionPercent: 60, cycleBoundary: false },
      { positionPercent: 85, cycleBoundary: true, label: "1×" },
    ]);
  });

  it("places normalized crossfades against the source cycle", () => {
    expect(animatorCrossfadeTimeline(transition())).toMatchObject({
      fadeStartPercent: 60,
      fadeEndPercent: 80,
      editPointPercent: 70,
      sourceCyclePercent: 80,
      durationNormalized: 0.25,
      timelineEndNormalized: 1.25,
    });
  });

  it("converts second-based durations using imported source timing", () => {
    expect(animatorCrossfadeTimeline(transition({
      exitTimeNormalized: 0.5,
      durationMode: "seconds",
      duration: 0.5,
    }), 2)).toMatchObject({
      fadeStartPercent: 50,
      fadeEndPercent: 75,
      editPointPercent: 62.5,
      durationNormalized: 0.25,
      timelineEndNormalized: 1,
    });
  });

  it("starts immediately without an exit time and expands beyond one source cycle", () => {
    const timeline = animatorCrossfadeTimeline(transition({
      hasExitTime: false,
      duration: 1.5,
    }));
    expect(timeline).toMatchObject({
      fadeStartPercent: 0,
      timelineEndNormalized: 1.75,
    });
    expect(timeline.fadeEndPercent).toBeCloseTo(100 * 1.5 / 1.75);
    expect(timeline.sourceCyclePercent).toBeCloseTo(100 / 1.75);
  });

  it("keeps a supplied Inspector viewport fixed while an edge is resized", () => {
    expect(animatorCrossfadeTimeline(transition({ duration: 0.5 }), undefined, 1.25))
      .toMatchObject({
        fadeStartPercent: 60,
        fadeEndPercent: 100,
        editPointPercent: 80,
        timelineEndNormalized: 1.25,
      });
  });

  it("places playback progress inside the crossfade window", () => {
    const timeline = animatorCrossfadeTimeline(transition());
    expect(animatorCrossfadePlaybackPercent(timeline, 0.5)).toBe(70);
    expect(animatorCrossfadePlaybackPercent(timeline, 2)).toBe(80);
  });

  it("maps the three direct-manipulation gestures to their owned timing fields", () => {
    const authored = transition({ offsetNormalized: 0.2 });
    expect(animatorCrossfadeDragPatch(authored, "source", -0.15)).toEqual({
      exitTimeNormalized: 0.6,
      duration: 0.4,
    });
    expect(animatorCrossfadeDragPatch(authored, "destination", -0.15).duration)
      .toBeCloseTo(0.1);
    expect(animatorCrossfadeDragPatch(authored, "crossfade", 0.2)).toEqual({
      exitTimeNormalized: 0.95,
    });
  });

  it("converts crossfade dragging back to seconds when source timing is known", () => {
    expect(animatorCrossfadeDragPatch(transition({
      durationMode: "seconds",
      duration: 0.5,
    }), "destination", 0.25, 2)).toEqual({ duration: 1 });
  });
});

function transition(patch: Partial<AnimatorTransition> = {}): AnimatorTransition {
  return {
    id: "crossfade",
    destination: { kind: "state", stateId: "run" },
    conditions: [],
    hasExitTime: true,
    exitTimeNormalized: 0.75,
    durationMode: "normalized",
    duration: 0.25,
    offsetNormalized: 0,
    interruptionSource: "none",
    orderedInterruption: true,
    canTransitionToSelf: false,
    ...patch,
  };
}
