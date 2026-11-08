import { describe, expect, it } from "vitest";
import { makeObject } from "../../lib/payload";
import { assignMeshPatch, meshBindingForReference } from "./mesh-assignment";
import { captureMeshReference, meshReferenceForObject } from "../domain/mesh-reference";
import { serializeSceneObject } from "../../scene/serialization/scene-object-encoder";
import { parseSceneObjects } from "../../scene/serialization/scene-object-decoder";
import { executeObjectCommands } from "../../automation/application/object-commands";
import { reconcileSceneAssetReferences } from "../../assets/application/scene-asset-resolution";
import { expectedBody } from "../../three/reconciliation/expected-body";
import type { LibraryAsset } from "../../lib/api";
import { Group } from "three";
import { applyTransform } from "../../three/transform";

const guid = "a".repeat(32), mesh = { kind: "asset" as const, asset: { guid, localId: "mesh:Wing" } };
const asset: LibraryAsset = { guid, kind: "model", status: "ready", name: "Parts", filename: "Parts.glb", url: "/3d-models/Parts.glb", path: "", sizeBytes: 10,
  subAssets: [{ kind: "mesh", localId: "mesh:Wing", name: "Wing", sourceIndex: 1 }] };
const object = () => makeObject("cube", 0, { id: "test", name: "Hero", position: [2, 3, 4], rotation: [10, 20, 30], scale: [2, 2, 2],
  materialId: "red", meshRenderer: { castShadows: false, receiveShadows: true }, importedMaterialBindings: [{ slotKey: "body", materialId: "blue" }] });

describe("Mesh Filter authoring", () => {
  it("removes parent geometry without hiding child objects", () => {
    const node = new Group(), child = new Group(); node.add(child);
    const removed = { ...object(), removedComponents: ["meshFilter" as const] };
    applyTransform(node, removed);
    expect(node.visible && child.visible).toBe(true); expect(expectedBody(removed).kind).toBe("none");
  });
  it("changes only geometry source and preserves the renderer, name and transform", () => {
    const initial = object(), patch = assignMeshPatch(initial, mesh, [asset]), next = { ...initial, ...patch };
    expect(next.primitive).toBe("gltf"); expect(next.assetRef).toEqual(mesh.asset); expect(next.assetMeshBinding?.sourceIndex).toBe(1);
    for (const key of ["id", "name", "position", "rotation", "scale", "materialId", "importedMaterialBindings", "meshRenderer"] as const) expect(next[key]).toEqual(initial[key]);
    expect(object()).toEqual(initial);
  });
  it("round-trips None and imported identity without persisting a derived binding", () => {
    const imported = { ...object(), ...assignMeshPatch(object(), mesh, [asset]) };
    const saved = serializeSceneObject(imported);
    expect(JSON.stringify(saved)).not.toContain("sourceIndex");
    const loaded = parseSceneObjects([saved])[0]; expect(meshReferenceForObject(loaded)).toEqual(mesh);
    const empty = { ...imported, ...assignMeshPatch(imported, null) };
    expect(empty.assetRef).toBeUndefined(); expect(expectedBody(empty).kind).toBe("none");
    expect(parseSceneObjects([serializeSceneObject(empty)])[0].meshFilter?.empty).toBe(true);
    expect(meshReferenceForObject({ ...empty, ...assignMeshPatch(empty, { kind: "builtin", primitive: "sphere" }) })).toEqual({ kind: "builtin", primitive: "sphere" });
  });
  it("uses the same operations through public component commands and preserves siblings", () => {
    const a = object(), b = makeObject("sphere", 1);
    const output = executeObjectCommands([a, b], [{ op: "component.set", id: a.id, component: "meshFilter", values: { mesh } }],
      { requireCamera: false, assetCatalog: { ready: true, importedAssets: [asset] } });
    expect(output.objects[0].assetRef).toEqual(mesh.asset); expect(output.objects[1]).toBe(b);
    expect(() => executeObjectCommands([a], [{ op: "component.set", id: a.id, component: "meshFilter", values: { mesh, enabled: false } }])).toThrow("only mesh");
  });
  it("heals missing references and resolves changed source indexes after reimport", () => {
    const initial = { ...object(), ...assignMeshPatch(object(), mesh, [asset]) };
    const missing = reconcileSceneAssetReferences([initial], [])[0];
    expect(missing.assetRef).toEqual(mesh.asset); expect(missing.assetMissing).toBe(true); expect(expectedBody(missing).kind).toBe("none");
    const changed = { ...asset, filename: "Renamed.glb", name: "Renamed", url: "/3d-models/Renamed.glb", subAssets: [{ ...asset.subAssets![0], sourceIndex: 8 }] };
    const healed = reconcileSceneAssetReferences([missing], [changed])[0];
    expect(healed.assetMissing).toBe(false); expect(healed.assetMeshBinding?.sourceIndex).toBe(8);
    expect(healed.assetUrl).toContain("Renamed.glb");
    expect(expectedBody(healed).key).not.toBe(expectedBody(initial).key);
    expect(reconcileSceneAssetReferences([healed], [changed])[0]).toBe(healed);
  });
  it("rejects wrong, missing, unbound or skinned assets and keeps animated objects intact", () => {
    expect(() => captureMeshReference({ kind: "builtin", primitive: "camera" })).toThrow();
    expect(() => assignMeshPatch(object(), mesh, [])).toThrow("missing");
    expect(() => meshBindingForReference({ kind: "asset", asset: { guid, localId: "main" } }, [asset])).toThrow("subasset");
    expect(() => assignMeshPatch(object(), mesh, [{ ...asset, subAssets: [{ ...asset.subAssets![0], skinned: true }] }])).toThrow("Skinned");
    expect(() => assignMeshPatch(object(), mesh, [{ ...asset, subAssets: [{ ...asset.subAssets![0], sourceIndex: undefined }] }])).toThrow("binding");
    expect(() => assignMeshPatch(makeObject("camera", 0), null)).toThrow("support");
  });
});
