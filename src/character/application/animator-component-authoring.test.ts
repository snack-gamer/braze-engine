import { describe, expect, it } from "vitest";
import { createDefaultAnimatorComponent } from "../domain/animator-component";
import type { AnimatorParameter } from "../domain/animator-parameters";
import {
  MAX_AUTHORED_ANIMATOR_PARAMETER_OVERRIDES,
  animatorParameterValue,
  assignAnimatorControllerReference,
  embedAnimatorController,
  resetAnimatorParameterOverride,
  setAnimatorParameterOverride,
} from "./animator-component-authoring";

const INTEGER: AnimatorParameter = { id: "lives", name: "Lives", kind: "integer", defaultValue: 3 };

describe("Animator component authoring", () => {
  it("normalizes typed overrides without mutating the component", () => {
    const source = createDefaultAnimatorComponent();
    const updated = setAnimatorParameterOverride(source, INTEGER, 4.7);
    expect(source.parameterOverrides).toEqual([]);
    expect(updated.parameterOverrides).toEqual([{ parameterId: "lives", value: 5 }]);
    expect(animatorParameterValue(updated, INTEGER)).toBe(5);
    expect(animatorParameterValue(source, INTEGER)).toBe(3);
    expect(resetAnimatorParameterOverride(updated, "lives").parameterOverrides).toEqual([]);
  });

  it("clears controller-specific overrides when assigning a different controller", () => {
    const component = setAnimatorParameterOverride(createDefaultAnimatorComponent(), INTEGER, 9);
    const assigned = assignAnimatorControllerReference(component, { guid: "a".repeat(32), localId: "main" });
    expect(assigned.controllerRef).toEqual({ guid: "a".repeat(32), localId: "main" });
    expect(assigned.parameterOverrides).toEqual([]);
    expect(component.parameterOverrides).toHaveLength(1);
  });

  it("embeds a legacy controller without retaining its Project reference", () => {
    const controller = createDefaultAnimatorComponent().controller!;
    const source = assignAnimatorControllerReference(
      createDefaultAnimatorComponent(),
      { guid: "a".repeat(32), localId: "main" },
    );
    const embedded = embedAnimatorController(source, controller);

    expect(embedded.controllerRef).toBeUndefined();
    expect(embedded.controller).toEqual(controller);
    expect(embedded.controller).not.toBe(controller);
  });

  it("allows replacing an override at capacity but rejects a new one", () => {
    const component = createDefaultAnimatorComponent();
    component.parameterOverrides = Array.from(
      { length: MAX_AUTHORED_ANIMATOR_PARAMETER_OVERRIDES },
      (_, index) => ({ parameterId: `parameter-${index}`, value: index }),
    );
    const existing: AnimatorParameter = {
      id: "parameter-0",
      name: "Existing",
      kind: "float",
      defaultValue: 0,
    };
    expect(setAnimatorParameterOverride(component, existing, 42).parameterOverrides).toHaveLength(
      MAX_AUTHORED_ANIMATOR_PARAMETER_OVERRIDES,
    );
    expect(() => setAnimatorParameterOverride(component, {
      ...existing,
      id: "overflow",
      name: "Overflow",
    }, 42)).toThrow(/cannot exceed 256 parameter overrides/);
  });
});
