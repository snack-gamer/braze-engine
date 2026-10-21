import { describe, expect, it } from "vitest";
import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import type { AnimatorPlaybackClip } from "./animator-playback-contracts";
import { resolveRootMotionLoopTraversal } from "./root-motion-traversal";

const CLIP_ID = "clip";
const clips = new Map<string, AnimatorPlaybackClip<string>>([[
  CLIP_ID,
  {
    id: CLIP_ID,
    resource: "clip",
    metadata: { durationSeconds: 1, looping: true, events: [] },
  },
]]);

describe("root-motion loop traversal", () => {
  it("returns signed multi-cycle crossings for one continuous sample", () => {
    expect(resolveRootMotionLoopTraversal(plan([sample("a", 0.2)]), plan([sample("a", 3.2)]), clips))
      .toEqual({ kind: "crossing", cycleCrossings: 3 });
    expect(resolveRootMotionLoopTraversal(plan([sample("a", 1.2)]), plan([sample("a", -1.2)]), clips))
      .toEqual({ kind: "crossing", cycleCrossings: -3 });
  });

  it("rejects loop correction while multiple blend samples own the root", () => {
    const previous = plan([sample("a", 0.8, 0.5), sample("b", 0.2, 0.5)]);
    const current = plan([sample("a", 1.2, 0.5), sample("b", 0.4, 0.5)]);

    expect(resolveRootMotionLoopTraversal(previous, current, clips))
      .toEqual({ kind: "ambiguous", reason: "blended" });
  });

  it("identifies an instantaneous state change with no continuous root sample", () => {
    expect(resolveRootMotionLoopTraversal(
      plan([sample("old-state", 0.8)]),
      plan([sample("new-state", 0.1)]),
      clips,
    )).toEqual({ kind: "discontinuous" });
  });

  it("does not correct a Clip whose per-use policy is Play Once", () => {
    expect(resolveRootMotionLoopTraversal(
      plan([sample("a", 0.2, 1, false)]),
      plan([sample("a", 3.2, 1, false)]),
      clips,
    )).toEqual({ kind: "none" });
  });
});

function sample(sampleId: string, time: number, weight = 1, looping?: boolean) {
  return {
    sampleId,
    clipId: CLIP_ID,
    unwrappedLocalTimeSeconds: time,
    localTimeSeconds: ((time % 1) + 1) % 1,
    ...(looping === undefined ? {} : { looping }),
    weight,
  };
}

function plan(samples: ReturnType<typeof sample>[]): LayerBlendPlan {
  return {
    controllerId: "controller",
    controllerRevision: "r1",
    instructions: [{
      layerId: "base",
      blendMode: "override",
      layerWeight: 1,
      gpuMaskIndex: null,
      clips: samples,
    }],
  };
}
