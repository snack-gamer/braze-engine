import { describe, expect, it } from "vitest";
import type { RigidBodyDescriptor } from "../../physics/runtime/rigid-world-descriptor";
import { createStaticQueryWorld } from "../../physics/runtime/queries/static-query-world";
import { DEFAULT_CHARACTER_MOVEMENT } from "../domain/character-movement";
import { moveStaticCharacter } from "./static-character-movement";

type Vec = [number, number, number];
function box(id: string, position: Vec, halfExtents: Vec, tilt = 0): RigidBodyDescriptor {
  return { binding: { objectId: id, colliderId: id, bodyType: "static", interpolation: "none", writesObjectPose: false,
    objectPosition: position, objectOrientation: [0, 0, 0, 1], objectLocalOffset: [0, 0, 0], objectLocalOrientation: [0, 0, 0, 1] },
    position, orientation: [0, 0, Math.sin(tilt / 2), Math.cos(tilt / 2)], shape: { kind: "box", halfExtents },
    mass: 0, inertia: [0, 0, 0], gravityScale: 0, linearDamping: 0, angularDamping: 0, friction: 0.5 };
}
const floor = box("floor", [0, -0.5, 0], [20, 0.5, 20]);
function move(obstacles: RigidBodyDescriptor[], displacement: Vec, position: Vec = [0, 0.9, 0], options = {}, wasGrounded = false) {
  const world = createStaticQueryWorld({ bodies: [floor, ...obstacles], gravity: [0, -9.81, 0], fixedTimestep: 1 / 60 });
  return moveStaticCharacter({ objectId: "hero", position, displacement, radius: 0.35, halfLength: 0.55,
    settings: { ...DEFAULT_CHARACTER_MOVEMENT, ...options }, cast: world.capsuleCast, wasGrounded });
}
describe("static character movement", () => {
  it("climbs successive steps with short per-tick displacements", () => {
    const stairs = [box("first", [1.5, 0.1, 0], [0.5, 0.1, 2]), box("second", [2.5, 0.25, 0], [0.5, 0.25, 2])];
    let position: Vec = [0, 0.9, 0], grounded = false;
    for (let i = 0; i < 35; i++) { const result = move(stairs, [0.08, -0.003, 0], position, { stepHeight: 0.35 }, grounded); position = result.position; grounded = result.grounded; }
    expect(position[0]).toBeGreaterThan(2.5); expect(position[1]).toBeCloseTo(1.42, 3); expect(grounded).toBe(true);
  });
  it("recovers skin clearance and moves across ground without sticking", () => {
    const result = move([], [2, 0, 1]);
    expect(result.position[0]).toBeCloseTo(2, 4); expect(result.position[2]).toBeCloseTo(1, 4);
    expect(result.position[1]).toBeCloseTo(0.92, 4); expect(result.grounded).toBe(true);
    expect(result.groundObjectId).toBe("floor");
  });
  it("slides along walls without crossing them", () => {
    const result = move([box("wall", [2, 2, 0], [0.1, 2, 10])], [4, 0, 3]);
    expect(result.position[0]).toBeCloseTo(1.53, 3); expect(result.position[2]).toBeCloseTo(3, 3);
    expect(result.blocked).toBe(true);
  });
  it("steps onto a reachable ledge and rejects a high ledge", () => {
    const low = move([box("step", [1.5, 0.1, 0], [0.5, 0.1, 2])], [1.5, 0, 0]);
    expect(low.position[0]).toBeCloseTo(1.5, 3); expect(low.position[1]).toBeCloseTo(1.12, 3);
    expect(low.stepped).toBe(true); expect(low.grounded).toBe(true);
    const high = move([box("step", [1.5, 0.3, 0], [0.5, 0.3, 2])], [1.5, 0, 0]);
    expect(high.position[0]).toBeLessThan(1); expect(high.stepped).toBe(false);
  });
  it("does not step when the ceiling leaves insufficient clearance", () => {
    const result = move([box("step", [1.5, 0.1, 0], [0.5, 0.1, 2]), box("ceiling", [0, 2.05, 0], [3, 0.05, 3])], [1.5, 0, 0]);
    expect(result.position[0]).toBeLessThan(1); expect(result.stepped).toBe(false);
  });
  it("lands, leaves a ledge, and lets explicit upward movement break grounding", () => {
    expect(move([], [0, -5, 0], [0, 4, 0]).position[1]).toBeCloseTo(0.92, 3);
    expect(move([], [0, 1, 0]).grounded).toBe(false);
    const off = move([], [25, 0, 0]); expect(off.grounded).toBe(false);
  });
  it("climbs a walkable slope but blocks a steep slope", () => {
    const ramp = box("ramp", [2, 0, 0], [2, 0.1, 2], Math.PI / 6);
    const allowed = move([ramp], [2.3, 0, 0], [-0.5, 0.9, 0]);
    expect(allowed.position[0]).toBeGreaterThan(1); expect(allowed.position[1]).toBeGreaterThan(0.95);
    const denied = move([ramp], [2.3, 0, 0], [-0.5, 0.9, 0], { maxSlopeDegrees: 20, stepHeight: 0 });
    expect(denied.position[0]).toBeLessThan(allowed.position[0]);
    expect(denied.position[1]).toBeCloseTo(0.92, 3);
  });
  it("stops in a corner and allows moving away on the next command", () => {
    const walls = [box("x", [2, 2, 0], [0.1, 2, 10]), box("z", [0, 2, 2], [10, 2, 0.1])];
    const stuck = move(walls, [5, 0, 5]);
    expect(stuck.position[0]).toBeLessThan(1.531); expect(stuck.position[2]).toBeLessThan(1.531);
    const away = move(walls, [-1, 0, -1], stuck.position);
    expect(away.position[0]).toBeCloseTo(stuck.position[0] - 1, 3);
  });
  it("reports an enclosed spawn instead of silently teleporting out", () => {
    expect(() => move([box("solid", [0, 1, 0], [3, 3, 3])], [1, 0, 0])).toThrow("embedded");
  });
});
