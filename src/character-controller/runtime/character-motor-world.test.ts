import { expect, it, vi } from "vitest";
import { makeObject } from "../../lib/payload";
import { createCharacterControllerPatch } from "../application/character-controller-authoring";
import { defaultColliderForObject } from "../../physics/authoring/component-defaults";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import { createCharacterMotorWorld } from "./character-motor-world";
import { applyKinematicMotorDelta, indexKinematicBindings, initialKinematicObjectPoses } from "../../three/physics/kinematic-character-motor";

it("constrains root motion using the capsule center and preserves authored transforms", () => {
  const parent = makeObject("transform", 0, { id: "parent", position: [5, 0, 0], rotation: [0, 90, 0] });
  const hero = makeObject("cube", 1, { id: "hero", parentId: parent.id, position: [0, 0, 0] });
  Object.assign(hero, createCharacterControllerPatch(hero));
  const floor = makeObject("cube", 2, { id: "floor", position: [0, -0.5, 0] });
  floor.colliders = [{ ...defaultColliderForObject(floor), size: [40, 1, 40] }];
  const objects = [parent, hero, floor], original = structuredClone(objects);
  const world = compileRigidWorld(compileAuthoredPhysicsScene(objects, "test", DEFAULT_PHYSICS_WORLD_SETTINGS));
  const characters = createCharacterMotorWorld(objects, world), bindings = world.bodies.map((body) => body.binding);
  const objectPoses = initialKinematicObjectPoses(bindings), writeKinematicBodyPose = vi.fn();
  applyKinematicMotorDelta({ objectPoses, bodyBindings: bindings, bodyIndices: indexKinematicBindings(bindings),
    prepareMovement: characters.prepareMovement, runtime: { writeKinematicBodyPose } }, "hero", { translation: [1, 0, 0], rotation: [0, 0, 0, 1] }, vi.fn());
  expect(objectPoses.get("hero")!.position[0]).toBeCloseTo(5);
  expect(objectPoses.get("hero")!.position[1]).toBeCloseTo(0.02, 4);
  expect(objectPoses.get("hero")!.position[2]).toBeCloseTo(-1);
  expect(writeKinematicBodyPose.mock.calls[0][1][1]).toBeCloseTo(0.92, 4);
  expect(characters.result("hero")!.grounded).toBe(true); expect(objects).toEqual(original);
});

it("rejects tilted controllers before they can command an unsupported sweep", () => {
  const hero = makeObject("cube", 0, { id: "hero", rotation: [0, 0, 20] });
  Object.assign(hero, createCharacterControllerPatch(hero));
  const world = compileRigidWorld(compileAuthoredPhysicsScene([hero], "test", DEFAULT_PHYSICS_WORLD_SETTINGS));
  expect(() => createCharacterMotorWorld([hero], world)).toThrow("world-upright");
});

it("excludes destroyed static geometry from character sweeps and retires destroyed characters", () => {
  const hero = makeObject("cube", 0, { id: "hero", position: [0, 0, 0] });
  Object.assign(hero, createCharacterControllerPatch(hero));
  const floor = makeObject("cube", 1, { id: "floor", position: [0, -0.5, 0] });
  floor.colliders = [{ ...defaultColliderForObject(floor), size: [40, 1, 40] }];
  const objects = [hero, floor], world = compileRigidWorld(compileAuthoredPhysicsScene(objects, "test", DEFAULT_PHYSICS_WORLD_SETTINGS));
  const characters = createCharacterMotorWorld(objects, world);
  const current = { position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const };
  const target = { ...current, position: [0, -1, 0] as const };
  expect(characters.constrain("hero", current, target).position[1]).toBeGreaterThanOrEqual(0);
  characters.setRemoved("floor", true);
  expect(characters.constrain("hero", current, target).position[1]).toBe(-1);
  characters.setRemoved("floor", false);
  expect(characters.constrain("hero", current, target).position[1]).toBeGreaterThanOrEqual(0);
  characters.setRemoved("hero", true); expect(characters.has("hero")).toBe(false); expect(characters.result("hero")).toBeUndefined();
  characters.retire("hero"); characters.setRemoved("hero", false); expect(characters.has("hero")).toBe(false);
});
