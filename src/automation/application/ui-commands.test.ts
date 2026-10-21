import { expect, it } from "vitest";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { createUiCanvas } from "../../game-ui/domain/ui-document";
import { executeSceneCommands } from "./scene-commands";
import { automationOperationCatalog } from "../domain/operation-catalog";

it("advertises recursive UI schemas and applies valid complete documents atomically", async () => {
  const commands = [{ op: "object.create", id: "hud", primitive: "transform" }, { op: "component.set", id: "hud", component: "uiCanvas", values: createUiCanvas() }];
  const schema = fromJsonSchema(automationOperationCatalog.find((entry) => entry.operation === "editor.edit")!.inputSchema);
  expect((await schema["~standard"].validate({ sessionId: "tab", baseRevision: 0, commands })).issues).toBeUndefined();
  const scene = { version: "braze-engine/scene-v1", objects: [{ id: "camera", source_type: "camera" }] };
  const result = executeSceneCommands(scene, commands); expect(result.valid).toBe(true);
  expect(result.scene.objects.find((object) => (object as { id: string }).id === "hud")).toMatchObject({ ui_canvas: createUiCanvas() });
  expect(() => executeSceneCommands(scene, [...commands, { ...commands[1], values: { ...createUiCanvas(), version: 2 } }])).toThrow();
  expect(scene.objects).toHaveLength(1);
  const removed = executeSceneCommands(result.scene, [{ op: "component.remove", id: "hud", component: "uiCanvas" }]);
  expect(removed.scene.objects.find((object) => (object as { id: string }).id === "hud")).toMatchObject({ ui_canvas: null });
});
