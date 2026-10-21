import { describe, expect, it } from "vitest";
import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import type { AnimatorPlaybackClip } from "./animator-playback-contracts";
import { AnimatorPlaybackEventTracker } from "./animator-playback-events";

const CLIP_ID = `${"c".repeat(32)}:clip:walk`;
const clips = new Map<string, AnimatorPlaybackClip<string>>([[
  CLIP_ID,
  {
    id: CLIP_ID,
    resource: "clip",
    metadata: {
      durationSeconds: 1,
      looping: true,
      events: [
        { id: "early", name: "Early", timeSeconds: 0.25, payload: {} },
        { id: "late", name: "Late", timeSeconds: 0.75, payload: {} },
      ],
    },
  },
]]);

describe("AnimatorPlaybackEventTracker", () => {
  it("fires markers crossed by the first Play step from the primed time-zero cursor", () => {
    const tracker = new AnimatorPlaybackEventTracker<string>();
    tracker.prime(plan([sample("main", 0)]));

    expect(tracker.collect("hero", plan([sample("main", 0.3)]), clips, 16)
      .events.map((event) => event.event.id)).toEqual(["early"]);
  });

  it("uses unwrapped time for multi-loop forward and reverse traversal", () => {
    const forward = new AnimatorPlaybackEventTracker<string>();
    forward.collect("hero", plan([sample("main", 0.1)]), clips, 16);
    const advanced = forward.collect("hero", plan([sample("main", 2.1)]), clips, 16);
    expect(advanced.events.map((event) => event.event.id)).toEqual([
      "early", "late", "early", "late",
    ]);

    const reverse = new AnimatorPlaybackEventTracker<string>();
    reverse.collect("hero", plan([sample("main", 2.1)]), clips, 16);
    const reversed = reverse.collect("hero", plan([sample("main", -0.1)]), clips, 16);
    expect(reversed.events.map((event) => event.event.id)).toEqual([
      "late", "early", "late", "early",
    ]);
  });

  it("tracks two active instances of the same clip independently", () => {
    const tracker = new AnimatorPlaybackEventTracker<string>();
    tracker.collect("hero", plan([
      sample("left", 0.1),
      sample("right", 0.6),
    ]), clips, 16);
    const crossed = tracker.collect("hero", plan([
      sample("left", 0.3),
      sample("right", 0.8),
    ]), clips, 16);
    expect(crossed.events.map((event) => event.event.id)).toEqual(["early", "late"]);
  });

  it("uses the sampled Clip loop policy instead of stale source metadata", () => {
    const tracker = new AnimatorPlaybackEventTracker<string>();
    tracker.collect("hero", plan([sample("main", 0.1, false)]), clips, 16);
    const crossed = tracker.collect("hero", plan([sample("main", 2.1, false)]), clips, 16);
    expect(crossed.events.map((event) => event.event.id)).toEqual(["early", "late"]);
  });

  it("caps delivery without losing deterministic traversal state", () => {
    const tracker = new AnimatorPlaybackEventTracker<string>();
    tracker.collect("hero", plan([sample("main", 0.1)]), clips, 1);
    const bounded = tracker.collect("hero", plan([sample("main", 2.1)]), clips, 1);
    expect(bounded.events.map((event) => event.event.id)).toEqual(["early"]);
    expect(bounded.truncated).toBe(true);
    const resumed = tracker.collect("hero", plan([sample("main", 2.3)]), clips, 1);
    expect(resumed.events.map((event) => event.event.id)).toEqual(["early"]);
    expect(resumed.truncated).toBe(false);
  });
});

function sample(sampleId: string, unwrappedLocalTimeSeconds: number, looping?: boolean) {
  return {
    sampleId,
    clipId: CLIP_ID,
    unwrappedLocalTimeSeconds,
    localTimeSeconds: ((unwrappedLocalTimeSeconds % 1) + 1) % 1,
    ...(looping === undefined ? {} : { looping }),
    weight: 1,
  };
}

function plan(clipsForLayer: ReturnType<typeof sample>[]): LayerBlendPlan {
  return {
    controllerId: "controller",
    controllerRevision: "r1",
    instructions: [{
      layerId: "base",
      blendMode: "override",
      layerWeight: 1,
      gpuMaskIndex: null,
      clips: clipsForLayer,
    }],
  };
}
