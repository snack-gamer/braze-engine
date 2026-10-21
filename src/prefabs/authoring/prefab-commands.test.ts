import { describe, expect, it } from "vitest";
import { createPrefab, executePrefabCommands, inspectPrefab } from "./prefab-commands";

const body = [
  { op: "object.create", id: "cargo", primitive: "cube", values: { parentId: "root", position: [0, 0, 0] } },
  { op: "component.set", id: "cargo", component: "rigidbody", values: { interpolation: "none" } },
  { op: "component.set", id: "cargo", component: "collider", values: { id: "cargo-box", shape: "box" } },
];
describe("saved prefab authoring", () => {
  it("builds a runtime-supported master root and retains local IDs across edits", () => {
    const created = createPrefab("Cargo", body);
    expect(created).toMatchObject({ valid: true, runtimeSubset: { supported: true, dependenciesVerified: false } });
    const changed = executePrefabCommands(created.document, [{ op: "object.update", id: "cargo", values: { color: "#00ff00" } }]);
    expect(inspectPrefab(changed.document).document.objects.map((object) => object.id)).toEqual(["root", "cargo"]);
    expect(inspectPrefab(created.document).document.objects[1].color).not.toBe("#00ff00");
  });
  it("preserves camel-case authored data and extensions without scene-codec translation", () => {
    const prefab = inspectPrefab(createPrefab("Cargo", body).document).document;
    const input = { ...prefab, extension: { keep: true }, objects: prefab.objects.map((object) => ({ ...object,
      importedMaterialBindings: object.id === "cargo" ? [{ rendererPath: "Body", slot: 0, materialId: "mat" }] : undefined,
      extension: { retained: true },
    })) };
    const changed = executePrefabCommands(input, [{ op: "object.update", id: "cargo", values: { name: "Heavy Cargo" } }]);
    expect(changed.document).toMatchObject({ extension: { keep: true }, objects: [{ extension: { retained: true } },
      { id: "cargo", name: "Heavy Cargo", importedMaterialBindings: input.objects[1].importedMaterialBindings, rigidbody: { bodyType: "dynamic" } }] });
  });
  it("separates editor validity from unsupported runtime components", () => {
    const result = createPrefab("Camera Rig", [{ op: "object.create", id: "camera", primitive: "camera", values: { parentId: "root" } }]);
    expect(result.valid).toBe(true); expect(result.runtimeSubset.supported).toBe(false);
    expect(result.runtimeSubset.diagnostics.join()).toContain("not supported");
    const removed = executePrefabCommands(result.document, [{ op: "object.delete", id: "camera" }]);
    expect(removed.valid).toBe(true); expect(removed.runtimeSubset.supported).toBe(true);
  });
  it("rejects cycles atomically and refuses a detached master graph", () => {
    const created = createPrefab("Cargo", body), before = JSON.stringify(created.document);
    expect(() => executePrefabCommands(created.document, [{ op: "object.update", id: "root", values: { parentId: "cargo" } }])).toThrow("cycle");
    expect(JSON.stringify(created.document)).toBe(before);
    const detached = executePrefabCommands(created.document, [{ op: "object.create", id: "detached", primitive: "transform" }]);
    expect(detached.valid).toBe(false); expect(detached.diagnostics.join()).toContain("master root");
  });
  it("removes components without resurrecting old serialized values", () => {
    const created = createPrefab("Cargo", body);
    const edited = executePrefabCommands(created.document, [{ op: "component.remove", id: "cargo", component: "rigidbody" }]);
    expect(inspectPrefab(JSON.parse(JSON.stringify(edited.document))).document.objects[1].rigidbody).toBeUndefined();
    expect(edited.runtimeSubset.supported).toBe(false);
  });
});
