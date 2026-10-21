import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BoxGeometry, Matrix4 } from "three";
import { createGameplayTestProject } from "./project-fixture.mjs";

export const RUNTIME_ANIMATION_MODEL_GUID = "ab120000000000000000000000000001";
export const RUNTIME_ANIMATION_PREFAB_GUID = "bf120000000000000000000000000001";
const engineRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Small weighted mesh: the upper half bends around a real child bone, rather than moving the model node. */
export function runtimeAnimationModelDocument() {
  const geometry = new BoxGeometry(0.55, 1.8, 0.5);
  geometry.translate(0, 0.9, 0);
  const positions = geometry.attributes.position.array, joints = new Uint16Array(positions.length / 3 * 4), weights = new Float32Array(joints.length);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    joints[vertex * 4] = positions[vertex * 3 + 1] > 0.9 ? 1 : 0;
    weights[vertex * 4] = 1;
  }
  const times = new Float32Array([0, 0.25, 0.5, 0.75, 1]);
  const rotations = new Float32Array([0, 0, 0, 1, 0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8),
    0, 0, 0, 1, 0, 0, -Math.sin(Math.PI / 8), Math.cos(Math.PI / 8), 0, 0, 0, 1]);
  const inverseBind = new Float32Array([...new Matrix4().elements, ...new Matrix4().makeTranslation(0, -0.9, 0).elements]);
  const arrays = [positions, geometry.attributes.normal.array, joints, weights, geometry.index.array, times, rotations, inverseBind];
  const chunks = []; let offset = 0;
  const bufferViews = arrays.map((array) => {
    const padding = (4 - offset % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength), view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    chunks.push(bytes); offset += bytes.length; return view;
  });
  const model = {
    asset: { version: "2.0", generator: "Braze animated runtime prefab fixture" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: "Armature", children: [1, 3] }, { name: "RootBone", children: [2] }, { name: "TipBone", translation: [0, 0.9, 0] }, { name: "Skin", mesh: 0, skin: 0 }],
    skins: [{ name: "Two bone skin", joints: [1, 2], skeleton: 1, inverseBindMatrices: 7 }],
    meshes: [{ name: "Bending column", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 4, material: 0 }] }],
    materials: [{ name: "Orange skin", pbrMetallicRoughness: { baseColorFactor: [1, 0.4, 0.03, 1], metallicFactor: 0, roughnessFactor: 0.65 } }],
    animations: [{ name: "Sway", samplers: [{ input: 5, output: 6, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 2, path: "rotation" } }] }],
    bufferViews, buffers: [{ byteLength: offset, uri: `data:application/octet-stream;base64,${Buffer.concat(chunks).toString("base64")}` }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: [-0.275, 0, -0.25], max: [0.275, 1.8, 0.25] },
      { bufferView: 1, componentType: 5126, count: positions.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: positions.length / 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: positions.length / 3, type: "VEC4" },
      { bufferView: 4, componentType: 5123, count: geometry.index.count, type: "SCALAR" },
      { bufferView: 5, componentType: 5126, count: times.length, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 6, componentType: 5126, count: times.length, type: "VEC4" },
      { bufferView: 7, componentType: 5126, count: 2, type: "MAT4" },
    ],
  };
  geometry.dispose(); return model;
}

