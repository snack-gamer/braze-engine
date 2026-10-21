import assert from "node:assert/strict";
import test from "node:test";
import {
  compilePlayerContent,
  derivePlayerFeatures,
  rewritePlayerAssetUrls,
  selectReferencedPlayerAssets,
} from "./player-package-compiler.mjs";

const GUID_A = "a".repeat(32);
const GUID_B = "b".repeat(32);

test("player export retains default ambient occlusion for sparse scene settings", () => {
  for (const environment of [undefined, {}, { ao: {} }, { ao: { intensity: 0.4 } }]) {
    assert.equal(derivePlayerFeatures({ environment, objects: [] }).effects.ao, true);
  }
  assert.equal(derivePlayerFeatures({ environment: { ao: { enabled: false } } }).effects.ao, false);
});

test("a runtime body reserve retains physics in a player with no authored bodies", () => {
  const source = { sceneId: "empty", scene: { objects: [] }, project: {}, assets: [], indexRecords: [] };
  assert.equal(compilePlayerContent(source).content.features.physics, false);
  assert.equal(compilePlayerContent({ ...source, runtimePhysicsCapacity: 16 }).content.features.physics, true);
});

function asset(guid, filename, dependencies = []) {
  return {
    guid,
    filename,
    name: filename,
    kind: "model",
    path: `assets/${filename}`,
    url: `/3d-models/${encodeURIComponent(filename)}`,
    sizeBytes: 12,
    dependencies,
  };
}

test("player asset selection follows authored references and catalog dependencies", () => {
  const assets = [
    asset(GUID_A, "Hero.fbx", [{ kind: "asset", guid: GUID_B }]),
    asset(GUID_B, "Walk.fbx"),
    asset("c".repeat(32), "Unused.fbx"),
  ];
  const selected = selectReferencedPlayerAssets({
    objects: [{ asset: { ref: { guid: GUID_A }, url: "/3d-models/Hero.fbx" } }],
  }, {}, assets);

  assert.deepEqual(selected.map((entry) => entry.filename), ["Hero.fbx", "Walk.fbx"]);
});

test("player feature manifest reflects the exported scene instead of editor capabilities", () => {
  const features = derivePlayerFeatures({
    environment: {
      worldSource: "sky",
      bloom: false,
      ao: { enabled: false },
      sky: { cloudsCoverage: 0.5, cloudsDensity: 1, godraysIntensity: 2 },
    },
    animation: { tracks: [{ id: "track" }] },
    objects: [
      { source_type: "fbx", animator: { enabled: true } },
      { source_type: "gltf" },
    ],
  });

  assert.deepEqual(features.modelLoaders, ["fbx", "gltf"]);
  assert.equal(features.animator, true);
  assert.equal(features.timeline, true);
  assert.equal(features.environment, "sky");
  assert.deepEqual(features.effects, {
    ao: false,
    bloom: false,
    ssr: false,
    clouds: true,
    godrays: true,
    scattering: false,
    fog: false,
  });
});

test("player feature manifest honors serialized component enablement", () => {
  const features = derivePlayerFeatures({
    environment: { worldSource: "hdri" },
    objects: [
      { source_type: "particle", particle_effect: { enabled: false } },
      { source_type: "cloner", cloner: { enabled: false } },
      { source_type: "water", water_settings: {} },
      { source_type: "cube", rigidbody: { enabled: false }, colliders: [{ enabled: false }] },
      { source_type: "cube", character_controller: { enabled: true } },
    ],
  });

  assert.equal(features.particles, false);
  assert.equal(features.cloner, false);
  assert.equal(features.water, true);
  assert.equal(features.physics, true);
});

test("player feature manifest includes authored Prime timeline playback", () => {
  const features = derivePlayerFeatures({
    timeline: { tracks: [{ id: "prime-track" }] },
    objects: [],
  });

  assert.equal(features.timeline, true);
});

test("compiled player content excludes unused assets and rewrites URLs for subpath hosting", () => {
  const scene = {
    environment: { worldSource: "sky", hdriUrl: "/hdri/unused.exr" },
    objects: [{
      asset: { ref: { guid: GUID_A }, url: "/3d-models/Hero.fbx?importVersion=one" },
      material_id: "used-material",
    }],
  };
  const result = compilePlayerContent({
    sceneId: "main",
    scene,
    project: {
      materials: [
        { id: "used-material", name: "Used" },
        { id: "unused-material", name: "Unused" },
      ],
    },
    assets: [asset(GUID_A, "Hero.fbx"), asset(GUID_B, "Unused.fbx")],
    indexRecords: [
      { guid: GUID_A, sourcePath: "Hero.fbx", kind: "model", importSettings: { scaleFactor: 2 } },
    ],
  });

  assert.equal(result.content.scene.objects[0].asset.url, "./3d-models/Hero.fbx?importVersion=one");
  assert.deepEqual(result.content.materials.map((entry) => entry.id), ["used-material"]);
  assert.deepEqual(result.content.importedAssets.map((entry) => entry.filename), ["Hero.fbx"]);
  assert.deepEqual(result.content.modelImportDocuments["Hero.fbx"], {
    version: "braze/model-import-v3",
    sourceFilename: "Hero.fbx",
    settings: { scaleFactor: 2 },
    revision: GUID_A,
    updatedAt: null,
    importVersion: GUID_A,
  });
  assert.deepEqual(result.publicAssetUrls, ["/3d-models/Hero.fbx?importVersion=one"]);
  assert.equal(rewritePlayerAssetUrls("/hdri/sky.exr"), "./hdri/sky.exr");
});
