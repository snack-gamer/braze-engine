import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameplayTestProject } from "./project-fixture.mjs";
import { runtimeCharacterPrefabDocument } from "./runtime-character-project.mjs";

export const STOCK_CONTROL_STYLES = ["first-person", "third-person", "top-down"];
export const STOCK_CONTROL_INPUT_GUID = "ab150000000000000000000000000001";
export const STOCK_CONTROL_PREFAB_GUID = "bf150000000000000000000000000001";
const engineRoot = fileURLToPath(new URL("../..", import.meta.url));

export function stockControlComponent(style = "first-person", cameraEnabled = true) {
  if (!STOCK_CONTROL_STYLES.includes(style)) throw new Error(`Unknown stock control style: ${style}`);
  return { version: 1, entries: [{ id: "stock", type: `braze.control.${style}`, typeVersion: 1, enabled: true,
    values: { speed: 3, sharpness: 0, cameraEnabled, ...(style === "first-person" ? { pivotHeight: 0.85 } : {}) } }] };
}

export function stockControlInputDocument() {
  const axis = (name, positive, negative) => ({ name, kind: "axis", bindings: [
    { device: "keyboard", code: positive }, { device: "keyboard", code: negative, scale: -1 },
  ] });
  return { version: "braze/input-action-map-v1", name: "Stock Controls", map: { version: 1, actions: [
    axis("moveX", "KeyD", "KeyA"), axis("moveZ", "KeyW", "KeyS"),
    { name: "jump", kind: "button", bindings: [{ device: "keyboard", code: "Space" }] },
    ...["x", "y"].map((axis) => ({ name: axis === "x" ? "lookX" : "lookY", kind: "delta", bindings: [{ device: "pointer-delta", axis }] })),
    { name: "lookRateX", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 2, deadzone: 0.15 }] },
    { name: "lookRateY", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 3, deadzone: 0.15 }] },
  ] } };
}

export function stockControlPrefabDocument(style = "first-person") {
  const document = runtimeCharacterPrefabDocument();
  document.name = "Stock Controlled Character";
  document.objects.find((object) => object.id === "character").behaviors = stockControlComponent(style);
  return document;
}

/** The stock-only variant has no module file; saved declarations own its entire controller. */
export function createStockControlsProject({ style = "first-person", scripted = false } = {}) {
  const component = stockControlComponent(style), root = createGameplayTestProject();
  const sceneFile = path.join(root, "scenes/current.scene.json"), scene = JSON.parse(readFileSync(sceneFile, "utf8"));
  const hero = scene.objects.find((object) => object.id === "hero");
  Object.assign(hero, { name: "Stock Character", color: "#29d6ff", behaviors: component });
  hero.transform = { position: [0, 0.85, 0], scale: [0.5, 1, 0.5], rotation_degrees: [0, 0, 0] };
  Object.assign(hero.colliders[0], { center: [0, 0, 0], radius: 0.7, length: 0.7 });
  scene.objects.push({ id: "landmark", source_type: "cube", name: "Orange Landmark", color: "#f59a23",
    transform: { position: [0, 0.7, 5], scale: [1, 1, 1], rotation_degrees: [0, 0, 0] } });
  scene.objects.push({ id: "camera-wall", source_type: "cube", name: "Static Camera Wall",
    transform: { position: [0, 2, -3], scale: [5, 4, 0.2], rotation_degrees: [0, 0, 0] },
    colliders: [{ id: "camera-wall-shape", shape: "box", enabled: true, size: [1, 1, 1] }] });
  scene.environment.ao = { enabled: false };
  writeFileSync(sceneFile, JSON.stringify(scene));
  const assets = path.join(root, "assets"), inputFile = "Stock Controls.braze-input.json";
  const sidecar = (guid, id) => ({ fileFormatVersion: 1, guid, importer: { id, settingsVersion: 1, settings: {} }, labels: [], foreignIds: {} });
  writeFileSync(path.join(assets, inputFile), JSON.stringify(stockControlInputDocument()));
  writeFileSync(path.join(assets, `${inputFile}.braze.meta`), JSON.stringify(sidecar(STOCK_CONTROL_INPUT_GUID, "braze.input-action-map")));
  const projectFile = path.join(root, "project.json"), project = JSON.parse(readFileSync(projectFile, "utf8"));
  project.input = { version: 1, actionMap: { guid: STOCK_CONTROL_INPUT_GUID, localId: "main" } };
  writeFileSync(projectFile, JSON.stringify(project));
  const config = { version: 1 };
  if (scripted) {
    const prefabFile = "Stock Controlled Character.braze-prefab.json";
    writeFileSync(path.join(assets, prefabFile), JSON.stringify(stockControlPrefabDocument(style)));
    writeFileSync(path.join(assets, `${prefabFile}.braze.meta`), JSON.stringify(sidecar(STOCK_CONTROL_PREFAB_GUID, "braze.prefab")));
    Object.assign(config, { gameplayEntry: "game.ts", runtimePhysicsCapacity: 4, runtimePrefabs: [{ guid: STOCK_CONTROL_PREFAB_GUID }] });
    const game = readFileSync(new URL("./fixtures/stock-controls-game.ts", import.meta.url), "utf8")
      .replace("../../../src/gameplay/public", path.join(engineRoot, "src/gameplay/public.ts"))
      .replace("./stock-controls-review-panel", path.join(engineRoot, "tests/gameplay/fixtures/stock-controls-review-panel.ts"));
    writeFileSync(path.join(root, "game.ts"), game);
  } else rmSync(path.join(root, "game.ts"));
  writeFileSync(path.join(root, "braze.project.json"), JSON.stringify(config));
  return root;
}
