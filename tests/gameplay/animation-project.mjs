import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGameplayTestProject } from "./project-fixture.mjs";

const GUID = "ab100000000000000000000000000001";
export function createAnimationProject({ physics = true } = {}) {
  const root = createGameplayTestProject();
  const filename = path.join(root, "assets", "Animated Cube.gltf");
  const positions = new Float32Array([-0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5, -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5]);
  const indices = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5]);
  const times = new Float32Array([0, 0.5, 1]), translations = new Float32Array([0,0,0, 0,1.5,0, 0,0,0]);
  const arrays = [positions, indices, times, translations]; let offset = 0;
  const bufferViews = arrays.map((array) => { const view = { buffer: 0, byteOffset: offset, byteLength: array.byteLength }; offset += array.byteLength; return view; });
  const bytes = Buffer.concat(arrays.map((array) => Buffer.from(array.buffer)));
  writeFileSync(filename, JSON.stringify({ asset: { version: "2.0", generator: "Braze Step 10 review" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: "Bouncer", mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1,0.45,0.08,1], metallicFactor: 0, roughnessFactor: 0.6 } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5,-0.5,-0.5], max: [0.5,0.5,0.5] },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" }, { bufferView: 2, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC3" }], bufferViews,
    buffers: [{ byteLength: bytes.length, uri: `data:application/octet-stream;base64,${bytes.toString("base64")}` }],
    animations: [{ name: "Bounce", samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }],
  }));
  writeFileSync(`${filename}.braze.meta`, JSON.stringify({ fileFormatVersion: 1, guid: GUID, importer: { id: "braze.model", settingsVersion: 1,
    settings: { clipSettings: { "clip:Bounce": { looping: true } }, preserveHierarchy: true } }, labels: [], foreignIds: {} }));
  const scenePath = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(scenePath, "utf8"));
  scene.objects = scene.objects.filter((object) => !["hero", "wall"].includes(object.id));
  for (const [index, updateMode] of ["normal", "fixedStep", "unscaledTime"].entries()) scene.objects.push({
    id: updateMode, source_type: "gltf", name: updateMode, asset: { name: "Animated Cube", ref: { guid: GUID, local_id: "main" }, url: "/3d-models/Animated%20Cube.gltf" },
    transform: { position: [(index - 1) * 2, 0.6, 0] },
    animator: { version: "braze/animator-component-v2", enabled: true, updateMode, cullingMode: "alwaysAnimate", rootMotion: { mode: "disabled" },
      controller: { version: "braze/animator-controller-v1", id: `review-${updateMode}`, name: `${updateMode} bounce`, revision: "r1", parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 1 }],
        layers: [{ id: "base", name: "Base", weight: 1, blendingMode: "override", defaultStateId: "bounce", states: [{ id: "bounce", name: "Bounce", speed: 1, cycleOffset: 0,
          motion: { kind: "clip", clipRef: { guid: GUID, localId: "clip:Bounce" }, speed: 1 }, transitions: [], events: [{ id: "beat", name: "Beat", timeNormalized: 0.5, payload: {} }] }], anyStateTransitions: [] }] },
    },
  });
  if (!physics) for (const object of scene.objects) delete object.colliders;
  writeFileSync(scenePath, JSON.stringify(scene));
  const game = readFileSync(new URL("./fixtures/animation-game.ts", import.meta.url), "utf8")
    .replace("../../../src/gameplay/public", path.resolve("src/gameplay/public.ts"))
    .replace("./animation-review-panel", path.resolve("tests/gameplay/fixtures/animation-review-panel.ts"));
  writeFileSync(path.join(root, "game.ts"), game);
  return root;
}
