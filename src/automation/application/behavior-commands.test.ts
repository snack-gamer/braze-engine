import { describe, expect, it } from "vitest";
import { executeSceneCommands } from "./scene-commands";
import { automationCapabilities } from "../domain/capabilities";

const empty = { version: "braze-engine/scene-v1", objects: [] };
const create = { op: "object.create", id: "owner", primitive: "transform" };
const component = { version: 1, entries: [{ id: "counter", type: "project.counter", typeVersion: 1,
  enabled: false, values: { speed: 0, label: "Saved", target: { entityId: "owner" }, future: true } }] };
const set = { op: "component.set", id: "owner", component: "behaviors", values: component };

describe("saved behavior automation", () => {
  it("discovers, authors, preserves and removes behavior data through the scene transaction", () => {
    expect(automationCapabilities.components).toContain("behaviors");
    const result = executeSceneCommands(empty, [create, set]);
    expect(result.valid).toBe(true);
    expect(result.scene.objects[0]).toMatchObject({ behaviors: component });
    const renamed = executeSceneCommands(result.scene, [{ op: "object.update", id: "owner", values: { name: "Renamed" } }]);
    expect(renamed.scene.objects[0]).toMatchObject({ behaviors: component });
    const removed = executeSceneCommands(renamed.scene, [{ op: "component.remove", id: "owner", component: "behaviors" }]);
    expect((removed.scene.objects[0] as Record<string, unknown>).behaviors ?? null).toBeNull();
    expect((result.scene.objects[0] as Record<string, unknown>).behaviors).toEqual(component);
  });

  it("rejects malformed batches atomically and preserves missing registration data", () => {
    const scene = executeSceneCommands(empty, [create, set]).scene;
    const before = JSON.stringify(scene);
    expect(() => executeSceneCommands(scene, [
      { op: "object.update", id: "owner", values: { name: "Must not commit" } },
      { ...set, values: { version: 1, entries: [{ ...component.entries[0], values: { speed: Infinity } }] } },
    ])).toThrow();
    expect(JSON.stringify(scene)).toBe(before);
    expect(() => executeSceneCommands(scene, [{ ...set, values: { version: 2, entries: [] } }])).toThrow();
    const unknown = executeSceneCommands(scene, [{ ...set, values: { version: 1, entries: [
      { ...component.entries[0], type: "missing.definition", typeVersion: 17 },
    ] } }]);
    expect(unknown.scene.objects[0]).toMatchObject({ behaviors: { entries: [{ type: "missing.definition", typeVersion: 17 }] } });
  });
});
