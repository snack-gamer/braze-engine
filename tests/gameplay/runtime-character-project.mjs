import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameplayTestProject } from "./project-fixture.mjs";
import { runtimeAnimationModelDocument, runtimePrefabAnimator, RUNTIME_ANIMATION_MODEL_GUID } from "./runtime-animation-project.mjs";

export const RUNTIME_CHARACTER_PREFAB_GUID = "bf140000000000000000000000000001";
export const RUNTIME_CHARACTER_SKIN_PREFAB_GUID = "bf140000000000000000000000000002";
export const RUNTIME_CHARACTER_MODEL_GUID = "ab140000000000000000000000000001";
const engineRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Reuse the real weighted skin and add a metre of root-bone translation per loop. */
export function runtimeCharacterModelDocument() {
  const model = runtimeAnimationModelDocument();
  const bytes = Buffer.from(model.buffers[0].uri.split(",")[1], "base64");
  const positions = new Float32Array([0, 0, 0, 0.25, 0, 0, 0.5, 0, 0, 0.75, 0, 0, 1, 0, 0]);
  const translated = Buffer.from(positions.buffer);
  model.bufferViews.push({ buffer: 0, byteOffset: bytes.length, byteLength: translated.length });
  model.accessors.push({ bufferView: 8, componentType: 5126, count: 5, type: "VEC3" });
  model.animations[0].samplers.push({ input: 5, output: 8, interpolation: "LINEAR" });
  model.animations[0].channels.push({ sampler: 1, target: { node: 1, path: "translation" } });
  const combined = Buffer.concat([bytes, translated]);
  model.buffers[0] = { byteLength: combined.length, uri: `data:application/octet-stream;base64,${combined.toString("base64")}` };
  return model;
}

export function runtimeCharacterPrefabDocument({ animated = false } = {}) {
  const node = (id, primitive) => ({ id, name: id, primitive, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, locked: false, color: "#29d6ff" });
  const character = { ...node("character", animated ? "gltf" : "cube"), parentId: "root",
    rigidbody: { enabled: true, bodyType: "kinematic", useGravity: false, interpolation: "none" },
    colliders: [{ id: "character-capsule", enabled: true, shape: "capsule", axis: "y", center: [0, 0.9, 0], radius: 0.35, length: 1.1, friction: 0, isTrigger: false }],
    characterController: { version: 1, enabled: true, capsuleColliderId: "character-capsule" },
    behaviors: { version: 1, entries: [{ id: "locomotion", type: "review.runtime-character-locomotion", typeVersion: 1, enabled: true,
      values: { speed: 3, gravity: 9.81, jumpSpeed: 5 } }] },
  };
  if (animated) {
    const animator = JSON.parse(JSON.stringify(runtimePrefabAnimator(true)).replaceAll(RUNTIME_ANIMATION_MODEL_GUID, RUNTIME_CHARACTER_MODEL_GUID));
    animator.rootMotion = { mode: "applyToObject", source: "rootBone", translationAxes: { x: true, y: false, z: false }, rotation: "yaw", bakeIntoPose: false };
    Object.assign(character, { assetRef: { guid: RUNTIME_CHARACTER_MODEL_GUID, localId: "main" }, animator });
  } else {
    // Canonical cubes are 1.4m: this visible .7 x 1.4 x .7 box matches its capsule.
    character.scale = [0.5, 1, 0.5];
    Object.assign(character.colliders[0], { center: [0, 0, 0], radius: 0.7, length: 0.7 });
  }
  return { version: "braze/prefab-v1", name: animated ? "Root Motion Character" : "Runtime Character", rootIds: ["root"], objects: [node("root", "transform"), character] };
}

export function createRuntimeCharacterProject() {
  const root = createGameplayTestProject({ runtimePhysicsCapacity: 8 });
  const assets = path.join(root, "assets");
  const meta = (guid, id, settings = {}) => ({ fileFormatVersion: 1, guid, importer: { id, settingsVersion: 1, settings }, labels: [], foreignIds: {} });
  for (const [animated, guid, filename] of [[false, RUNTIME_CHARACTER_PREFAB_GUID, "Runtime Character.braze-prefab.json"], [true, RUNTIME_CHARACTER_SKIN_PREFAB_GUID, "Root Motion Character.braze-prefab.json"]]) {
    writeFileSync(path.join(assets, filename), JSON.stringify(runtimeCharacterPrefabDocument({ animated })));
    writeFileSync(path.join(assets, `${filename}.braze.meta`), JSON.stringify(meta(guid, "braze.prefab")));
  }
  const modelFile = "Runtime Character Skin.gltf";
  writeFileSync(path.join(assets, modelFile), JSON.stringify(runtimeCharacterModelDocument()));
  writeFileSync(path.join(assets, `${modelFile}.braze.meta`), JSON.stringify(meta(RUNTIME_CHARACTER_MODEL_GUID, "braze.model", {
    scaleFactor: 1, fitToEditorSize: false, convertUnits: false, preserveHierarchy: true, importAnimations: true,
    rig: { kind: "generic" }, clipSettings: { "clip:Sway": { looping: true } },
  })));
  writeFileSync(path.join(root, "braze.project.json"), JSON.stringify({ version: 1, gameplayEntry: "game.ts", runtimePhysicsCapacity: 8,
    runtimePrefabs: [{ guid: RUNTIME_CHARACTER_PREFAB_GUID }, { guid: RUNTIME_CHARACTER_SKIN_PREFAB_GUID }] }));
  const scenePath = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(scenePath, "utf8"));
  scene.objects = scene.objects.filter((object) => object.id !== "hero");
  scene.environment.ao = { enabled: false };
  writeFileSync(scenePath, JSON.stringify(scene));
  const game = readFileSync(new URL("./fixtures/runtime-character-game.ts", import.meta.url), "utf8")
    .replace("../../../src/gameplay/public", path.join(engineRoot, "src/gameplay/public.ts"))
    .replace("./runtime-character-review-panel", path.join(engineRoot, "tests/gameplay/fixtures/runtime-character-review-panel.ts"));
  writeFileSync(path.join(root, "game.ts"), game);
  return root;
}
