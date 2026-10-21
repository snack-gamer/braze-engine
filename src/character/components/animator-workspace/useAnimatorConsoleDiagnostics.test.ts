import { describe, expect, it } from "vitest";
import { createAnimatorController, createAnimatorState } from "../../domain/animator-controller";
import { animatorConsoleDiagnosticEntry } from "./useAnimatorConsoleDiagnostics";

describe("Animator Console diagnostics", () => {
  it("presents an empty Blend Tree as a contextual Console error", () => {
    const source = createAnimatorController("controller", "Hero Controller");
    const blend = createAnimatorState("blend", "Locomotion");
    blend.motion = {
      kind: "blendTree",
      tree: { kind: "1d", parameterId: "speed", children: [] },
    };
    const layer = { ...source.layers[0]!, states: [blend], defaultStateId: blend.id };
    const entry = animatorConsoleDiagnosticEntry({ ...source, layers: [layer] }, {
      code: "empty-blend-tree",
      severity: "error",
      message: "Runtime-only wording.",
      details: { layerId: layer.id, stateId: blend.id },
    });

    expect(entry).toMatchObject({
      level: "error",
      method: "diagnostic",
      message: "Blend Tree “Locomotion” has no child motions. Add at least one Animation Clip.",
      source: "Hero Controller / Base Layer / Locomotion",
      channel: "Animator",
      code: "empty-blend-tree",
    });
  });

  it("maps informational diagnostics to Console logs", () => {
    const controller = createAnimatorController("controller");
    expect(animatorConsoleDiagnosticEntry(controller, {
      code: "animator-note",
      severity: "info",
      message: "Animator information",
    })).toMatchObject({ level: "log", message: "Animator information" });
  });
});
