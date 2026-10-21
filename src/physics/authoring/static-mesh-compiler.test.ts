import { describe, expect, it } from "vitest";
import { makeObject } from "../../lib/payload";
import { defaultColliderForObject, defaultRigidbodyForObject } from "./component-defaults";
import { compileAuthoredPhysicsScene } from "./scene-compiler";
import { compileRigidWorld } from "./rigid-world-compiler";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../domain/world-settings";
import { createStaticQueryWorld } from "../runtime/queries/static-query-world";
import { serializeColliders, parsePhysicsComponents } from "../serialization/codec";

function mesh() {
  const object = makeObject("cube", 0, { id: "mesh", position: [0, 0, 0] });
  object.colliders = [{ ...defaultColliderForObject(object), shape: "mesh", geometry: {
    vertices: [-3, 0, -3, 3, 0, -3, 3, 0, 3, -3, 0, 3], indices: [0, 2, 1, 0, 3, 2],
  } }];
  return object;
}
function compile(object = mesh()) { return compileRigidWorld(compileAuthoredPhysicsScene([object], "mesh", DEFAULT_PHYSICS_WORLD_SETTINGS)); }
describe("static collision meshes", () => {
  it("persists exact local geometry and compiles independent static triangle proxies", () => {
    const object = mesh(); object.position = [2, 4, 6]; object.scale = [2, 1, 1];
    const colliders = serializeColliders(object.colliders);
    expect(parsePhysicsComponents({ colliders }, object).colliders).toEqual(object.colliders);
    const world = compile(object); expect(world.bodies).toHaveLength(2);
    expect(world.bodies.every((body) => !body.binding.writesObjectPose && body.mass === 0)).toBe(true);
    const hit = createStaticQueryWorld(world).raycast({ origin: [2, 10, 6], direction: [0, -1, 0], maxDistance: 20 });
    expect(hit?.distance).toBeCloseTo(6); expect(hit?.normal).toEqual([0, 1, 0]); expect(hit?.objectId).toBe("mesh");
  });
  it("sweeps capsules and spheres against both sides and excludes triggers by default", () => {
    const query = createStaticQueryWorld(compile());
    const capsule = query.capsuleCast({ origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 10, radius: 0.5, halfSegment: [0, 0.5, 0] });
    expect(capsule?.distance).toBeCloseTo(4);
    const below = query.sphereCast({ origin: [0, -5, 0], direction: [0, 1, 0], maxDistance: 10, radius: 0.5 });
    expect(below?.distance).toBeCloseTo(4.5); expect(below?.normal[1]).toBe(-1);
    expect(query.raycast({ origin: [4, 5, 0], direction: [0, -1, 0], maxDistance: 10 })).toBeNull();
    const object = mesh(); object.colliders![0].isTrigger = true; const sensor = createStaticQueryWorld(compile(object));
    const ray = { origin: [0, 5, 0] as [number, number, number], direction: [0, -1, 0] as [number, number, number], maxDistance: 10 };
    expect(sensor.raycast(ray)).toBeNull(); expect(sensor.raycast({ ...ray, includeTriggers: true })).not.toBeNull();
  });
  it("rejects moving concave meshes and malformed or degenerate geometry explicitly", () => {
    const object = mesh(); object.rigidbody = defaultRigidbodyForObject(object);
    expect(() => compile(object)).toThrow("must be static"); delete object.rigidbody;
    object.colliders![0].geometry!.indices = [0, 1, 99]; expect(() => compile(object)).toThrow("valid triangle indices");
    object.colliders![0].geometry!.indices = [0, 0, 0]; expect(() => compile(object)).toThrow("nondegenerate");
  });
});
