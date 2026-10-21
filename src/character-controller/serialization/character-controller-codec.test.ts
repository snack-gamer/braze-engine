import { describe, expect, it } from "vitest";
import {
  decodeCharacterController,
  encodeCharacterController,
} from "./character-controller-codec";

describe("Character Controller codec", () => {
  it("round trips movement settings and normalizes malformed values", () => {
    const component = decodeCharacterController({ capsuleColliderId: "hero", movement: { skinWidth: -1, maxSlopeDegrees: 120, stepHeight: 0, groundSnap: "bad" } })!;
    expect(component.movement).toEqual({ skinWidth: 0.001, maxSlopeDegrees: 89, stepHeight: 0, groundSnap: 0.15 });
    expect(decodeCharacterController(encodeCharacterController(component))).toEqual(component);
  });
  it("round trips the stable collider reference", () => {
    const encoded = encodeCharacterController({
      version: 1,
      enabled: true,
      capsuleColliderId: "hero-capsule",
    });
    expect(encoded).toEqual({
      version: "braze/character-controller-v1",
      enabled: true,
      capsule_collider_id: "hero-capsule",
    });
    expect(decodeCharacterController(encoded)).toEqual({
      version: 1,
      enabled: true,
      capsuleColliderId: "hero-capsule",
    });
  });

  it("fails closed when the backing collider reference is absent", () => {
    expect(decodeCharacterController({ enabled: true })).toBeUndefined();
    expect(decodeCharacterController({
      version: "braze/character-controller-v99",
      capsule_collider_id: "hero-capsule",
    })).toBeUndefined();
  });
});
