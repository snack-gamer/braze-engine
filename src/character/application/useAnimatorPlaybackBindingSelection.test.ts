import { describe, expect, it, vi } from "vitest";
import type { AnimatorPlaybackBinding } from "./playback/animator-playback-binding";
import {
  characterRuntimeSuccess,
} from "../runtime/diagnostics";
import type {
  AnimatorRuntimeState,
  RuntimeAnimatorControllerDefinition,
} from "../runtime/animator-runtime";
import { combineAnimatorPlaybackBindings } from "./useAnimatorPlaybackBindingSelection";

const CONTROLLER: RuntimeAnimatorControllerDefinition = {
  id: "controller",
  revision: "r1",
  parameters: [{ name: "speed", type: "float", defaultValue: 0 }],
  layers: [],
};

function runtimeState(speed: number): AnimatorRuntimeState {
  return {
    controllerId: CONTROLLER.id,
    controllerRevision: CONTROLLER.revision,
    parameters: { speed },
    layers: [],
  };
}

function playbackBinding(states: Readonly<Record<string, AnimatorRuntimeState>>) {
  const setFloat = vi.fn(() => characterRuntimeSuccess(undefined));
  const unsubscribe = vi.fn();
  const binding: AnimatorPlaybackBinding = {
    commands: {
      setFloat,
      setInt: vi.fn(() => characterRuntimeSuccess(undefined)),
      setBool: vi.fn(() => characterRuntimeSuccess(undefined)),
      setTrigger: vi.fn(() => characterRuntimeSuccess(undefined)),
      resetTrigger: vi.fn(() => characterRuntimeSuccess(undefined)),
    },
    events: {
      subscribe: vi.fn(() => characterRuntimeSuccess(() => undefined)),
    },
    ik: {
      setGoal: vi.fn(() => characterRuntimeSuccess(undefined)),
      clearGoal: vi.fn(),
      clearLayer: vi.fn(),
      clearCharacter: vi.fn(),
    },
    rootMotion: {
      registerMotor: vi.fn(() => characterRuntimeSuccess({ dispose: () => undefined })),
      subscribe: vi.fn(() => characterRuntimeSuccess({ dispose: () => undefined })),
    },
    trace: {
      state: (objectId) => states[objectId] ?? null,
      controller: (objectId) => states[objectId] ? CONTROLLER : null,
      subscribe: vi.fn(() => unsubscribe),
    },
    diagnostics: () => [],
  };
  return { binding, setFloat, unsubscribe };
}

describe("combined Animator playback binding", () => {
  it("sends a command once when Scene and Game publish the same world binding", () => {
    const shared = playbackBinding({ hero: runtimeState(0) });
    const combined = combineAnimatorPlaybackBindings(shared.binding, shared.binding)!;
    expect(combined).toBe(shared.binding);
    combined.commands.setFloat("hero", "speed", 2);
    expect(shared.setFloat).toHaveBeenCalledOnce();
  });
  it("fans preview commands out while retaining the selected Game telemetry", () => {
    const sceneState = runtimeState(0.25);
    const gameState = runtimeState(0.75);
    const scene = playbackBinding({ "scene-only": sceneState });
    const game = playbackBinding({ "game-only": gameState });
    const combined = combineAnimatorPlaybackBindings(scene.binding, game.binding)!;

    const result = combined.commands.setFloat("hero", "speed", 0.5);

    expect(result.value).toBeUndefined();
    expect(scene.setFloat).toHaveBeenCalledWith("hero", "speed", 0.5);
    expect(game.setFloat).toHaveBeenCalledWith("hero", "speed", 0.5);
    expect(combined.trace.state("scene-only")).toBeNull();
    expect(combined.trace.state("game-only")).toBe(gameState);
    expect(combined.trace.controller("game-only")).toBe(CONTROLLER);
    expect(combineAnimatorPlaybackBindings(scene.binding, null)).toBe(scene.binding);

    const listener = vi.fn();
    const unsubscribe = combined.trace.subscribe("hero", listener);
    expect(game.binding.trace.subscribe).toHaveBeenCalledWith("hero", listener);
    unsubscribe();
    expect(game.unsubscribe).toHaveBeenCalledOnce();
  });
});
