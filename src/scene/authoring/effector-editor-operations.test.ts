import { describe, expect, it } from "vitest";
import { defaultClonerSettings } from "../../lib/cloner";
import { defaultEffectorSettings } from "../../lib/effector";
import type { SceneObject } from "../domain/scene-object";
import {
  cloneEffectorFalloffPreset,
  effectorClonerUsageCount,
  effectorFalloffPresetId,
  effectorShapeFields,
  effectorTargetCandidates,
  patchEffectorVector,
} from "./effector-editor-operations";

const object = (id: string, primitive: SceneObject["primitive"]): SceneObject => ({
  id, name: id, primitive, color: "#fff", visible: true, locked: false,
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
});

describe("effector editor operations", () => {
  it("identifies and clones falloff presets without sharing authored keys", () => {
    expect(effectorFalloffPresetId(defaultEffectorSettings.falloff)).toBe("smooth");
    const linear = cloneEffectorFalloffPreset("linear");
    expect(effectorFalloffPresetId(linear ?? [])).toBe("linear");
    expect(linear?.[0]).not.toBe(cloneEffectorFalloffPreset("linear")?.[0]);
    expect(cloneEffectorFalloffPreset("missing")).toBeNull();
  });

  it("patches one vector axis without mutating the normalized settings", () => {
    expect(patchEffectorVector(defaultEffectorSettings, "movement", 0, 4)).toEqual({ movement: [4, 1, 0] });
    expect(defaultEffectorSettings.movement).toEqual([0, 1, 0]);
  });

  it("derives shape controls, target candidates, and cloner usage", () => {
    expect(effectorShapeFields("cone")).toEqual({ hasHeight: true, hasRadius: true });
    expect(effectorShapeFields("box")).toEqual({ hasHeight: false, hasRadius: false });
    const owner = object("owner", "effector");
    const otherEffector = object("other", "effector");
    const mesh = object("mesh", "cube");
    const cloner = {
      ...object("cloner", "cloner"),
      cloner: { ...defaultClonerSettings, effectorIds: ["owner"] },
    };
    expect(effectorTargetCandidates([owner, otherEffector, mesh], "owner").map((item) => item.id)).toEqual(["mesh"]);
    expect(effectorClonerUsageCount([owner, cloner], "owner")).toBe(1);
  });
});
