import { describe, expect, it } from "vitest";
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { automationOperationCatalog } from "../../automation/domain/operation-catalog";
import { decodeInputActionMapAsset } from "../serialization/input-action-map-asset-codec";
import { createStockControlInputMap } from "./stock-control-input-map";

const validate = (name: string, value: unknown) => fromJsonSchema(automationOperationCatalog.find((entry) => entry.operation === name)!.inputSchema)["~standard"].validate(value);
const document = { version: "braze/input-action-map-v1", name: "Controls", map: createStockControlInputMap() };
describe("input authoring discovery", () => {
  it("accepts stock controls and exposes all five bounded operations", async () => {
    expect((await validate("input.map.create", { document })).issues).toBeUndefined();
    expect(decodeInputActionMapAsset(document).map.actions.length).toBeGreaterThan(3);
    expect(automationOperationCatalog.filter((entry) => entry.operation.startsWith("input."))).toHaveLength(5);
    expect((await validate("input.project.select", { assetGuid: null, baseRevision: null })).issues).toBeUndefined();
  });
  it("rejects incompatible device shapes, pointer deltas, limits and invalid multipliers", async () => {
    for (const binding of [{ device: "keyboard", code: "bad key" }, { device: "keyboard", code: "KeyW", scale: 0 },
      { device: "keyboard", code: "KeyW", scale: 101 }, { device: "pointer-delta", axis: "x" },
      { device: "gamepad-axis", axis: 8 }, { device: "gamepad-axis", axis: 0, deadzone: 1 },
      { device: "pointer-button", button: 5 }, { device: "gamepad-button", button: 32 },
      { device: "keyboard", code: "KeyW", script: "bad" }]) {
      const value = { ...document, map: { version: 1, actions: [{ name: "move", kind: "axis", bindings: [binding] }] } };
      expect((await validate("input.map.create", { document: value })).issues, JSON.stringify(binding)).toBeDefined();
    }
    expect((await validate("input.map.create", { document: { ...document, map: { version: 1, actions: Array(65).fill({ name: "a", kind: "button", bindings: [] }) } } })).issues).toBeDefined();
  });
  it("requires saved revisions, explicit clearing and stable identity", async () => {
    expect((await validate("input.map.save", { assetGuid: "a".repeat(32), baseRevision: 3, document })).issues).toBeDefined();
    expect((await validate("input.map.save", { assetGuid: "a".repeat(32), baseRevision: "b".repeat(64), document })).issues).toBeUndefined();
    expect((await validate("input.project.select", { baseRevision: null })).issues).toBeDefined();
    expect((await validate("input.map.inspect", { assetGuid: "Controls.braze-input.json" })).issues).toBeDefined();
  });
});
