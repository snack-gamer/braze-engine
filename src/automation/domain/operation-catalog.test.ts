import { describe, expect, it } from "vitest";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { automationOperationCatalog } from "./operation-catalog";
import { parseSceneCommands } from "./commands";

const validate = (name: string, value: unknown) => fromJsonSchema(automationOperationCatalog.find((entry) => entry.operation === name)!.inputSchema)["~standard"].validate(value);

describe("discoverable operation schemas", () => {
  it("accepts a realistic behavior/control batch also accepted by the authoring parser", async () => {
    const commands = [
      { op: "object.create", id: "player", primitive: "cube", values: { position: [0, 1, 0], scale: [1, 1, 1] } },
      { op: "component.set", id: "player", component: "collider", values: { shape: "capsule", axis: "y", radius: 0.5, length: 1 } },
      { op: "component.set", id: "player", component: "behaviors", values: { version: 1, entries: [
        { id: "control", type: "braze.control.top-down", typeVersion: 1, enabled: true, values: { speed: 3 } },
      ] } },
    ];
    expect((await validate("editor.edit", { sessionId: "a", sceneId: "current", sceneInstanceId: 0, baseRevision: 2, commands })).issues).toBeUndefined();
    expect(parseSceneCommands(commands)).toHaveLength(3);
  });
  it("separates live and disk revisions and forbids unknown envelope/patch fields", async () => {
    const commands = [{ op: "object.update", id: "player", values: { name: "Hero" } }];
    expect((await validate("scene.edit", { baseRevision: null, commands })).issues).toBeUndefined();
    for (const value of [{ sessionId: "a", baseRevision: "hash", commands }, { baseRevision: 2, commands },
      { sessionId: "a", baseRevision: 2, commands, eval: "bad" },
      { sessionId: "a", baseRevision: 2, commands: [{ ...commands[0], values: { script: "bad" } }] }]) {
      expect((await validate("editor.edit", value)).issues).toBeDefined();
    }
    expect((await validate("scene.edit", { baseRevision: 2, commands })).issues).toBeDefined();
  });
  it("describes required physics/query fields and bounded pagination without claiming event drain is read-only", async () => {
    expect((await validate("editor.physics", { sessionId: "a", objectId: "player", kind: "character-move" })).issues).toBeDefined();
    expect((await validate("editor.physics", { sessionId: "a", objectId: "player", kind: "character-move", displacement: [0, 0, 1] })).issues).toBeUndefined();
    expect((await validate("editor.query", { sessionId: "a", scope: "static", kind: "capsule-cast", origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 2 })).issues).toBeDefined();
    expect((await validate("assets.list", { limit: 201 })).issues).toBeDefined();
    expect(automationOperationCatalog.find((entry) => entry.operation === "editor.events")!.annotations.readOnlyHint).toBe(false);
    expect(automationOperationCatalog.find((entry) => entry.operation === "editor.select")!.annotations)
      .toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});
