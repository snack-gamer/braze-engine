import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCENE_FILE = path.join(ROOT, "scenes/current.scene.json");
const PREFAB_FILE = path.join(ROOT, "3d-models/codex-prefab-undo-overrides.braze-prefab.json");

async function readIfExists(file) {
  return existsSync(file) ? readFile(file, "utf8") : null;
}

async function restore(file, contents) {
  if (contents === null) await rm(file, { force: true });
  else await writeFile(file, contents, "utf8");
}

function sceneFixture() {
  return {
    version: "braze-engine/scene-v0",
    savedAt: new Date().toISOString(),
    activeObjectId: "scene-cube",
    activeCameraId: "scene-camera",
    camera: { position: [5.6, 4.2, 6.4], target: [0, 0.8, 0], fov_degrees: 45 },
    objects: [
      {
        id: "scene-camera",
        name: "Camera",
        identity: "camera",
        source_type: "camera",
        parent_id: null,
        semantic_tag: "camera",
        color: "#a4b6c7",
        visible: true,
        locked: false,
        prompt: "",
        transform: { position: [5.6, 4.2, 6.4], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
        camera: { target: [0, 0.8, 0], fov_degrees: 45, near: 0.1, far: 200, focus_distance: 8, f_stop: 5.6 },
        references: [],
      },
      {
        id: "scene-cube",
        name: "Scene Cube",
        identity: "cube",
        source_type: "cube",
        parent_id: null,
        semantic_tag: "ship",
        color: "#f2b84b",
        visible: true,
        locked: false,
        prompt: "",
        transform: { position: [0, 0.8, 0], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
        references: [],
      },
    ],
  };
}

function prefabFixture() {
  return {
    version: "braze/prefab-v1",
    name: "Codex Prefab Undo Overrides",
    createdAt: new Date().toISOString(),
    rootIds: ["prefab-root"],
    objects: [
      {
        id: "prefab-root",
        name: "Prefab Smoke Root",
        identity: "prefab root",
        primitive: "transform",
        tag: "unassigned",
        color: "#9da3a6",
        visible: true,
        locked: false,
        renderVisible: false,
        prompt: "",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        referenceImages: [],
      },
      {
        id: "prefab-child",
        name: "Prefab Smoke Cube",
        identity: "cube",
        primitive: "cube",
        tag: "ship",
        color: "#f2b84b",
        visible: true,
        locked: false,
        prompt: "",
        parentId: "prefab-root",
        position: [0, 0.8, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        referenceImages: [],
      },
    ],
  };
}

const previousScene = await readIfExists(SCENE_FILE);
const previousPrefab = await readIfExists(PREFAB_FILE);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

try {
  await mkdir(path.dirname(SCENE_FILE), { recursive: true });
  await mkdir(path.dirname(PREFAB_FILE), { recursive: true });
  await writeFile(SCENE_FILE, `${JSON.stringify(sceneFixture(), null, 2)}\n`, "utf8");
  await writeFile(PREFAB_FILE, `${JSON.stringify(prefabFixture(), null, 2)}\n`, "utf8");

  await page.addInitScript(() => {
    localStorage.removeItem("tgan.assetFilter");
    localStorage.removeItem("tgan.assetRecent");
    localStorage.removeItem("tgan.assetFavorites");
  });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rail-left .object-row", { timeout: 20000 });

  await page.getByLabel("Search assets").fill("codex-prefab-undo-overrides");
  const prefabTile = page.locator(".prefab-tile", { hasText: "codex-prefab-undo-overrides" }).first();
  await prefabTile.waitFor({ state: "visible", timeout: 10000 });
  await prefabTile.dblclick();
  await page.locator(".rail-left .object-row", { hasText: "Prefab Smoke Root" }).first().click();

  await page.locator(".prefab-instance-card", { hasText: "Linked prefab" }).waitFor({ state: "visible", timeout: 10000 });
  await page
    .locator('aside[aria-label="Inspector"] label.field', { hasText: "Name" })
    .locator("input")
    .first()
    .fill("Scene Override Root");
  await page.locator(".prefab-override-chip", { hasText: "Name" }).waitFor({ state: "visible", timeout: 10000 });

  await prefabTile.click();
  await page.getByTitle("Edit prefab").click();
  await page.getByText("Prefab Mode").waitFor({ state: "visible", timeout: 10000 });
  const before = await page.locator(".rail-left .object-row").count();
  await page.locator(".rail-left .add-menu__trigger").click();
  await page.getByRole("menuitem", { name: /^Cube$/ }).click();
  await page.waitForTimeout(100);
  const afterAdd = await page.locator(".rail-left .object-row").count();
  if (afterAdd !== before + 1) throw new Error(`Prefab add expected ${before + 1} rows, saw ${afterAdd}`);
  await page.getByTitle(/Undo/).click();
  await page.waitForTimeout(100);
  const afterUndo = await page.locator(".rail-left .object-row").count();
  if (afterUndo !== before) throw new Error(`Prefab undo expected ${before} rows, saw ${afterUndo}`);
  await page.getByTitle(/Redo/).click();
  await page.waitForTimeout(100);
  const afterRedo = await page.locator(".rail-left .object-row").count();
  if (afterRedo !== before + 1) throw new Error(`Prefab redo expected ${before + 1} rows, saw ${afterRedo}`);

  const fatalErrors = errors.filter((text) => !/favicon|WebSocket|ResizeObserver/i.test(text));
  if (fatalErrors.length) throw new Error(`Browser errors:\n${fatalErrors.join("\n")}`);
  console.log("PASS prefab undo + override UI");
} finally {
  await browser.close();
  await restore(SCENE_FILE, previousScene);
  await restore(PREFAB_FILE, previousPrefab);
}
