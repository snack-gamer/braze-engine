import { describe, expect, it } from "vitest";
import type { ColliderComponent, SceneObject } from "../../types";
import { DEFAULT_PHYSICS_WORLD_SETTINGS, normalizePhysicsWorldSettings } from "../domain/world-settings";
import { compileAuthoredPhysicsScene } from "./scene-compiler";
import { compileRigidWorld } from "./rigid-world-compiler";

function object(overrides: Partial<SceneObject> & Pick<SceneObject, "id">): SceneObject {
  const { id, ...rest } = overrides;
  return {
    id,
    name: id,
    primitive: "cube",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...rest,
  };
}

function collider(id: string, overrides: Partial<ColliderComponent> = {}): ColliderComponent {
  return {
    id,
    enabled: true,
    shape: "box",
    center: [0, 0, 0],
    size: [1, 2, 3],
    radius: 0.5,
    length: 1,
    majorRadius: 0.5,
    minorRadius: 0.1,
    friction: 0.4,
    showGizmo: true,
    ...overrides,
  };
}

const world = normalizePhysicsWorldSettings(DEFAULT_PHYSICS_WORLD_SETTINGS);

describe("compileAuthoredPhysicsScene", () => {
  it("uses hierarchy poses, inherited scale, and Collider center", () => {
    const parent = object({ id: "parent", position: [10, 0, 0], rotation: [0, 90, 0], scale: [2, 2, 2] });
    const child = object({
      id: "child",
      parentId: "parent",
      position: [1, 0, 0],
      rigidbody: {
        enabled: true,
        bodyType: "dynamic",
        massMode: "manual",
        mass: 5,
        density: 2,
        useGravity: false,
        linearDamping: 0.2,
        angularDamping: 0.3,
        interpolation: "none",
      },
      colliders: [collider("child-collider-1", { center: [0, 1, 0] })],
    });
    const compiled = compileAuthoredPhysicsScene([parent, child], "test", { ...world, gravity: [1, -9.81, 2] });
    expect(compiled.settings.gravity).toEqual([1, -9.81, 2]);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.bodies).toHaveLength(1);
    expect(compiled.bodies[0]!.position[0]).toBeCloseTo(10, 8);
    expect(compiled.bodies[0]!.position[1]).toBeCloseTo(2, 8);
    expect(compiled.bodies[0]!.position[2]).toBeCloseTo(-2, 8);
    expect(compiled.bodies[0]!.objectLocalOffset).toEqual([0, -2, 0]);

    const adapted = compileRigidWorld(compiled);
    expect(adapted.bodies[0]?.binding).toMatchObject({ objectId: "child", colliderId: "child-collider-1" });
    expect(adapted.gravity).toEqual([1, -9.81, 2]);
    expect(adapted.bodies[0]).toMatchObject({ mass: 5, gravityScale: 0, linearDamping: 0.2, angularDamping: 0.3 });
    expect(adapted.bodies[0]!.shape).toEqual({ kind: "box", halfExtents: [1, 2, 3] });
  });

  it("reports hierarchy shear and a missing Collider", () => {
    const parent = object({ id: "parent", rotation: [0, 45, 0], scale: [2, 1, 1] });
    const child = object({
      id: "child",
      parentId: "parent",
      rotation: [0, 0, 30],
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
    const compiled = compileAuthoredPhysicsScene([parent, child], "test", world);
    expect(compiled.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsupported-sheared-transform",
      "missing-collider",
    ]);
    expect(compiled.bodies).toEqual([]);
  });

  it("supports static and dynamic compounds with one authored Rigidbody", () => {
    const ground = object({ id: "ground", colliders: [collider("a"), collider("b", { center: [2, 0, 0] })] });
    const staticCompiled = compileAuthoredPhysicsScene([ground], "static", world);
    expect(staticCompiled.bodies).toHaveLength(2);
    expect(staticCompiled.bodies.every((body) => body.bodyType === "static" && body.density === 0)).toBe(true);

    const dynamic = object({
      ...ground,
      id: "dynamic",
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
    const dynamicCompiled = compileAuthoredPhysicsScene([dynamic], "dynamic", world);
    expect(dynamicCompiled.bodies).toHaveLength(2);
    expect(dynamicCompiled.diagnostics).toEqual([]);
    expect(dynamicCompiled.bodies.map((body) => body.writesObjectPose)).toEqual([true, false]);
    const rigid = compileRigidWorld(dynamicCompiled);
    expect(rigid.bodies).toHaveLength(1);
    expect(rigid.bodies[0].shape.kind).toBe("compound");
  });

  it("collects child Colliders into the nearest ancestor Rigidbody", () => {
    const root = object({
      id: "root",
      position: [4, 0, 0],
      rigidbody: {
        enabled: true,
        bodyType: "dynamic",
        massMode: "manual",
        mass: 12,
        density: 1,
        useGravity: true,
        linearDamping: 0,
        angularDamping: 0,
        interpolation: "none",
      },
      colliders: [collider("root-shape")],
    });
    const child = object({
      id: "child",
      parentId: "root",
      position: [2, 0, 0],
      colliders: [collider("child-shape", { shape: "sphere", radius: 1 })],
    });
    const compiled = compileAuthoredPhysicsScene([root, child], "hierarchy-compound", world);
    expect(compiled.bodies).toHaveLength(2);
    expect(compiled.bodies.map((body) => body.objectId)).toEqual(["root", "root"]);
    expect(compiled.bodies.map((body) => body.colliderOwnerId)).toEqual(["root", "child"]);
    expect(compiled.bodies.reduce((sum, body) => sum + body.mass, 0)).toBeCloseTo(12, 8);
  });

  it("compiles a Kinematic Rigidbody as authored, movable collision geometry", () => {
    const kinematic = object({
      id: "platform",
      rigidbody: {
        enabled: true,
        bodyType: "kinematic",
        massMode: "manual",
        mass: 20,
        density: 1,
        useGravity: true,
        linearDamping: 5,
        angularDamping: 5,
        interpolation: "interpolate",
      },
      colliders: [collider("platform-shape")],
    });
    const compiled = compileAuthoredPhysicsScene([kinematic], "kinematic", world);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.bodies[0]).toMatchObject({
      bodyType: "kinematic",
      density: 0,
      mass: 0,
      useGravity: false,
      linearDamping: 0,
      angularDamping: 0,
    });
    expect(() => compileRigidWorld(compiled)).toThrow("interpolation");
    compiled.bodies[0].interpolation = "none";
    expect(compileRigidWorld(compiled).bodies[0]).toMatchObject({ mass: 0, binding: { bodyType: "kinematic", writesObjectPose: true } });
  });

  it("orients a Character Controller capsule vertically without changing its authored root pose", () => {
    const character = object({
      id: "character",
      rigidbody: {
        enabled: true,
        bodyType: "kinematic",
        massMode: "automatic",
        mass: 1,
        density: 1,
        useGravity: false,
        linearDamping: 0,
        angularDamping: 0,
        interpolation: "none",
      },
      colliders: [collider("character-capsule", {
        shape: "capsule",
        axis: "y",
        center: [0, 1, 0],
        radius: 0.4,
        length: 1.2,
      })],
      characterController: {
        version: 1,
        enabled: true,
        capsuleColliderId: "character-capsule",
      },
    });
    const compiled = compileAuthoredPhysicsScene([character], "character", world);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.bodies[0]).toMatchObject({
      objectId: "character",
      bodyType: "kinematic",
      position: [0, 1, 0],
      objectPosition: [0, 0, 0],
      worldScale: [1, 1, 1],
    });
    expect(compiled.bodies[0]?.orientation).toEqual([0, 0, 0, 1]);
    expect(compileRigidWorld(compiled).bodies[0].shape).toEqual({ kind: "capsule", radius: 0.4, halfLength: 0.6 });
  });

  it("maps every authored capsule axis and non-uniform scale to the local-Y collider convention", () => {
    const compileAxis = (axis: "x" | "y" | "z") => compileAuthoredPhysicsScene([
      object({
        id: `capsule-${axis}`,
        scale: [2, 3, 4],
        colliders: [collider(`collider-${axis}`, { shape: "capsule", axis })],
      }),
    ], axis, world).bodies[0];

    expect(compileAxis("x")).toMatchObject({
      orientation: [0, 0, -Math.SQRT1_2, Math.SQRT1_2],
      worldScale: [2, 3, 4],
    });
    expect(compileAxis("y")).toMatchObject({
      orientation: [0, 0, 0, 1],
      worldScale: [3, 2, 4],
    });
    expect(compileAxis("z")).toMatchObject({
      orientation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
      worldScale: [4, 3, 2],
    });
  });
});
