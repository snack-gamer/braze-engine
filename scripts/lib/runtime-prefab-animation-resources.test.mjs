import assert from "node:assert/strict";
import { test } from "node:test";
import { capturePrefabResources } from "./runtime-prefab-resources.mjs";
import { compilePlayerContent, rewritePlayerAssetUrls } from "./player-package-compiler.mjs";
import { loadRuntimePrefabSources } from "./project-runtime-prefabs.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { validatePrefabAnimationTargetCapacity } from "./runtime-prefab-animation-resources.mjs";

const target = "a".repeat(32), external = "b".repeat(32), mask = "c".repeat(32), unused = "d".repeat(32);
const ref = (guid, localId = "main") => ({ guid, localId });
const model = (guid, filename) => ({ guid, kind: "model", status: "ready", filename, name: filename,
  path: `assets/${filename}`, url: `/3d-models/${filename}`, sizeBytes: 100, contentRevision: "saved",
  subAssets: [{ kind: "clip", localId: "clip:take", name: "Take" }, { kind: "avatar", localId: "avatar:main", name: "Avatar" }] });
const assets = [model(target, "Hero.glb"), model(external, "Walk.fbx"), model(unused, "Unused.glb")];
const index = assets.map((asset) => ({ guid: asset.guid, sourceHash: "saved-hash", importSettings: { importAnimations: true, scaleFactor: 2 } }));
const library = { version: "braze/character-assets-v1", animatorControllers: [], avatarMasks: [
  { version: "braze/avatar-mask-v1", id: mask, name: "Upper", revision: "mask-r1", sourceRef: ref(target), transforms: [] },
] };
const controller = { version: "braze/animator-controller-v1", id: "embedded", name: "Controller", layers: [{ id: "base", name: "Base",
  avatarMaskRef: ref(mask), states: [{ id: "idle", name: "Idle", motion: { kind: "clip", clipRef: ref(external, "clip:take") } }] }] };
const document = { objects: [{ id: "hero", name: "Hero", primitive: "gltf", assetRef: ref(target),
  assetUrl: "/3d-models/stale.glb", animator: { version: "braze/animator-component-v2", enabled: true, controller, avatarRef: ref(target, "avatar:main") } }] };

test("animated prefab snapshots capture selected external takes, Avatar masks and saved import metadata", () => {
  const resources = capturePrefabResources(document, assets, index, [], library);
  assert.deepEqual(resources.animation.importedAssets.map((asset) => asset.filename), ["Hero.glb", "Walk.fbx"]);
  assert.deepEqual(resources.animation.characterAssets.avatarMasks.map((asset) => asset.id), [mask]);
  assert.deepEqual(Object.keys(resources.animation.modelImportDocuments), ["Hero.glb", "Walk.fbx"]);
  resources.animation.importedAssets[0].subAssets[0].name = "Changed";
  resources.animation.characterAssets.avatarMasks[0].name = "Changed";
  resources.animation.modelImportDocuments["Hero.glb"].settings.scaleFactor = 99;
  assert.equal(assets[0].subAssets[0].name, "Take"); assert.equal(library.avatarMasks[0].name, "Upper"); assert.equal(index[0].importSettings.scaleFactor, 2);
});

test("missing and disabled Animator dependencies reject capture before structural publication", () => {
  for (const source of [assets.filter((asset) => asset.guid !== external), [...assets, assets[1]], assets.map((asset) => asset.guid === external ? { ...asset, subAssets: [] } : asset)]) {
    assert.throws(() => capturePrefabResources(document, source, index, [], library), /missing|ambiguous/);
  }
  assert.throws(() => capturePrefabResources(document, assets, index.filter((entry) => entry.guid !== external), [], library), /snapshot/);
  assert.throws(() => capturePrefabResources(document, assets, index, [], {}), /Mask.*missing/);
  assert.throws(() => capturePrefabResources(document, assets, index.map((entry) => entry.guid === external ? { ...entry, importSettings: { importAnimations: false } } : entry), [], library), /disabled/);
});

