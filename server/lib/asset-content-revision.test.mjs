import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAssetContentRevision } from "./assets/asset-content-revision.mjs";

function modelRecord(settings) {
  return {
    sourceHash: "source-sha256",
    importerId: "braze.model",
    importerVersion: 1,
    importSettings: settings,
  };
}

test("model content revisions include importer settings deterministically", () => {
  const first = effectiveAssetContentRevision(modelRecord({
    normals: "import",
    scene: { scaleFactor: 1, convertUnits: true },
  }));
  const reordered = effectiveAssetContentRevision(modelRecord({
    scene: { convertUnits: true, scaleFactor: 1 },
    normals: "import",
  }));
  const changed = effectiveAssetContentRevision(modelRecord({
    normals: "calculate",
    scene: { scaleFactor: 1, convertUnits: true },
  }));

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.notEqual(first, "source-sha256");
});

test("model content revisions change with source or importer contract", () => {
  const baseline = effectiveAssetContentRevision(modelRecord({ normals: "import" }));
  assert.notEqual(baseline, effectiveAssetContentRevision({
    ...modelRecord({ normals: "import" }),
    sourceHash: "new-source-sha256",
  }));
  assert.notEqual(baseline, effectiveAssetContentRevision({
    ...modelRecord({ normals: "import" }),
    importerVersion: 2,
  }));
});

test("assets without model import processing retain their source revision", () => {
  assert.equal(effectiveAssetContentRevision({
    sourceHash: "texture-sha256",
    importerId: "braze.texture",
    importerVersion: 1,
    importSettings: { colorSpace: "srgb" },
  }), "texture-sha256");
  assert.equal(effectiveAssetContentRevision({
    sourceHash: null,
    importerId: "braze.model",
  }), null);
});
