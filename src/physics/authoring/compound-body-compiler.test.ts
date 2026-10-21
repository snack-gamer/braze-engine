import { describe, expect, it } from "vitest";
import { makeObject } from "../../lib/payload";
import { defaultColliderForObject, defaultRigidbodyForObject } from "./component-defaults";
import { compileAuthoredPhysicsScene } from "./scene-compiler";
import { compileRigidWorld } from "./rigid-world-compiler";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../domain/world-settings";
import { packRigidBodies } from "../gpu/rigid-body-upload";

function scene(rotated = false) {
  const root = makeObject("transform", 0, { id: "root", position: [5, 3, 0] });
  root.rigidbody = { ...defaultRigidbodyForObject(root), massMode: "manual", mass: 2 };
  const children = [-1, 1].map((x, i) => {
    const child = makeObject("cube", i, { id: `child-${i}`, parentId: root.id, position: [x, 0, 0], rotation: [0, 0, rotated ? 30 : 0] });
    child.colliders = [{ ...defaultColliderForObject(child), shape: rotated ? "box" : "sphere", radius: 0.5, size: [1, 2, 1] }]; return child;
  });
  return compileRigidWorld(compileAuthoredPhysicsScene([root, ...children], "compound", DEFAULT_PHYSICS_WORLD_SETTINGS));
}
describe("compound rigid body compilation", () => {
  it("uses one center of mass, binding and mass for all colliders", () => {
    const world = scene(); expect(world.bodies).toHaveLength(1);
    const body = world.bodies[0]; expect(body.mass).toBeCloseTo(2); expect(body.position).toEqual([5, 3, 0]);
    expect(body.inertia[0]).toBeCloseTo(0.2); expect(body.inertia[1]).toBeCloseTo(2.2); expect(body.inertia[2]).toBeCloseTo(2.2);
    expect(body.shape).toMatchObject({ kind: "compound", children: [{ position: [-1, 0, 0] }, { position: [1, 0, 0] }] });
    const packed = packRigidBodies(world); expect(packed.initialPositions.length).toBe(4);
    expect(packed.properties.length).toBe(3 * 28); expect(Array.from(packed.properties.slice(0, 4))).toEqual([1, 2, 1.5, 3]);
  });
  it("retains rotated child inertia cross terms and packs the full inverse tensor", () => {
    const world = scene(true), body = world.bodies[0], p = packRigidBodies(world).properties;
    expect(Math.abs(body.inertiaProducts![0])).toBeGreaterThan(0.1);
    const [a, b, c] = body.inertia, [d, e, f] = body.inertiaProducts!;
    const tensor = [[a, d, e], [d, b, f], [e, f, c]], inverse = [[p[4], p[12], p[13]], [p[12], p[5], p[14]], [p[13], p[14], p[6]]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(tensor[i].reduce((sum, v, k) => sum + v * inverse[k][j], 0)).toBeCloseTo(i === j ? 1 : 0, 5);
  });
});
