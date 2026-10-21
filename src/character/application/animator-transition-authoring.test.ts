import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import { addAnimatorState } from "./animator-controller-authoring";
import {
  addAnimatorTransition,
  patchAnimatorTransition,
  removeAnimatorTransition,
} from "./animator-transition-authoring";
import {
  MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION,
  MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER,
} from "./animator-controller-authoring-limits";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "./animator-state-machine-authoring";

describe("Any State transition authoring", () => {
  it("rejects inert self wires and base-layer exits at the authoring boundary", () => {
    const withState = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
    });
    expect(() => addAnimatorTransition(
      withState,
      "base-layer",
      { kind: "state", stateId: "idle" },
      { kind: "state", stateId: "idle" },
    )).toThrow(/another state/);
    expect(() => addAnimatorTransition(
      withState,
      "base-layer",
      { kind: "state", stateId: "idle" },
      { kind: "exit" },
    )).toThrow(/base Animator layer/);
  });

  it("creates and edits layer-scoped transitions with destination offsets", () => {
    const withState = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "hit",
      name: "Hit",
    });
    const source = addAnimatorTransition(
      withState,
      "base-layer",
      { kind: "anyState" },
      { kind: "state", stateId: "hit" },
      { id: "any-hit" },
    );
    const updated = patchAnimatorTransition(
      source,
      "base-layer",
      { kind: "anyState" },
      "any-hit",
      { offsetNormalized: 0.4, duration: 0.1 },
    );
    expect(source.layers[0]?.anyStateTransitions[0]?.offsetNormalized).toBe(0);
    expect(updated.layers[0]?.anyStateTransitions[0]).toMatchObject({
      id: "any-hit",
      offsetNormalized: 0.4,
      duration: 0.1,
    });
    expect(removeAnimatorTransition(
      updated, "base-layer", { kind: "anyState" }, "any-hit",
      ).layers[0]?.anyStateTransitions).toEqual([]);
  });

  it("authors local Any State, internal Exit, and parent-scope machine routes", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
    });
    controller = addAnimatorStateMachine(controller, "base-layer", undefined, { id: "action" });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", { id: "windup" });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", { id: "recover" });
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "windup" },
      { kind: "exit" },
      { id: "leave-action" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "anyState", stateMachineId: "action" },
      { kind: "state", stateId: "recover" },
      { id: "recover-any" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "state", stateId: "idle" },
      { id: "return-idle" },
    );

    expect(controller.layers[0]?.stateMachines?.[0]).toMatchObject({
      states: [{ id: "windup", transitions: [{ id: "leave-action" }] }, { id: "recover" }],
      anyStateTransitions: [{ id: "recover-any" }],
      transitions: [{ id: "return-idle" }],
    });
    expect(() => addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "windup" },
      { kind: "state", stateId: "idle" },
    )).toThrow(/state 'idle' was not found/);
    expect(() => addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "exit" },
    )).toThrow(/base Animator layer/);
  });

  it("normalizes invalid transition timing without corrupting authored values", () => {
    const withState = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "hit",
      name: "Hit",
    });
    const source = addAnimatorTransition(
      withState,
      "base-layer",
      { kind: "anyState" },
      { kind: "state", stateId: "hit" },
      { id: "any-hit" },
    );
    const updated = patchAnimatorTransition(
      source,
      "base-layer",
      { kind: "anyState" },
      "any-hit",
      {
        exitTimeNormalized: Number.NaN,
        duration: -1,
        offsetNormalized: Number.POSITIVE_INFINITY,
        durationMode: "seconds",
      },
    );
    expect(updated.layers[0]?.anyStateTransitions[0]).toMatchObject({
      exitTimeNormalized: 0.75,
      duration: 0,
      offsetNormalized: 0,
      durationMode: "seconds",
    });
  });

  it("bounds authored transitions and condition lists before persistence", () => {
    const withState = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "hit",
      name: "Hit",
    });
    const transitionFull = {
      ...withState,
      layers: [{
        ...withState.layers[0]!,
        anyStateTransitions: Array.from(
          { length: MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER },
          (_, index) => ({
            id: `any-${index}`,
            destination: { kind: "state" as const, stateId: "hit" },
            conditions: [],
            hasExitTime: false,
            exitTimeNormalized: 0,
            durationMode: "seconds" as const,
            duration: 0,
            offsetNormalized: 0,
            interruptionSource: "none" as const,
            orderedInterruption: true,
            canTransitionToSelf: false,
          }),
        ),
      }],
    };
    expect(() => addAnimatorTransition(
      transitionFull,
      "base-layer",
      { kind: "anyState" },
      { kind: "state", stateId: "hit" },
    )).toThrow(/transitions/);

    const source = addAnimatorTransition(
      withState,
      "base-layer",
      { kind: "anyState" },
      { kind: "state", stateId: "hit" },
      { id: "any-hit" },
    );
    expect(() => patchAnimatorTransition(
      source,
      "base-layer",
      { kind: "anyState" },
      "any-hit",
      {
        conditions: Array.from(
          { length: MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION + 1 },
          () => ({ parameterId: "missing", mode: "if" as const }),
        ),
      },
    )).toThrow(/conditions/);
  });

  it("rejects recursive Exit expansion and combined route conditions at authoring time", () => {
    let branching = addAnimatorState(createAnimatorController("branching"), "base-layer", {
      id: "idle",
    });
    let parentId: string | undefined;
    for (let depth = 1; depth <= 4; depth += 1) {
      const id = `machine-${depth}`;
      branching = addAnimatorStateMachine(branching, "base-layer", parentId, { id });
      parentId = id;
    }
    branching = addAnimatorStateToStateMachine(branching, "base-layer", parentId!, { id: "leaf" });
    for (let depth = 1; depth <= 4; depth += 1) {
      for (let route = 0; route < 8; route += 1) branching = addAnimatorTransition(
        branching,
        "base-layer",
        { kind: "stateMachine", stateMachineId: `machine-${depth}` },
        depth === 1 ? { kind: "state", stateId: "idle" } : { kind: "exit" },
        { id: `machine-${depth}-route-${route}` },
      );
    }
    expect(() => addAnimatorTransition(
      branching,
      "base-layer",
      { kind: "state", stateId: "leaf" },
      { kind: "exit" },
      { id: "leaf-exit" },
    )).toThrow(/2048 authored or compiled transitions/);

    let conditioned = addAnimatorState(createAnimatorController("conditions"), "base-layer", {
      id: "idle",
    });
    conditioned = addAnimatorStateMachine(conditioned, "base-layer", undefined, { id: "action" });
    conditioned = addAnimatorStateToStateMachine(conditioned, "base-layer", "action", { id: "leaf" });
    conditioned = addAnimatorTransition(
      conditioned,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "state", stateId: "idle" },
      { id: "action-route" },
    );
    conditioned = patchAnimatorTransition(
      conditioned,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      "action-route",
      { conditions: Array.from({ length: 9 }, () => ({ parameterId: "flag", mode: "if" })) },
    );
    conditioned = addAnimatorTransition(
      conditioned,
      "base-layer",
      { kind: "state", stateId: "leaf" },
      { kind: "exit" },
      { id: "leaf-exit" },
    );
    expect(() => patchAnimatorTransition(
      conditioned,
      "base-layer",
      { kind: "state", stateId: "leaf" },
      "leaf-exit",
      { conditions: Array.from({ length: 8 }, () => ({ parameterId: "flag", mode: "if" })) },
    )).toThrow(/16 combined conditions/);
  });
});
