import { expect, it } from "vitest";
import { modelSource } from "../testing/model-runtime-fixture";
import { compileRuntimePrefabLibrary } from "./runtime-prefab-compiler";
import { captureRuntimePrefabResourceCatalog } from "./runtime-prefab-resource-catalog";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";
import { createAnimatorState } from "../../character/domain/animator-controller";
import { createEmptyCharacterAssetLibrary } from "../../character/domain/character-asset-library";
import { encodeAnimatorComponent } from "../../character/serialization/animator-component-codec";
import { encodeCharacterAssetLibrary } from "../../character/serialization/character-asset-library-codec";
import { copyEntityCommands } from "../../world/runtime/entity-change-plan";
import type { RuntimePrefabSource } from "../domain/runtime-prefab";

const targetGuid = "b".repeat(32), clipGuid = "c".repeat(32), maskGuid = "d".repeat(32);
function animatedSource(): RuntimePrefabSource {
  const source = modelSource(), animator = createDefaultAnimatorComponent();
  const state = createAnimatorState("idle", "Idle");
  state.motion = { kind: "clip", clipRef: { guid: clipGuid, localId: "clip:idle" }, speed: 1 };
  animator.controller!.layers[0].states = [state]; animator.controller!.layers[0].defaultStateId = state.id;
  animator.controller!.layers[0].avatarMaskRef = { guid: maskGuid };
  animator.avatarRef = { guid: targetGuid, localId: "avatar:main" };
  const library = createEmptyCharacterAssetLibrary();
  library.avatarMasks.push({ version: 1, id: maskGuid, revision: "mask-r1", name: "Upper", humanoidBodyParts: {}, transforms: [] });
  const objects = (source.document as { objects: Array<Record<string, unknown>> }).objects;
  objects[1].animator = encodeAnimatorComponent(animator);
  const asset = (guid: string, filename: string) => ({ guid, filename, name: filename, kind: "model", status: "ready",
    path: `assets/${filename}`, url: `/3d-models/${filename}`, sizeBytes: 128,
    subAssets: [{ kind: "clip", localId: "clip:idle", name: "Idle" }, { kind: "avatar", localId: "avatar:main", name: "Avatar" }] });
  const imports = (filename: string) => ({ version: "braze/model-import-v3", sourceFilename: filename, settings: {}, revision: "r1", updatedAt: null, importVersion: "r1" });
  return { ...source, resources: { ...source.resources!, animation: { characterAssets: encodeCharacterAssetLibrary(library),
    importedAssets: [asset(targetGuid, "model.gltf"), asset(clipGuid, "idle.fbx")],
    modelImportDocuments: { "model.gltf": imports("model.gltf"), "idle.fbx": imports("idle.fbx") } } } };
}

it("captures enabled model Animator graphs immutably and derives their backend capability", () => {
  const source = animatedSource(), library = compileRuntimePrefabLibrary([source]);
  const command = library[0].create()[1];
  if (command.op !== "create") throw Error("Expected model creation");
  expect(command.model?.animator?.controller?.layers[0].defaultStateId).toBe("idle");
  expect(Object.isFrozen(command.model?.animator?.controller?.layers[0].states)).toBe(true);
  expect(copyEntityCommands([command])[0]).toMatchObject({ components: ["transform", "meshFilter", "meshRenderer", "animator"] });
  const catalog = captureRuntimePrefabResourceCatalog([source]);
  expect(catalog.animation?.characterAssets.avatarMasks[0].id).toBe(maskGuid);
  expect(Object.isFrozen(catalog.animation?.importedAssets[0].subAssets?.[0])).toBe(true);
  expect(Object.isFrozen(source.resources!.animation!.importedAssets[0])).toBe(false);
  (source.resources!.animation!.importedAssets[0] as { name: string }).name = "Changed";
  expect(catalog.animation?.importedAssets[0].name).toBe("model.gltf");
});

