import { describe, expect, it } from "vitest";
import { createUiCanvas } from "../domain/ui-document";
import { captureUiDocument } from "../domain/ui-validation";
import { decodeUiCanvas, encodeUiCanvas } from "./ui-canvas-codec";
import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { createPrefabDocument, instantiatePrefabDocument, updatePrefabLinkedInstances } from "../../lib/prefabs";
import { applyScenePatch } from "../../lib/prefab-authoring";
import { editUiDocument } from "../application/ui-authoring";

describe("UI authoring and persistence", () => {
  it("retains extension/future data and round-trips scene and prefab content", () => {
    const raw = { ...createUiCanvas(), pluginData: { note: "keep" } };
    const object = parseSceneObjects([{ id: "hud", source_type: "transform", ui_canvas: raw }])[0];
    expect(serializeSceneObject(object).ui_canvas).toEqual(raw);
    const future = { ...raw, version: 9 };
    expect(decodeUiCanvas(future)?.unavailable).toBeTruthy(); expect(encodeUiCanvas(decodeUiCanvas(future))).toEqual(future);
    const source = createPrefabDocument([object], [object.id], "HUD")!;
    const asset = { name: "HUD", filename: "HUD.braze-prefab.json", guid: "0123456789abcdef0123456789abcdef" };
    const first = instantiatePrefabDocument(source, { asset }), second = instantiatePrefabDocument(source, { asset });
    expect(first[0].uiCanvas).toEqual(second[0].uiCanvas); expect(first[0].uiCanvas).not.toBe(second[0].uiCanvas);
    const edited = applyScenePatch(first[0], { uiCanvas: { ...first[0].uiCanvas!, order: 9 } });
    expect(edited.prefabLink?.overrides).toContain("components");
    const removed = applyScenePatch(second[0], { uiCanvas: undefined });
    const updated = updatePrefabLinkedInstances([edited, removed], source, asset);
    expect(updated[0].uiCanvas?.order).toBe(9); expect(updated[1].uiCanvas).toBeUndefined(); expect(source.objects[0].uiCanvas?.order).toBe(0);
  });
  it("rejects ambiguous identities, cyclic/deep trees, unsafe style payloads and invalid controls", () => {
    const base = createUiCanvas();
    expect(() => captureUiDocument({ ...base, root: { ...base.root, children: [base.root] } })).toThrow(/duplicate/);
    const cycle: { id: string; kind: string; children: unknown[] } = { id: "cycle", kind: "panel", children: [] }; cycle.children.push(cycle);
    expect(() => captureUiDocument({ ...base, root: cycle })).toThrow(/depth/);
    for (const root of [
      { ...base.root, style: { background: "url(https://example.test)" } },
      { ...base.root, style: { background: "$missing" } },
      { ...base.root, responsive: [{ minWidth: 400, style: {} }, { minWidth: 300, style: {} }] },
      { ...base.root, children: [{ id: "slider", kind: "slider", value: 2 }] },
      { ...base.root, children: [{ id: "label", kind: "text", children: [base.root] }] },
    ]) expect(() => captureUiDocument({ ...base, root })).toThrow();
  });
  it("round-trips stable image/font references and rejects invalid navigation targets", () => {
    const base = createUiCanvas(), font = { guid: "a".repeat(32) }, image = { guid: "b".repeat(32), localId: "main" };
    const document = { ...base, navigation: { enabled: true, initialFocus: "go", cancel: "go" }, root: { ...base.root, style: { font }, children: [
      { id: "art", kind: "image", image, label: "Artifact" }, { id: "go", kind: "button", text: "Go" },
    ] } };
    expect(encodeUiCanvas(decodeUiCanvas(document))).toEqual(document);
    expect(() => captureUiDocument({ ...document, navigation: { enabled: true, initialFocus: "art" } })).toThrow(/control/);
    expect(() => captureUiDocument({ ...base, root: { ...base.root, style: { font: { guid: "https://evil" } } } })).toThrow();
  });
  it("edits and reparents atomically without mutating the source or creating cycles", () => {
    const original = createUiCanvas(), panel = editUiDocument(original, { op: "add", parentId: "root", kind: "panel" });
    const moved = editUiDocument(panel, { op: "move", id: "title", parentId: "panel1", index: 0 });
    expect(moved.root.children?.[0].children?.[0].id).toBe("title"); expect(original.root.children?.[0].id).toBe("title");
    expect(() => editUiDocument(moved, { op: "move", id: "panel1", parentId: "panel1", index: 0 })).toThrow(/themselves/);
    expect(() => editUiDocument(original, { op: "remove", id: "root" })).toThrow(/root/);
  });
});
