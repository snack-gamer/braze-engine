import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCENE_FILE = path.join(ROOT, "scenes/current.scene.json");
const PROJECT_FILE = path.join(ROOT, "project.json");
const MODEL_FILENAME = "tgan_duck-65bf938f54d6.glb";
const MODEL_KEY = `model:${MODEL_FILENAME}`;

async function readIfExists(file) {
  return existsSync(file) ? readFile(file, "utf8") : null;
}

async function restore(file, contents) {
  if (contents === null) await rm(file, { force: true });
  else await writeFile(file, contents, "utf8");
}

function object(id, name, kind, parentId = null) {
  const tag = kind === "camera" ? "camera" : kind === "transform" ? "unassigned" : "ship";
  const color = tag === "camera" ? "#a4b6c7" : tag === "ship" ? "#f2b84b" : "#9da3a6";
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
    prompt: "",
    transform: { position: [0, kind === "transform" ? 0 : 0.8, 0], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
    references: [],
  };
}

const previousScene = await readIfExists(SCENE_FILE);
const previousProject = await readIfExists(PROJECT_FILE);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

try {
  await mkdir(path.dirname(SCENE_FILE), { recursive: true });
  await writeFile(
    SCENE_FILE,
    `${JSON.stringify(
      {
        version: "braze-engine/scene-v0",
        savedAt: new Date().toISOString(),
        activeObjectId: "child-a",
        activeCameraId: "edge-camera",
        camera: { position: [5.6, 4.2, 6.4], target: [0, 0.8, 0], fov_degrees: 45 },
        objects: [
          {
            ...object("edge-camera", "Camera", "camera"),
            camera: { target: [0, 0.8, 0], fov_degrees: 45, near: 0.1, far: 200, focus_distance: 8, f_stop: 5.6 },
          },
          object("parent-a", "Parent A", "transform"),
          object("child-a", "Child A", "cube", "parent-a"),
          object("sibling-b", "Sibling B", "transform"),
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    PROJECT_FILE,
    `${JSON.stringify(
      {
        assets: {
          folders: ["Edge", "Edge/Old"],
          itemFolders: { [MODEL_KEY]: "Edge/Old" },
          itemNames: { [MODEL_KEY]: "Edge Duck" },
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await page.addInitScript(() => {
    localStorage.removeItem("tgan.assetFilter");
    localStorage.removeItem("tgan.folders");
    localStorage.removeItem("tgan.itemFolders");
    localStorage.removeItem("tgan.itemNames");
  });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".rail-left .object-row", { timeout: 20000 });

  await page.locator(".rail-left .object-row", { hasText: "Child A" }).first().click();
  await page.keyboard.press("F2");
  await page.locator(".object-name-input").fill("Child Renamed");
  await page.keyboard.press("Enter");
  await page.locator(".rail-left .object-row", { hasText: "Child Renamed" }).waitFor({ state: "visible", timeout: 10000 });

  const moveOutcome = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".rail-left .object-row"));
    const source = rows.find((row) => row.querySelector(".object-name")?.textContent?.includes("Child Renamed"));
    const target = rows.find((row) => row.querySelector(".object-name")?.textContent?.includes("Sibling B"));
    if (!source || !target) return false;
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    return true;
  });
  if (!moveOutcome) throw new Error("Could not dispatch hierarchy move");
  await page.waitForTimeout(150);
  const childDepth = await page
    .locator(".rail-left .object-row", { hasText: "Child Renamed" })
    .first()
    .evaluate((row) => Number(getComputedStyle(row).getPropertyValue("--row-depth") || "0"));
  if (childDepth < 1) throw new Error(`Moved child depth should be nested, got ${childDepth}`);

  await page.locator(".rail-left .object-row", { hasText: "Child Renamed" }).first().click();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);
  if ((await page.locator(".rail-left .object-row", { hasText: "Child Renamed" }).count()) !== 0) {
    throw new Error("Delete did not remove renamed hierarchy row");
  }
  if ((await page.locator(".rail-left .object-row", { hasText: "Camera" }).count()) !== 1) {
    throw new Error("Delete edge case removed the required camera");
  }

  await page.locator(".asset-tile.folder-tile", { hasText: "Edge" }).first().dblclick();
  await page.locator(".asset-tile.folder-tile", { hasText: "Old" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Rename/ }).click();
  await page.locator(".asset-tile__name-input").fill("New");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(650);
  let project = await page.evaluate(() => fetch("/api/project").then((response) => response.json()));
  if (project.project.assets.itemFolders[MODEL_KEY] !== "Edge/New") {
    throw new Error(`Rename did not persist item folder remap: ${project.project.assets.itemFolders[MODEL_KEY]}`);
  }

  await page.locator(".asset-tile.folder-tile", { hasText: "New" }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Delete$/ }).click();
  await page.locator(".confirm-modal").getByRole("button", { name: "Delete" }).click();
  await page.waitForTimeout(650);
  project = await page.evaluate(() => fetch("/api/project").then((response) => response.json()));
  if (project.project.assets.itemFolders[MODEL_KEY] !== "Edge") {
    throw new Error(`Delete folder did not bubble item to parent: ${project.project.assets.itemFolders[MODEL_KEY]}`);
  }

  const fatalErrors = errors.filter((text) => !/favicon|WebSocket|ResizeObserver/i.test(text));
  if (fatalErrors.length) throw new Error(`Browser errors:\n${fatalErrors.join("\n")}`);
  console.log("PASS hierarchy delete/rename/move + folder persistence edges");
} finally {
  await browser.close();
  await restore(SCENE_FILE, previousScene);
  await restore(PROJECT_FILE, previousProject);
}