test("legacy controllers and copied Avatar dependencies are captured by saved GUID", () => {
  const legacyGuid = "e".repeat(32), avatarGuid = "f".repeat(32);
  const legacy = { ...controller, id: legacyGuid, revision: "legacy-r1" };
  const source = structuredClone(document); source.objects[0].animator.controllerRef = ref(legacyGuid); delete source.objects[0].animator.controller;
  const avatar = model(avatarGuid, "Avatar.glb");
  const imports = index.map((entry) => entry.guid === target ? { ...entry, importSettings: { ...entry.importSettings,
    rig: { kind: "humanoid", avatarSource: { kind: "copyFromAvatar", avatarRef: ref(avatarGuid, "avatar:main") } } } } : entry);
  const resources = capturePrefabResources(source, [...assets, avatar], [...imports, { guid: avatarGuid, importSettings: {} }], [], { ...library, animatorControllers: [legacy] });
  assert.equal(resources.animation.characterAssets.animatorControllers[0].id, legacyGuid);
  assert.ok(resources.animation.importedAssets.some((asset) => asset.guid === avatarGuid));
  assert.throws(() => capturePrefabResources(source, assets, imports, [], { ...library, animatorControllers: [legacy] }), /model.*missing/);
});

test("prefab-only Animator survives feature stripping and exports captured source dependencies with relative URLs", () => {
  const resources = capturePrefabResources(document, assets, index, [], library), runtimePrefabs = [{ document, resources }];
  const result = compilePlayerContent({ sceneId: "current", scene: { objects: [] }, project: {}, assets: [assets[0]], indexRecords: [], runtimePrefabs });
  assert.equal(result.content.features.animator, true); assert.equal(result.content.features.physics, false);
  assert.deepEqual(result.content.features.modelLoaders, ["fbx", "gltf"]);
  assert.deepEqual(result.content.importedAssets.map((asset) => asset.filename), ["Hero.glb", "Walk.fbx"]);
  assert.equal(result.content.modelImportDocuments["Walk.fbx"].settings.scaleFactor, 2);
  assert.ok(result.publicAssetUrls.some((url) => url.startsWith("/3d-models/Walk.fbx")));
  assert.ok(!result.publicAssetUrls.includes("/3d-models/stale.glb"));
  assert.equal(rewritePlayerAssetUrls(runtimePrefabs)[0].resources.animation.importedAssets[1].url, "./3d-models/Walk.fbx?importVersion=saved");
  const disabled = structuredClone(document); disabled.objects[0].animator.enabled = false;
  const plain = capturePrefabResources(disabled, assets, index);
  assert.equal(plain.animation, undefined);
  assert.equal(compilePlayerContent({ sceneId: "current", scene: { objects: [] }, project: {}, assets, indexRecords: index,
    runtimePrefabs: [{ document: disabled, resources: plain }] }).content.features.animator, false);
});

test("saved source loading captures the project character library and separates later saved changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "braze-animated-prefab-sources-"));
  try {
    const prefabGuid = "9".repeat(32), record = { guid: prefabGuid, kind: "prefab", status: "ready", filename: "Hero.braze-prefab.json", name: "Hero" };
    await writeFile(path.join(root, record.filename), JSON.stringify(document));
    const first = await loadRuntimePrefabSources([ref(prefabGuid)], [record, ...assets], root, index, [], library);
    assert.equal(first[0].resources.animation.characterAssets.avatarMasks[0].name, "Upper");
    const savedNext = { ...library, avatarMasks: [{ ...library.avatarMasks[0], name: "Changed", revision: "mask-r2" }] };
    const next = await loadRuntimePrefabSources([ref(prefabGuid)], [record, ...assets], root, index, [], savedNext);
    assert.equal(first[0].resources.animation.characterAssets.avatarMasks[0].name, "Upper");
    assert.equal(next[0].resources.animation.characterAssets.avatarMasks[0].name, "Changed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("saved animation capture rejects excess distinct targets and unsafe sources before asset loading", () => {
  const documents = [0, 1].map((part) => ({ objects: Array.from({ length: 17 }, (_, index) => ({ ...document.objects[0],
    assetRef: ref((part * 17 + index + 1).toString(16).padStart(32, "0")) })) }));
  assert.throws(() => validatePrefabAnimationTargetCapacity(documents), /32 distinct animated target models/);
  documents[1].objects.splice(-2); assert.doesNotThrow(() => validatePrefabAnimationTargetCapacity(documents));
  documents[1].objects.push(documents[0].objects[0]); assert.doesNotThrow(() => validatePrefabAnimationTargetCapacity(documents));
  for (const filename of ["../Hero.glb", "/Hero.glb", "nested\\Hero.glb", "Hero.glb?source=external", "nested//Hero.glb"]) {
    assert.throws(() => capturePrefabResources(document, [{ ...assets[0], filename }, ...assets.slice(1)], index, [], library), /unsafe source filename/);
  }
  assert.throws(() => capturePrefabResources(document, assets, index.map((entry) => entry.guid === external ? { ...entry, importSettings: "invalid" } : entry), [], library), /invalid saved importer settings/);
});
