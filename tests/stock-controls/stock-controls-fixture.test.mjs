import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { decodeInputActionMapAsset } from "../../src/input/serialization/input-action-map-asset-schema.mjs";
import { decodeProjectInput } from "../../src/input/serialization/project-input-schema.mjs";
import { createStockControlsProject, STOCK_CONTROL_STYLES, STOCK_CONTROL_INPUT_GUID, STOCK_CONTROL_PREFAB_GUID, stockControlPrefabDocument } from "../gameplay/stock-controls-project.mjs";

for (const style of STOCK_CONTROL_STYLES) test(`${style}: saved stock fixture needs no gameplay module and selects all seven typed actions`, () => {
  const root = createStockControlsProject({ style });
  try {
    const read = (name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));
    assert.deepEqual(read("braze.project.json"), { version: 1 });
    assert.equal(existsSync(path.join(root, "game.ts")), false);
    const selected = decodeProjectInput(read("project.json").input);
    assert.equal(selected.actionMap.guid, STOCK_CONTROL_INPUT_GUID);
    const input = decodeInputActionMapAsset(read("assets/Stock Controls.braze-input.json"));
    assert.deepEqual(input.map.actions.map((action) => [action.name, action.kind]), [
      ["moveX", "axis"], ["moveZ", "axis"], ["jump", "button"], ["lookX", "delta"], ["lookY", "delta"], ["lookRateX", "axis"], ["lookRateY", "axis"],
    ]);
    const character = read("scenes/current.scene.json").objects.find((object) => object.id === "hero");
    assert.equal(character.behaviors.entries[0].type, `braze.control.${style}`);
    assert.equal(character.character_controller.capsule_collider_id, character.colliders[0].id);
    assert.equal(character.rigidbody.body_type, "kinematic");
    assert.deepEqual(character.colliders[0].center, [0, 0, 0]);
    assert.equal(character.colliders[0].length + 2 * character.colliders[0].radius * character.transform.scale[0], 1.4);
    if (style === "first-person") assert.ok(character.behaviors.entries[0].values.pivotHeight > 0.7,
      "The FPS eye must be above the visible cube's half-height");
    const pooled = stockControlPrefabDocument(style).objects.find((object) => object.id === "character");
    assert.equal(pooled.behaviors.entries[0].type, `braze.control.${style}`);
    assert.deepEqual(pooled.behaviors.entries[0].values, character.behaviors.entries[0].values);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("scripted composition retains saved stock declarations and exports its pooled controller by GUID", () => {
  const root = createStockControlsProject({ scripted: true });
  try {
    const config = JSON.parse(readFileSync(path.join(root, "braze.project.json"), "utf8"));
    assert.equal(config.gameplayEntry, "game.ts"); assert.equal(config.runtimePhysicsCapacity, 4);
    assert.deepEqual(config.runtimePrefabs, [{ guid: STOCK_CONTROL_PREFAB_GUID }]);
    const prefab = JSON.parse(readFileSync(path.join(root, "assets/Stock Controlled Character.braze-prefab.json"), "utf8"));
    const character = prefab.objects.find((object) => object.id === "character");
    assert.equal(character.behaviors.entries[0].type, "braze.control.first-person");
    assert.equal(character.characterController.capsuleColliderId, character.colliders[0].id);
    const metadata = JSON.parse(readFileSync(path.join(root, "assets/Stock Controlled Character.braze-prefab.json.braze.meta"), "utf8"));
    assert.equal(metadata.guid, STOCK_CONTROL_PREFAB_GUID); assert.equal(metadata.importer.id, "braze.prefab");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
