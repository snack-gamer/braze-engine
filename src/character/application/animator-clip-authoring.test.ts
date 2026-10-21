import { describe, expect, it } from "vitest";
import type { AnimatorController, AnimatorState } from "../domain/animator-controller";
import { animatorClipPlaybackSettings, patchAnimatorClipPlayback } from "./animator-clip-authoring";

const state: AnimatorState = {
  id: "idle",
  name: "Idle",
  motion: {
    kind: "clip",
    clipRef: { guid: "a".repeat(32), localId: "clip:idle" },
    speed: 0.5,
    timeScaleParameterId: "legacy-motion-speed",
  },
  speed: 2,
  cycleOffset: 0,
  mirror: false,
  footIk: false,
  writeDefaults: true,
  transitions: [],
  events: [],
};

function controller(): AnimatorController {
  return {
    version: 1,
    id: "controller",
    name: "Controller",
    revision: "r1",
    parameters: [],
    layers: [{
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: state.id,
      states: [state],
      anyStateTransitions: [],
    }],
  };
}

describe("Animator Clip authoring", () => {
  it("presents legacy state and motion timing as one speed", () => {
    expect(animatorClipPlaybackSettings(state)).toEqual({
      speed: 1,
      speedParameterId: "legacy-motion-speed",
    });
  });

  it("consolidates edited speed and its parameter onto the state clock", () => {
    const edited = patchAnimatorClipPlayback(controller(), "base", "idle", {
      speed: 1.5,
      speedParameterId: undefined,
    });
    expect(edited.layers[0]?.states[0]).toMatchObject({
      speed: 1.5,
      speedParameterId: undefined,
      motion: { kind: "clip", speed: 1, timeScaleParameterId: undefined },
    });
  });

  it("updates or restores the imported Clip loop mode without changing its identity", () => {
    const overridden = patchAnimatorClipPlayback(controller(), "base", "idle", { loopMode: "once" });
    expect(overridden.layers[0]?.states[0]?.motion).toMatchObject({
      clipRef: state.motion && "clipRef" in state.motion ? state.motion.clipRef : undefined,
      loopMode: "once",
    });

    const restored = patchAnimatorClipPlayback(overridden, "base", "idle", { loopMode: undefined });
    expect(restored.layers[0]?.states[0]?.motion).toMatchObject({
      clipRef: state.motion && "clipRef" in state.motion ? state.motion.clipRef : undefined,
      loopMode: undefined,
    });
  });
});
