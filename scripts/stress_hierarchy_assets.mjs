import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCENE_FILE = path.join(ROOT, "scenes/current.scene.json");
const PROJECT_FILE = path.join(ROOT, "project.json");
const ASSETS_DIR = path.join(ROOT, "3d-models");
const TEMP_PREFIX = "codex-stress-prefab-";
const OBJECT_COUNT = Number(process.env.TGAN_STRESS_OBJECTS || 620);
const ASSET_COUNT = Number(process.env.TGAN_STRESS_ASSETS || 72);

async function readIfExists(file) {
  return existsSync(file) ? readFile(file, "utf8") : null;
}

async function restore(file, contents) {
  if (contents === null) await rm(file, { force: true });
  else await writeFile(file, contents, "utf8");
}

function baseObject(id, name, kind, index, parentId = null) {
  const tag = kind === "camera" ? "camera" : kind === "transform" ? "unassigned" : index % 3 === 0 ? "ship" : "prop";
  const color = tag === "camera" ? "#a4b6c7" : tag === "ship" ? "#f2b84b" : tag === "prop" ? "#b68cff" : "#9da3a6";
  return {
    id,
    name,
    identity: name.toLowerCase(),
    source_type: kind,
    parent_id: parentId,
    semantic_tag: tag,
    color,
    visible: true,
    locked: false,
    row_color: index % 11 === 0 ? color : null,
    row_color_enabled: index % 11 === 0,
    prompt: "",
    transform: {
      position: [(index % 18) * 0.35 - 3, kind === "transform" ? 0 : 0.8, Math.floor(index / 18) * 0.22],
      rotation_degrees: [0, 0, 0],
      scale: [1, 1, 1],
    },
    references: [],
  };
}

function largeScene() {
  const objects = [
    {
      ...baseObject("stress-camera", "Stress Camera", "camera", 0),
      camera: { target: [0, 0.8, 0], fov_degrees: 45, near: 0.1, far: 300, focus_distance: 8, f_stop: 5.6 },
    },
  ];
  const groupCount = Math.max(8, Math.floor(OBJECT_COUNT / 12));
  for (let group = 0; group < groupCount; group += 1) {
    const groupId = `stress-group-${group}`;
    objects.push(baseObject(groupId, `Stress Group ${group}`, "transform", group + 1));
    for (let child = 0; child < 11 && objects.length < OBJECT_COUNT; child += 1) {
      const i = objects.length;
      objects.push(baseObject(`stress-leaf-${i}`, `Stress Leaf ${i}`, child % 4 === 0 ? "sphere" : "cube", i, groupId));
    }
  }
  return {
    version: "braze-engine/scene-v0",
    savedAt: new Date().toISOString(),
    activeObjectId: "stress-leaf-12",
    activeCameraId: "stress-camera",
    camera: { position: [8, 6, 8], target: [0, 0.8, 0], fov_degrees: 45 },
    objects,
  };
}

function prefabDoc(index) {
  return {
    version: "braze/prefab-v1",
    name: `Stress Prefab ${index}`,
    createdAt: new Date().toISOString(),
    rootIds: [`stress-prefab-root-${index}`],
    objects: [
      {
        id: `stress-prefab-root-${index}`,
        name: `Stress Prefab ${index}`,
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
    ],
  };
}

const previousScene = await readIfExists(SCENE_FILE);
const previousProject = await readIfExists(PROJECT_FILE);
const tempFiles = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

try {
  await mkdir(path.dirname(SCENE_FILE), { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });
  const scene = largeScene();
  await writeFile(SCENE_FILE, `${JSON.stringify(scene, null, 2)}\n`, "utf8");

  const folders = ["Stress", "Stress/Prefabs"];
  const itemFolders = {};
  for (let i = 0; i < ASSET_COUNT; i += 1) {
    const filename = `${TEMP_PREFIX}${String(i).padStart(3, "0")}.braze-prefab.json`;
    const file = path.join(ASSETS_DIR, filename);
    tempFiles.push(file);
    await writeFile(file, `${JSON.stringify(prefabDoc(i), null, 2)}\n`, "utf8");
    itemFolders[`prefab:${filename}`] = "Stress/Prefabs";
  }
  await writeFile(
    PROJECT_FILE,
    `${JSON.stringify({ assets: { folders, itemFolders, itemNames: {} }, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );

  await page.addInitScript(() => {
    localStorage.removeItem("tgan.assetFilter");
    localStorage.removeItem("tgan.assetRecent");
    localStorage.removeItem("tgan.assetFavorites");
    localStorage.removeItem("tgan.folders");
    localStorage.removeItem("tgan.itemFolders");
    localStorage.removeItem("tgan.itemNames");
  });

  const started = Date.now();
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rail-left .object-row", { timeout: 30000 });
  await page.waitForFunction((count) => document.querySelectorAll(".rail-left .object-row").length >= count, scene.objects.length, {
    timeout: 30000,
  });
  const loadMs = Date.now() - started;
  const rowCount = await page.locator(".rail-left .object-row").count();
  console.log(`hierarchy rows: ${rowCount} in ${loadMs}ms`);

  await page.locator(".hierarchy-search input").fill("Stress Leaf 120");
  await page.waitForTimeout(150);
  const searchRows = await page.locator(".rail-left .object-row").count();
  if (searchRows === 0 || searchRows > 40) throw new Error(`Hierarchy search returned suspicious row count: ${searchRows}`);

  await page.getByLabel("Search assets").fill(TEMP_PREFIX);
  await page.waitForFunction((count) => document.querySelectorAll(".prefab-tile").length >= count, ASSET_COUNT, {
    timeout: 30000,
  });
  const prefabTiles = await page.locator(".prefab-tile").count();
  console.log(`prefab tiles: ${prefabTiles}`);

  const fatalErrors = errors.filter((text) => !/favicon|WebSocket|ResizeObserver/i.test(text));
  if (fatalErrors.length) throw new Error(`Browser errors:\n${fatalErrors.join("\n")}`);
  console.log("PASS stress hierarchy + assets");
} finally {
  await browser.close();
  for (const file of tempFiles) await rm(file, { force: true });
  await restore(SCENE_FILE, previousScene);
  await restore(PROJECT_FILE, previousProject);
}
