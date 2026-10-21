import { describe, expect, it } from "vitest";
import type { SceneObject } from "../../types";
import { DEFAULT_PHYSICS_WORLD_SETTINGS, normalizePhysicsWorldSettings } from "../domain/world-settings";
import { createPhysicsPlaybackSignatureCache, physicsPlaybackSignature } from "./playback-signature";

function body(parentId?: string): SceneObject {
  return {
    id: "body",
    name: "Body",
    primitive: "cube",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    parentId,
    rigidbody: {
      enabled: true,
      bodyType: "dynamic",
      massMode: "automatic",
      mass: 1,
      density: 1,
      useGravity: true,
      linearDamping: 0,
      angularDamping: 0.05,
      interpolation: "none",
    },
  };
}

describe("physicsPlaybackSignature", () => {
  const world = normalizePhysicsWorldSettings(DEFAULT_PHYSICS_WORLD_SETTINGS);

  it("invalidates when hierarchy ownership changes", () => {
    expect(physicsPlaybackSignature([body()], world))
      .not.toBe(physicsPlaybackSignature([body("parent")], world));
  });

  it("invalidates when any authored world setting changes", () => {
    expect(physicsPlaybackSignature([body()], world))
      .not.toBe(physicsPlaybackSignature([body()], { ...world, gravity: [0, -9.81, 0] }));
    expect(physicsPlaybackSignature([body()], world))
      .not.toBe(physicsPlaybackSignature([body()], { ...world, maxSubsteps: 20 }));
  });

  it("computes once for stable immutable references", () => {
    let calls = 0;
    const cache = createPhysicsPlaybackSignatureCache((objects, settings) => {
      calls += 1;
      return physicsPlaybackSignature(objects, settings);
    });
    const objects = [body()];
    cache.get(objects, world);
    cache.get(objects, world);
    expect(calls).toBe(1);
    cache.get([...objects], world);
    expect(calls).toBe(2);
    cache.get(objects, { ...world });
    expect(calls).toBe(3);
  });
});