export function runtimePrefabAnimator(physics = false) {
  const transition = (id, destination, mode) => ({ id, destination: { kind: "state", stateId: destination },
    conditions: [{ parameterId: "active", mode }], hasExitTime: false, durationMode: "seconds", duration: 0, offsetNormalized: 0 });
  const state = (id, speed) => ({ id, name: id, speed, ...(id === "sway" ? { speedParameterId: "speed" } : {}), cycleOffset: 0,
    motion: { kind: "clip", clipRef: { guid: RUNTIME_ANIMATION_MODEL_GUID, localId: "clip:Sway" }, speed: 1 },
    transitions: [transition(`${id}-toggle`, id === "sway" ? "hold" : "sway", id === "sway" ? "ifNot" : "if")],
    events: id === "sway" ? [{ id: "beat", name: "Beat", timeNormalized: 0.25, payload: { source: "runtime-skin" } }] : [] });
  return { version: "braze/animator-component-v2", enabled: true, updateMode: physics ? "fixedStep" : "normal",
    cullingMode: "alwaysAnimate", rootMotion: { mode: "disabled" },
    controller: { version: "braze/animator-controller-v1", id: "runtime-skin-controller", name: "Runtime Skin Behavior Map", revision: "r1",
      parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 1 }, { id: "active", name: "Active", kind: "boolean", defaultValue: true }],
      layers: [{ id: "base", name: "Base", weight: 1, blendingMode: "override", defaultStateId: "sway", states: [state("sway", 1), state("hold", 0)], anyStateTransitions: [] }],
      behaviorMap: { version: 1, layers: [{ layerId: "base", nodes: [{ id: "entry", position: [-180, 0] }, { id: "state:sway", position: [0, 0] }, { id: "state:hold", position: [220, 0] }] }] },
    },
  };
}

export function createRuntimeAnimationProject({ physics = false } = {}) {
  const root = createGameplayTestProject(), assets = path.join(root, "assets");
  const modelFile = "Runtime Skin.gltf", prefabFile = "Animated Skin.braze-prefab.json";
  writeFileSync(path.join(assets, modelFile), JSON.stringify(runtimeAnimationModelDocument()));
  const meta = (guid, id, settings) => ({ fileFormatVersion: 1, guid, importer: { id, settingsVersion: 1, settings }, labels: [], foreignIds: {} });
  writeFileSync(path.join(assets, `${modelFile}.braze.meta`), JSON.stringify(meta(RUNTIME_ANIMATION_MODEL_GUID, "braze.model", {
    scaleFactor: 1, fitToEditorSize: false, convertUnits: false, preserveHierarchy: true, importAnimations: true, clipSettings: { "clip:Sway": { looping: true } },
  })));
  const node = (id, primitive, position) => ({ id, name: id, primitive, position, rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, locked: false, color: "#ffffff" });
  const skin = { ...node("Animated Skin", "gltf", [0, 0, 0]), parentId: "root", assetRef: { guid: RUNTIME_ANIMATION_MODEL_GUID, localId: "main" }, animator: runtimePrefabAnimator(physics) };
  if (physics) Object.assign(skin, { rigidbody: { enabled: true, bodyType: "dynamic", massMode: "manual", mass: 1, useGravity: false }, colliders: [{ id: "skin-box", enabled: true, shape: "box", center: [0, 0.9, 0], size: [0.55, 1.8, 0.5] }] });
  writeFileSync(path.join(assets, prefabFile), JSON.stringify({ version: "braze/prefab-v1", name: "Animated Skin", rootIds: ["root"], objects: [node("root", "transform", [0, 0, 0]), skin] }));
  writeFileSync(path.join(assets, `${prefabFile}.braze.meta`), JSON.stringify(meta(RUNTIME_ANIMATION_PREFAB_GUID, "braze.prefab", {})));
  writeFileSync(path.join(root, "braze.project.json"), JSON.stringify({ version: 1, gameplayEntry: "game.ts", runtimePhysicsCapacity: physics ? 4 : 0, runtimePrefabs: [{ guid: RUNTIME_ANIMATION_PREFAB_GUID }] }));
  const sceneFile = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(sceneFile, "utf8"));
  scene.objects = scene.objects.filter((object) => !["hero", "wall"].includes(object.id));
  for (const object of scene.objects) delete object.colliders;
  scene.environment.ao = { enabled: false }; writeFileSync(sceneFile, JSON.stringify(scene));
  const game = readFileSync(new URL("./fixtures/runtime-animation-game.ts", import.meta.url), "utf8")
    .replace("../../../src/gameplay/public", path.join(engineRoot, "src/gameplay/public.ts"))
    .replace("./runtime-animation-review-panel", path.join(engineRoot, "tests/gameplay/fixtures/runtime-animation-review-panel.ts"));
  writeFileSync(path.join(root, "game.ts"), game); return root;
}
