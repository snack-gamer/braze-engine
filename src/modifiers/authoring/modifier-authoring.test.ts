import { describe, expect, it } from "vitest";
import type { BuoyancyModifier, DisplacerModifier } from "../domain/authored-modifier";
import {
  patchBuoyancyPin,
  patchBuoyancyPinOffset,
  removeBuoyancyPin,
} from "./buoyancy-pins";
import {
  displacerTexturePatch,
  parseDisplacerTextureDrop,
  patchDisplacerUvAxis,
} from "./displacer-texture";
import {
  modifierComponentCount,
  removeModifierById,
  replaceModifierById,
} from "./modifier-list";

const buoyancy: BuoyancyModifier = {
  id: "float", type: "buoyancy", name: "Float", enabled: true,
  pins: [
    { id: "bow", name: "Bow", localOffset: [1, -0.3, 0] },
    { id: "stern", name: "Stern", localOffset: [-1, -0.3, 0] },
  ],
  verticalOffset: 0, damping: 0.2, followTilt: true, tiltStrength: 0.75,
  maxTiltDeg: 18, showPinGizmos: true, pinGizmoScale: 1,
};

const displacer: DisplacerModifier = {
  id: "disp", type: "displacer", name: "Displace", enabled: true,
  strength: 0.1, midlevel: 0.5, heightClamp: 0.2, direction: "normal", source: "noise",
  noiseScale: 1, noiseDetail: 0.5, noiseContrast: 1, noiseSeed: 0,
  textureChannel: "luminance", textureInfluence: 1, uvScale: [1, 1], uvOffset: [0, 0],
  bumpEnabled: false, bumpStrength: 0.1, cameraFade: false, cameraNear: 1, cameraFar: 10,
};

describe("modifier list authoring", () => {
  it("replaces in place and removes without changing remaining evaluation order", () => {
    const replacement = { ...buoyancy, enabled: false };
    expect(replaceModifierById([displacer, buoyancy], replacement)).toEqual([displacer, replacement]);
    expect(removeModifierById([displacer, buoyancy], "disp")).toEqual([buoyancy]);
    expect(removeModifierById([buoyancy], "float")).toBeUndefined();
  });

  it("counts intrinsic and modifier-backed Inspector components", () => {
    expect(modifierComponentCount({
      id: "object", name: "Object", primitive: "transform", color: "#fff", visible: true, locked: false,
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
      modifiers: [buoyancy, displacer], animationPlayer: { enabled: true }, motionPulse: { enabled: true, targets: [] },
    })).toBe(4);
  });
});

describe("buoyancy pin authoring", () => {
  it("patches one pin, copies offsets, and protects the final pin", () => {
    const patched = patchBuoyancyPin(buoyancy.pins, "stern", { name: "Aft" });
    expect(patched.map((pin) => pin.name)).toEqual(["Bow", "Aft"]);
    expect(removeBuoyancyPin(patched, "bow")).toEqual([patched[1]]);
    expect(removeBuoyancyPin([patched[1]], "stern")).toEqual([patched[1]]);
    expect(patchBuoyancyPinOffset([1, 2, 3], 1, 9)).toEqual([1, 9, 3]);
  });
});

describe("displacer texture authoring", () => {
  it("builds exact assign and clear patches", () => {
    expect(displacerTexturePatch({ url: "/height.png", filename: "height.png", name: "Height" })).toEqual({
      textureUrl: "/height.png", textureName: "Height", textureFilename: "height.png", textureFlipY: true,
    });
    expect(displacerTexturePatch(null)).toEqual({
      textureUrl: undefined, textureName: undefined, textureFilename: undefined, textureFlipY: undefined,
    });
  });

  it("validates image drop payloads and patches one UV axis immutably", () => {
    expect(parseDisplacerTextureDrop('{"kind":"image","url":"/h.png","filename":"h.png"}')).toEqual({
      url: "/h.png", filename: "h.png", name: "h.png",
    });
    expect(parseDisplacerTextureDrop('{"kind":"model","url":"/h.glb","filename":"h.glb"}')).toBeNull();
    expect(parseDisplacerTextureDrop("invalid")).toBeNull();
    expect(patchDisplacerUvAxis([1, 2], 0, 3)).toEqual([3, 2]);
  });
});