it("rejects missing clip, Avatar, mask and importer snapshots before commands can publish", () => {
  for (const mutate of [
    (source: RuntimePrefabSource) => ({ ...source, resources: { ...source.resources!, animation: undefined } }),
    (source: RuntimePrefabSource) => { (source.resources!.animation!.importedAssets[1] as { subAssets: unknown[] }).subAssets = []; return source; },
    (source: RuntimePrefabSource) => { (source.resources!.animation!.importedAssets[0] as { subAssets: unknown[] }).subAssets = []; return source; },
    (source: RuntimePrefabSource) => { (source.resources!.animation!.characterAssets as { avatarMasks: unknown[] }).avatarMasks = []; return source; },
    (source: RuntimePrefabSource) => { delete (source.resources!.animation!.modelImportDocuments as Record<string, unknown>)["idle.fbx"]; return source; },
  ]) {
    const changed = mutate(animatedSource()); expect(() => compileRuntimePrefabLibrary([changed])).toThrow();
  }
});

it("rejects Animator on groups and primitives, and malformed command graphs without changing their meaning", () => {
  const group = animatedSource(), nodes = (group.document as { objects: Array<Record<string, unknown>> }).objects;
  nodes[0].animator = nodes[1].animator; delete nodes[1].animator;
  expect(() => compileRuntimePrefabLibrary([group])).toThrow(/imported model leaf/);
  const primitive = animatedSource(); (primitive.document as { objects: Array<Record<string, unknown>> }).objects[1].primitive = "cube";
  expect(() => compileRuntimePrefabLibrary([primitive])).toThrow(/imported model leaf/);
  const command = compileRuntimePrefabLibrary([animatedSource()])[0].create()[1];
  if (command.op !== "create") throw Error("Expected model creation");
  const broken = structuredClone(command.model!.animator!); broken.controller!.layers[0].defaultStateId = "missing";
  expect(() => copyEntityCommands([{ ...command, model: { ...command.model!, animator: broken } }])).toThrow(/unknown direct state/);
  expect(() => copyEntityCommands([{ ...command, components: ["transform", "meshFilter", "meshRenderer"] }])).toThrow(/animator capability/);
});

it("retains unanimated model compatibility and merges only matching saved metadata", () => {
  const plain = modelSource(); expect(captureRuntimePrefabResourceCatalog([plain]).animation).toBeUndefined();
  expect(compileRuntimePrefabLibrary([plain])[0].create()).toHaveLength(2);
  const first = animatedSource(), second = animatedSource();
  (second.resources!.animation!.importedAssets[0] as { name: string }).name = "Conflicting";
  expect(() => captureRuntimePrefabResourceCatalog([first, second])).toThrow(/Conflicting/);
});

it("rejects more than 32 distinct animated target models across prefab sources before resolver selection", () => {
  const sources = [animatedSource(), animatedSource()];
  sources.forEach((source, sourceIndex) => {
    const nodes = (source.document as { objects: Array<Record<string, unknown>> }).objects;
    const original = nodes[1];
    nodes.splice(1, 1, ...Array.from({ length: 17 }, (_, index) => ({ ...structuredClone(original), id: `model-${index}`,
      assetRef: { guid: (sourceIndex * 17 + index + 1).toString(16).padStart(32, "0"), localId: "main" } })));
  });
  expect(() => compileRuntimePrefabLibrary(sources)).toThrow(/32 distinct animated target models/);
  const nodes = (sources[1].document as { objects: Array<Record<string, unknown>> }).objects;
  nodes.splice(-2);
  expect(() => captureRuntimePrefabResourceCatalog(sources)).not.toThrow();
  // Repeated instances of an existing target consume one snapshot model identity.
  nodes.push({ ...structuredClone(nodes[1]), id: "repeated" });
  expect(() => captureRuntimePrefabResourceCatalog(sources)).not.toThrow();
});

it("rejects root-motion application to dynamic prefab models before allocation", () => {
  const source = animatedSource(), node = (source.document as { objects: Array<Record<string, unknown>> }).objects[1];
  node.rigidbody = { enabled: true, bodyType: "dynamic" };
  (node.animator as { rootMotion: { mode: string } }).rootMotion.mode = "applyToObject";
  expect(() => compileRuntimePrefabLibrary([source])).toThrow(/root motion cannot apply to a GPU body/);
});
