import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readProjectUiAssets, validatePlayerUiAssets } from "./player-ui-assets.mjs";
import { compilePlayerContent } from "./player-package-compiler.mjs";
const image = { guid: "a".repeat(32), kind: "image", name: "Art", filename: "UI/art.png", url: "/3d-models/UI/art.png", path: "3d-models/UI/art.png", sizeBytes: 150 };
const font = { ...image, guid: "b".repeat(32), kind: "font", filename: "UI/font.ttf", url: "/3d-models/UI/font.ttf" };
test("script manifests are bounded AssetRefs; renamed dependencies export, unused assets do not", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "braze-ui-assets-"));
  try {
    assert.deepEqual(await readProjectUiAssets(root), []);
    await writeFile(path.join(root, "braze.project.json"), JSON.stringify({ uiAssets: [{ guid: font.guid }] }));
    const refs = await readProjectUiAssets(root);
    const scene = { objects: [{ ui_canvas: { root: { image: { guid: image.guid } } } }] };
    const compiled = compilePlayerContent({ sceneId: "current", scene, project: {}, assets: [image, font, { ...font, guid: "c".repeat(32), filename: "unused.ttf" }], indexRecords: [], uiAssets: refs });
    assert.equal(compiled.content.importedAssets.length, 2); assert.ok(compiled.publicAssetUrls.some((url) => url.includes("font.ttf")));
    assert.throws(() => validatePlayerUiAssets(scene, refs, [image]), /Missing or incompatible UI asset/);
    assert.throws(() => validatePlayerUiAssets({ objects: [{ ui_canvas: { root: { style: { font: { guid: image.guid } } } } }] }, [], [image]), /incompatible/);
    await writeFile(path.join(root, "braze.project.json"), JSON.stringify({ uiAssets: [{ url: "https://example.com/font.ttf" }] }));
    await assert.rejects(readProjectUiAssets(root), /GUID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
