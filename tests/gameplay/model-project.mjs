import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createAnimationProject } from "./animation-project.mjs";
import { BoxGeometry } from "three";

export const MODEL_GUID = "ab110000000000000000000000000001";
export const MODEL_PREFAB_GUID = "bf110000000000000000000000000001";
export function createModelProject({ physics = true, format = "gltf" } = {}) {
  const root = createAnimationProject({ physics });
  const assets = path.join(root, "assets");
  unlinkSync(path.join(assets, "Animated Cube.gltf")); unlinkSync(path.join(assets, "Animated Cube.gltf.braze.meta"));
  const geometry = new BoxGeometry(1, 1, 1), arrays = [geometry.attributes.position.array, geometry.attributes.normal.array, geometry.attributes.uv.array, geometry.index.array];
  let offset = 0;
  const bufferViews = arrays.map((array) => { const view = { buffer: 0, byteOffset: offset, byteLength: array.byteLength }; offset += array.byteLength; return view; });
  const bytes = Buffer.concat(arrays.map((array) => Buffer.from(array.buffer)));
  writeFileSync(path.join(assets, "crate.bin"), bytes);
  // Small opaque checker PNG: an external imported texture, also used by the saved material.
  writeFileSync(path.join(assets, "crate.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAGElEQVR4nGNYsGDBfxCA0QzIHBDNQFAFAETpNtktnz/dAAAAAElFTkSuQmCC", "base64"));
  writeFileSync(path.join(assets, "override.png"), readFileSync(path.join(assets, "crate.png")));
  const model = { asset: { version: "2.0", generator: "Braze runtime model review" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Crate", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: "Crate surface", pbrMetallicRoughness: { baseColorFactor: [1,0.4,0.03,1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.65 } }],
    textures: [{ source: 0 }], images: [{ uri: "crate.png" }], bufferViews, buffers: [{ byteLength: bytes.length, uri: "crate.bin" }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-0.5,-0.5,-0.5], max: [0.5,0.5,0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" }, { bufferView: 2, componentType: 5126, count: 24, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 36, type: "SCALAR" }] };
  const modelFilename = `Runtime Crate.${format}`;
  const json = JSON.stringify(model);
  if (format === "glb") {
    const payload = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4)), header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + payload.length, 8);
    header.writeUInt32LE(payload.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    writeFileSync(path.join(assets, modelFilename), Buffer.concat([header, payload]));
  } else writeFileSync(path.join(assets, modelFilename), json);
  geometry.dispose();
  writeFileSync(path.join(assets, `${modelFilename}.braze.meta`), JSON.stringify({ fileFormatVersion: 1, guid: MODEL_GUID,
    importer: { id: "braze.model", settingsVersion: 1, settings: { scaleFactor: 1, fitToEditorSize: false, convertUnits: false, preserveHierarchy: true, importAnimations: false } }, labels: [], foreignIds: {} }));
  const node = (id, primitive, position) => ({ id, name: id, primitive, position, rotation: [0,0,0], scale: [1,1,1], visible: true, locked: false, color: "#ffffff" });
  const original = { ...node("Imported orange", "gltf", [-0.75, 0, 0]), parentId: "root", assetRef: { guid: MODEL_GUID, localId: "main" } };
  const override = { ...original, id: "Material cyan", name: "Material cyan", position: [0.75,0,0], materialId: "runtime-cyan" };
  if (physics) Object.assign(override, { rigidbody: { enabled: true, bodyType: "dynamic", massMode: "manual", mass: 1 }, colliders: [{ id: "box", enabled: true, shape: "box", size: [1,1,1] }] });
  writeFileSync(path.join(assets, "Model Pair.braze-prefab.json"), JSON.stringify({ version: "braze/prefab-v1", name: "Model Pair", rootIds: ["root"], objects: [node("root", "transform", [0,2,0]), original, override] }));
  writeFileSync(path.join(assets, "Model Pair.braze-prefab.json.braze.meta"), JSON.stringify({ fileFormatVersion: 1, guid: MODEL_PREFAB_GUID, importer: { id: "braze.prefab", settingsVersion: 1, settings: {} }, labels: [], foreignIds: {} }));
  writeFileSync(path.join(root, "braze.project.json"), JSON.stringify({ version: 1, gameplayEntry: "game.ts", runtimePhysicsCapacity: physics ? 8 : 0, runtimePrefabs: [{ guid: MODEL_PREFAB_GUID }] }));
  writeFileSync(path.join(root, "project.json"), JSON.stringify({ materials: [{ id: "runtime-cyan", name: "Cyan texture", color: "#00cfff", roughness: 0.65, metalness: 0,
    baseColorTextureUrl: "/3d-models/override.png", baseColorTextureFilename: "override.png", baseColorTextureFlipY: false }] }));
  const scenePath = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(scenePath, "utf8"));
  scene.objects = scene.objects.filter((object) => !["normal", "fixedStep", "unscaledTime"].includes(object.id));
  scene.environment.ao = { enabled: false };
  writeFileSync(scenePath, JSON.stringify(scene));
  const game = readFileSync(new URL("./fixtures/model-game.ts", import.meta.url), "utf8").replace("../../../src/gameplay/public", path.resolve("src/gameplay/public.ts"))
    .replace("./model-review-panel", path.resolve("tests/gameplay/fixtures/model-review-panel.ts"));
  writeFileSync(path.join(root, "game.ts"), game);
  return root;
}
