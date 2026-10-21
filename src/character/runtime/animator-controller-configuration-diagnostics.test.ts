import { describe, expect, it } from "vitest";
import type { AnimatorController, AnimatorState } from "../domain/animator-controller";
import { compileAnimatorController } from "./animator-controller-compiler";

const CLIP_REF = { guid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", localId: "idle" } as const;

function state(id: string, motion: AnimatorState["motion"]): AnimatorState {
  return {
    id,
    name: id === "idle" ? "Idle" : "Spare",
    motion,
    speed: 1,
    cycleOffset: 0,
    mirror: false,
    footIk: false,
    writeDefaults: true,
    transitions: [],
    events: [],
  };
}

function controller(states: AnimatorState[], defaultStateId: string): AnimatorController {
  return {
    version: 1,
    id: "controller",
    name: "Controller",
    revision: "revision-1",
    parameters: [],
    layers: [{
      id: "base",
      name: "Base Layer",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId,
      states,
      anyStateTransitions: [],
    }],
  };
}

describe("Animator controller configuration diagnostics", () => {
  it.each([
    ["1D", { kind: "blendTree", tree: { kind: "1d", parameterId: "x", children: [] } }, ["x"]],
    ["2D", { kind: "blendTree", tree: { kind: "2dFreeformCartesian", parameterXId: "x", parameterYId: "y", children: [] } }, ["x", "y"]],
    ["Direct", { kind: "blendTree", tree: { kind: "direct", normalizeWeights: true, children: [] } }, []],
  ] as const)("reports one actionable issue for an empty %s Blend Tree", (_kind, motion, parameterIds) => {
    const source = controller([state("blend", motion as unknown as AnimatorState["motion"])], "blend");
    source.parameters.push(...parameterIds.map((id) => ({
      id,
      name: id.toUpperCase(),
      kind: "float" as const,
      defaultValue: 0,
    })));

    const result = compileAnimatorController(source, () => 1);
    const issues = result.diagnostics.filter((diagnostic) => diagnostic.code === "empty-blend-tree");

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: "error",
      details: { layerId: "base", stateId: "blend" },
    });
  });

  it("warns when the default state has no playable motion", () => {
    const result = compileAnimatorController(controller([state("idle", null)], "idle"), () => 1);

    expect(result.value).not.toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "missing-default-state-motion",
      severity: "warning",
      details: { layerId: "base", stateId: "idle" },
    }));
  });

  it("does not warn for an unused empty state", () => {
    const clip = { kind: "clip", clipRef: CLIP_REF, speed: 1 } as const;
    const result = compileAnimatorController(controller([
      state("idle", clip),
      state("spare", null),
    ], "idle"), () => 1);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code))
      .not.toContain("missing-default-state-motion");
  });
});
