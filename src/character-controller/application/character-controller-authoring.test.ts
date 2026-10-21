import { describe, expect, it } from "vitest";
import type { SceneObject } from "../../scene/domain/scene-object";
import {
  characterControllerBackingIssue,
  characterControllerUnavailableReason,
  createCharacterControllerPatch,
} from "./character-controller-authoring";

function object(patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id: "hero",
    name: "Hero",
    primitive: "fbx",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

describe("Character Controller authoring", () => {
  it("adds one vertical capsule and one kinematic transform owner", () => {
    const source = object();
    const patch = createCharacterControllerPatch(source);
    expect(patch.characterController).toMatchObject({ enabled: true });
    expect(patch.rigidbody).toMatchObject({ enabled: true, bodyType: "kinematic", useGravity: false });
    expect(patch.colliders).toHaveLength(1);
    expect(patch.colliders?.[0]).toMatchObject({
      id: patch.characterController?.capsuleColliderId,
      shape: "capsule",
      axis: "y",
      center: [0, 0.9, 0],
      radius: 0.35,
      length: 1.1,
    });
    expect(characterControllerBackingIssue({ ...source, ...patch })).toBeUndefined();
  });

  it("reuses an authored capsule instead of duplicating collision state", () => {
    const first = createCharacterControllerPatch(object());
    const source = object({ colliders: first.colliders });
    const patch = createCharacterControllerPatch(source);
    expect(patch.colliders).toBe(source.colliders);
    expect(patch.characterController?.capsuleColliderId).toBe(first.colliders?.[0]?.id);
  });

  it("repairs backing physics without rebinding a valid authored capsule", () => {
    const first = createCharacterControllerPatch(object()).colliders![0]!;
    const selected = { ...first, id: "hero-selected-capsule", radius: 0.6 };
    const source = object({
      colliders: [first, selected],
      characterController: {
        version: 1,
        enabled: true,
        capsuleColliderId: selected.id,
      },
    });

    const patch = createCharacterControllerPatch(source);

    expect(patch.characterController?.capsuleColliderId).toBe(selected.id);
    expect(patch.colliders).toBe(source.colliders);
  });

  it("refuses to silently replace a Dynamic Rigidbody", () => {
    const source = object({
      rigidbody: {
        enabled: true,
        bodyType: "dynamic",
        massMode: "automatic",
        mass: 1,
        density: 1,
        useGravity: true,
        linearDamping: 0,
        angularDamping: 0,
        interpolation: "none",
      },
    });
    expect(characterControllerUnavailableReason(source)).toContain("Kinematic Rigidbody");
  });
});
