import { describe, expect, it } from "vitest";
import { executeSceneCommands } from "./scene-commands";

const empty = { version: "braze-engine/scene-v1", objects: [], customProjectData: { preserved: true } };
const create = { op: "object.create", id: "ball", primitive: "sphere", values: { position: [0, 4, 0] } };

describe("engine authoring transactions", () => {
  it("authors, validates and removes a character controller through the shared component boundary", () => {
    const result = executeSceneCommands(empty, [create, { op: "component.set", id: "ball", component: "characterController", values: { stepHeight: 0.25 } }]);
    expect(result.valid, result.diagnostics.join()).toBe(true);
    expect(result.scene.objects[0]).toMatchObject({ character_controller: { movement: { stepHeight: 0.25 } }, rigidbody: { body_type: "kinematic" } });
    const removed = executeSceneCommands(result.scene, [{ op: "component.remove", id: "ball", component: "characterController" }]);
    expect(removed.scene.objects[0]).toMatchObject({ character_controller: null, rigidbody: { body_type: "kinematic" } });
    expect(() => executeSceneCommands(empty, [create, { op: "component.set", id: "ball", component: "characterController", values: { maxSlopeDegrees: 90 } }])).toThrow("between");
  });
  it("builds a physical scene using shared defaults and preserves project extensions", () => {
    const result = executeSceneCommands(empty, [create,
      { op: "component.set", id: "ball", component: "rigidbody", values: { massMode: "manual", mass: 2 } },
      { op: "component.set", id: "ball", component: "collider", values: { radius: 0.5 } },
    ]);
    expect(result.valid).toBe(true);
    expect(result.scene.objects[0]).toMatchObject({ id: "ball", rigidbody: { mass: 2 }, colliders: [{ shape: "sphere", radius: 0.5 }] });
    expect(result.scene.customProjectData).toEqual({ preserved: true });
    expect(empty.objects).toEqual([]);
  });
  it("rejects an invalid batch without mutating its input", () => {
    expect(() => executeSceneCommands(empty, [create, { op: "object.update", id: "ball", values: { scale: [0, 1, 1] } }])).toThrow("positive");
    expect(empty.objects).toEqual([]);
  });
  it("rejects parent cycles and reports missing colliders", () => {
    expect(() => executeSceneCommands(empty, [create, { op: "object.update", id: "ball", values: { parentId: "ball" } }])).toThrow("cycle");
    const result = executeSceneCommands(empty, [create, { op: "component.set", id: "ball", component: "rigidbody", values: {} }]);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.join()).toContain("no enabled Collider");
  });
  it("retains unknown object fields and never edits a locked object", () => {
    const scene = executeSceneCommands(empty, [create]).scene;
    const object = scene.objects[0] as Record<string, unknown>; object.extension = { hello: "world" };
    const updated = executeSceneCommands(scene, [{ op: "object.update", id: "ball", values: { name: "Hero" } }]);
    expect(updated.scene.objects[0]).toMatchObject({ extension: { hello: "world" }, name: "Hero" });
    object.locked = true;
    expect(() => executeSceneCommands(scene, [{ op: "object.delete", id: "ball" }])).toThrow("locked");
  });
});
