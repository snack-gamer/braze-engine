import assert from "node:assert/strict";
import { test } from "node:test";
import { capturePrefabResources } from "./runtime-prefab-resources.mjs";
import { compilePlayerContent, rewritePlayerAssetUrls } from "./player-package-compiler.mjs";
const guid = "b".repeat(32);
const model = { guid, kind: "model", status: "ready", filename: "renamed.gltf", url: "/3d-models/renamed.gltf", contentRevision: "saved" };
const texture = { guid: "c".repeat(32), kind: "image", status: "ready", contentRevision: "texture-r1", filename: "map.png", url: "/3d-models/map.png" };
const document = { objects: [{ name: "Test", primitive: "gltf", assetRef: { guid }, assetUrl: "/3d-models/old.gltf", materialId: "cyan" }] };
const index = [{ guid, importSettings: { scaleFactor: 2 } }], materials = [{ id: "cyan", color: "#00cfff", baseColorTextureUrl: "/3d-models/map.png" }];
test("runtime prefab resources follow model identity, snapshot saved imports/materials and fail closed on missing dependencies", () => {
  const resources = capturePrefabResources(document, [model, texture], index, materials);
  assert.equal(resources.models[0].url, "/3d-models/renamed.gltf?importVersion=saved");
  assert.deepEqual(resources.models[0].importSettings, { scaleFactor: 2 });
  resources.materials[0].color = "#ffffff"; assert.equal(materials[0].color, "#00cfff");
  for (const assets of [[], [model], [model, model, texture], [{ ...model, status: "missing" }, texture]]) assert.throws(() => capturePrefabResources(document, assets, index, materials), /missing|ready|ambiguous/);
  assert.throws(() => capturePrefabResources(document, [model, texture], [], materials), /snapshot/);
  assert.throws(() => capturePrefabResources(document, [model, texture], index, []), /material/);
});
test("player feature selection and emitted dependencies include prefab-only models and textures without enabling physics", () => {
  const resources = capturePrefabResources(document, [model, texture], index, materials);
  const prefabs = [{ document, resources }];
  const compiled = compilePlayerContent({ sceneId: "current", scene: { objects: [] }, project: { materials }, assets: [model, texture], indexRecords: index, runtimePrefabs: prefabs });
  assert.deepEqual(compiled.content.features.modelLoaders, ["gltf"]); assert.equal(compiled.content.features.physics, false);
  assert.equal(rewritePlayerAssetUrls(prefabs)[0].resources.materials[0].baseColorTextureUrl, "./3d-models/map.png?importVersion=texture-r1");
  assert.ok(compiled.publicAssetUrls.includes("/3d-models/map.png")); assert.ok(compiled.publicAssetUrls.some((url) => url.startsWith("/3d-models/renamed.gltf")));
  assert.ok(!compiled.publicAssetUrls.includes("/3d-models/old.gltf"));
  assert.equal(rewritePlayerAssetUrls(prefabs)[0].resources.models[0].url, "./3d-models/renamed.gltf?importVersion=saved");
});

test("saved texture revisions prevent stale cache reuse on the next Play", () => {
  const first = capturePrefabResources(document, [model, texture], index, materials);
  const next = capturePrefabResources(document, [model, { ...texture, contentRevision: "texture-r2" }], index, materials);
  assert.notEqual(first.materials[0].baseColorTextureUrl, next.materials[0].baseColorTextureUrl);
  assert.equal(materials[0].baseColorTextureUrl, "/3d-models/map.png");
});
