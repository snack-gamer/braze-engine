import { describe, expect, it } from "vitest";
import type {
  AnimatorRuntimeState,
  RuntimeAnimatorControllerDefinition,
  RuntimeAnimatorStateDefinition,
} from "../../runtime/animator-runtime";
import {
  animatorPreviewActiveStateMachineIdsForLayer,
  animatorPreviewLayerFeedback,
  animatorPreviewPlayback,
  animatorPreviewTransitionPlayback,
} from "./animator-preview-playback";
import type { AnimatorLayer } from "../../domain/animator-controller";

const looping: RuntimeAnimatorStateDefinition = {
  id: "idle",
  motion: null,
  durationSeconds: 2,
  speed: 1,
  cycleOffset: 0.25,
  loop: true,
};
const once: RuntimeAnimatorStateDefinition = {
  ...looping,
  id: "jump",
  cycleOffset: 0,
  loop: false,
};

function controller(): RuntimeAnimatorControllerDefinition {
  return {
    id: "controller",
    revision: "r1",
    parameters: [],
    layers: [{
      id: "base",
      initialStateId: "idle",
      weight: 1,
      blendMode: "override",
      states: [looping, once],
      transitions: [],
    }],
  };
}

function runtime(overrides: Partial<AnimatorRuntimeState["layers"][number]> = {}): AnimatorRuntimeState {
  return {
    controllerId: "controller",
    controllerRevision: "r1",
    parameters: {},
    layers: [{
      layerId: "base",
      currentStateId: "idle",
      stateInstance: 0,
      stateTimeSeconds: 0.5,
      transition: null,
      active: true,
      ...overrides,
    }],
  };
}

describe("Animator preview playback", () => {
  it("includes loop phase offset and wraps normalized progress", () => {
    expect(animatorPreviewPlayback(controller(), runtime())).toEqual([{
      layerId: "base",
      stateId: "idle",
      progress: 0.5,
    }]);
  });

  it("clamps Play Once progress at the end", () => {
    expect(animatorPreviewPlayback(controller(), runtime({
      currentStateId: "jump",
      stateTimeSeconds: 4,
    }))[0]?.progress).toBe(1);
  });

  it("reports both source and destination while crossfading", () => {
    expect(animatorPreviewPlayback(controller(), runtime({
      currentStateId: "jump",
      stateTimeSeconds: 0.4,
      transition: {
        id: "idle-to-jump",
        fromStateId: "idle",
        fromStateInstance: 0,
        fromStateTimeSeconds: 1,
        toStateId: "jump",
        elapsedSeconds: 0.1,
        durationSeconds: 0.25,
      },
    }))).toEqual([
      { layerId: "base", stateId: "jump", progress: 0.2 },
      { layerId: "base", stateId: "idle", progress: 0.75 },
    ]);
  });

  it("reports normalized progress for the authored active transition", () => {
    expect(animatorPreviewTransitionPlayback(controller(), runtime({
      currentStateId: "jump",
      transition: {
        id: "idle-to-jump@3",
        fromStateId: "idle",
        fromStateInstance: 0,
        fromStateTimeSeconds: 1,
        toStateId: "jump",
        elapsedSeconds: 0.1,
        durationSeconds: 0.25,
      },
    }))).toEqual([{
      layerId: "base",
      transitionId: "idle-to-jump",
      progress: 0.4,
    }]);
  });

  it("reports the inner transition and every nested Exit route", () => {
    expect(animatorPreviewTransitionPlayback(controller(), runtime({
      currentStateId: "jump",
      transition: {
        id: "leave-attack@attack:combo-exit:actions-exit:0",
        fromStateId: "idle",
        fromStateInstance: 0,
        fromStateTimeSeconds: 1,
        toStateId: "jump",
        elapsedSeconds: 0.1,
        durationSeconds: 0.25,
      },
    }))).toEqual([
      { layerId: "base", transitionId: "leave-attack", progress: 0.4 },
      { layerId: "base", transitionId: "combo-exit", progress: 0.4 },
      { layerId: "base", transitionId: "actions-exit", progress: 0.4 },
    ]);
  });

  it("marks every ancestor machine of an active leaf in the same layer", () => {
    const nestedLayer: AnimatorLayer = {
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "actions",
      states: [],
      anyStateTransitions: [],
      stateMachines: [{
        id: "actions",
        name: "Actions",
        defaultStateId: "combo",
        states: [],
        anyStateTransitions: [],
        transitions: [],
        stateMachines: [{
          id: "combo",
          name: "Combo",
          defaultStateId: "attack",
          states: [{
            id: "attack",
            name: "Attack",
            motion: null,
            speed: 1,
            cycleOffset: 0,
            mirror: false,
            footIk: false,
            writeDefaults: true,
            transitions: [],
            events: [],
          }],
          anyStateTransitions: [],
          transitions: [],
          stateMachines: [],
        }],
      }],
    };

    const machineIds = animatorPreviewActiveStateMachineIdsForLayer([
      { layerId: "upper", stateId: "attack", progress: 0.5 },
      { layerId: "base", stateId: "attack", progress: 0.5 },
    ], nestedLayer);

    expect([...machineIds]).toEqual(["actions", "combo"]);
  });

  it("builds layer-scoped graph feedback for expanded route IDs", () => {
    const layer: AnimatorLayer = {
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "",
      states: [],
      anyStateTransitions: [],
    };
    const feedback = animatorPreviewLayerFeedback([], [{
      layerId: "base",
      transitionId: "exit-route",
      progress: 0.4,
    }, {
      layerId: "upper",
      transitionId: "exit-route",
      progress: 0.8,
    }], layer);

    expect([...feedback.activeTransitionIds]).toEqual(["exit-route"]);
    expect(feedback.transitionProgressById.get("exit-route")).toBe(0.4);
  });
});
