import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import { findAnimatorState, findAnimatorStateMachine } from "../domain/animator-state-machine";
import {
  addAnimatorBlendTreeState,
  addAnimatorBlendTreeStateWithDefaultParameters,
  replaceAnimatorBlendTreeStateKind,
} from "./animator-blend-tree-state-authoring";
import { addAnimatorParameter } from "./animator-controller-authoring";
import { addAnimatorStateMachine } from "./animator-state-machine-authoring";

function controllerWithParameters(
  parameters: readonly Readonly<{ id: string; kind: "float" | "integer" }>[],
) {
  return parameters.reduce(
    (controller, parameter) => addAnimatorParameter(controller, parameter.kind, {
      id: parameter.id,
      name: parameter.id,
    }),
    createAnimatorController("controller"),
  );
}

describe("Animator Blend Tree state authoring", () => {
  it("creates missing Float axes and reuses them when the Blend Tree kind changes", () => {
    const created = addAnimatorBlendTreeStateWithDefaultParameters(
      createAnimatorController("controller"),
      { layerId: "base-layer" },
      {
        kind: "1d",
        stateId: "locomotion",
        name: "Locomotion",
      },
    );
    expect(created.controller.parameters).toMatchObject([
      { name: "Blend", kind: "float", defaultValue: 0 },
    ]);

    const converted = replaceAnimatorBlendTreeStateKind(
      created.controller,
      "base-layer",
      "locomotion",
      "2dFreeformCartesian",
    );
    expect(converted.parameters).toMatchObject([
      { name: "Blend", kind: "float" },
      { name: "Blend Y", kind: "float" },
    ]);
    expect(findAnimatorState(converted.layers[0]!, "locomotion")?.state.motion).toMatchObject({
      kind: "blendTree",
      tree: {
        kind: "2dFreeformCartesian",
        parameterXId: converted.parameters[0]!.id,
        parameterYId: converted.parameters[1]!.id,
      },
    });
  });

  it("creates both Float axes for a 2D Blend Tree when the controller has none", () => {
    const result = addAnimatorBlendTreeStateWithDefaultParameters(
      createAnimatorController("controller"),
      { layerId: "base-layer" },
      { kind: "2dFreeformCartesian", stateId: "locomotion" },
    );
    expect(result.controller.parameters).toMatchObject([
      { name: "Blend X", kind: "float" },
      { name: "Blend Y", kind: "float" },
    ]);
  });

  it("creates a root 1D state using an existing Float parameter", () => {
    const source = controllerWithParameters([{ id: "speed", kind: "float" }]);
    const result = addAnimatorBlendTreeState(source, { layerId: "base-layer" }, {
      kind: "1d",
      parameterId: "speed",
      stateId: "locomotion",
      name: "Locomotion",
      makeDefault: false,
    });

    expect(source.layers[0]?.states).toEqual([]);
    expect(result).toMatchObject({ stateId: "locomotion" });
    expect(result.controller.layers[0]).toMatchObject({
      defaultStateId: "",
      states: [{
        id: "locomotion",
        name: "Locomotion",
        motion: {
          kind: "blendTree",
          tree: { kind: "1d", parameterId: "speed", children: [] },
        },
      }],
    });
  });

  it("creates a 2D state in the requested nested state-machine scope", () => {
    let source = controllerWithParameters([
      { id: "horizontal", kind: "float" },
      { id: "vertical", kind: "float" },
    ]);
    source = addAnimatorStateMachine(source, "base-layer", undefined, { id: "movement" });
    source = addAnimatorStateMachine(source, "base-layer", "movement", { id: "grounded" });
    const result = addAnimatorBlendTreeState(source, {
      layerId: "base-layer",
      stateMachineId: "grounded",
    }, {
      kind: "2dFreeformCartesian",
      parameterXId: "horizontal",
      parameterYId: "vertical",
      stateId: "strafe",
      name: "Strafe",
    });
    const layer = result.controller.layers[0]!;

    expect(layer.states).toEqual([]);
    expect(findAnimatorState(layer, "strafe")).toMatchObject({
      ownerMachineId: "grounded",
      state: {
        motion: {
          kind: "blendTree",
          tree: {
            kind: "2dFreeformCartesian",
            parameterXId: "horizontal",
            parameterYId: "vertical",
            children: [],
          },
        },
      },
    });
    expect(findAnimatorStateMachine(layer, "grounded")?.machine.defaultStateId).toBe("strafe");
  });

  it("rejects missing, non-Float, and repeated axis parameters before creating a state", () => {
    const source = controllerWithParameters([
      { id: "speed", kind: "float" },
      { id: "direction", kind: "integer" },
    ]);

    expect(() => addAnimatorBlendTreeState(source, { layerId: "base-layer" }, {
      kind: "1d",
      parameterId: "missing",
      stateId: "missing-state",
    })).toThrow(/parameter 'missing' was not found/);
    expect(() => addAnimatorBlendTreeState(source, { layerId: "base-layer" }, {
      kind: "1d",
      parameterId: "direction",
      stateId: "integer-state",
    })).toThrow(/must be a Float parameter/);
    expect(() => addAnimatorBlendTreeState(source, { layerId: "base-layer" }, {
      kind: "2dSimpleDirectional",
      parameterXId: "speed",
      parameterYId: "speed",
      stateId: "repeated-axis-state",
    })).toThrow(/different Float parameters/);
    expect(source.layers[0]?.states).toEqual([]);
  });
});
