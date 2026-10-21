import { describe, expect, it } from "vitest";
import { createStaticQueryWorld } from "./static-query-world";
import { compileAuthoredPhysicsScene } from "../../authoring/scene-compiler";
import { compileRigidWorld } from "../../authoring/rigid-world-compiler";
import { makeObject } from "../../../lib/payload";
import { defaultColliderForObject, defaultRigidbodyForObject } from "../../authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../domain/world-settings";

function fixture() {
  const floor = makeObject("cube", 0, { id: "floor", position: [0, -0.5, 0], scale: [20, 1, 20] });
  floor.colliders = [{ ...defaultColliderForObject(floor), size: [1, 1, 1] }];
  const ball = makeObject("sphere", 1, { id: "dynamic", position: [0, 3, 0] });
  ball.colliders = [defaultColliderForObject(ball)]; ball.rigidbody = defaultRigidbodyForObject(ball);
  return createStaticQueryWorld(compileRigidWorld(compileAuthoredPhysicsScene([floor, ball], "query", DEFAULT_PHYSICS_WORLD_SETTINGS)));
}
describe("immediate static queries", () => {
  it("sweeps an entire capsule and ignores separating initial contact only when requested", () => {
    const world = fixture();
    const query = { origin: [0, 5, 0] as [number, number, number], direction: [0, -1, 0] as [number, number, number], maxDistance: 10, radius: 0.5, halfSegment: [0, 1, 0] as [number, number, number] };
    expect(world.capsuleCast(query)?.distance).toBeCloseTo(3.5);
    const touching = { ...query, origin: [0, 1.5, 0] as [number, number, number], direction: [1, 0, 0] as [number, number, number] };
    expect(world.capsuleCast(touching)?.distance).toBe(0);
    expect(world.capsuleCast({ ...touching, ignoreInitialSeparating: true })).toBeNull();
    expect(() => world.capsuleCast({ ...query, halfSegment: [0, NaN, 0] })).toThrow();
  });
  it("returns exact ground distance and excludes dynamic body guesses", () => {
    const world = fixture(); expect(world.bodyCount).toBe(1);
    const hit = world.raycast({ origin: [0, 5, 0], direction: [0, -2, 0], maxDistance: 10 });
    expect(hit?.objectId).toBe("floor"); expect(hit?.distance).toBeCloseTo(5); expect(hit?.normal).toEqual([0, 1, 0]);
  });
  it("sweeps a sphere to contact and observes distance/exclusion bounds", () => {
    const world = fixture(); const query = { origin: [0, 5, 0] as [number, number, number], direction: [0, -1, 0] as [number, number, number], maxDistance: 10, radius: 0.5 };
    expect(world.sphereCast(query)?.distance).toBeCloseTo(4.5);
    expect(world.sphereCast({ ...query, maxDistance: 4 })).toBeNull();
    expect(world.sphereCast({ ...query, excludeObjectId: "floor" })).toBeNull();
    expect(() => world.raycast({ ...query, direction: [0, 0, 0] })).toThrow();
  });
});
