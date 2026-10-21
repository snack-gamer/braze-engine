import { describe, expect, it } from "vitest";
import { defaultClonerSettings } from "../lib/cloner";
import { defaultEffectorSettings } from "../lib/effector";
import type { SceneObject } from "../types";
import { clonerHasAnimatedEffectors } from "./cloner";

function object(id: string, primitive: SceneObject["primitive"]): SceneObject {
  return {
    id,
    name: id,
    primitive,
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

describe("animated cloner detection", () => {
  it("requires an enabled cloner to reference a visible animated effector", () => {
    const cloner = object("cloner", "cloner");
    const effector = object("effector", "effector");
    cloner.cloner = { ...defaultClonerSettings, effectorIds: [effector.id] };
    effector.effector = {
      ...defaultEffectorSettings,
      type: "random",
      randomMode: "noise",
      animationSpeed: 1,
    };

    expect(clonerHasAnimatedEffectors([cloner, effector])).toBe(true);
    expect(clonerHasAnimatedEffectors([cloner, { ...effector, visible: false }])).toBe(false);
    expect(clonerHasAnimatedEffectors([{ ...cloner, cloner: { ...cloner.cloner!, effectorIds: [] } }, effector])).toBe(false);
    expect(clonerHasAnimatedEffectors([cloner, {
      ...effector,
      effector: { ...effector.effector!, animationSpeed: 0 },
    }])).toBe(false);
  });
});
