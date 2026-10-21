import { expect, test } from "playwright/test";
import type { Page } from "playwright/test";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_FBX = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
\tFBXVersion: 7400
}
Objects:  {
}
Connections:  {
\tC: "OO",0,0
}
`;

const ANIMATED_GLTF = JSON.stringify({
  asset: { version: "2.0", generator: "Braze persistence browser test" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "Root" }],
  buffers: [{
    byteLength: 32,
    uri: "data:application/octet-stream;base64,AAAAAAAAgD8AAAAAAAAAAAAAAAAAAAAAzcxMPgAAAAA=",
  }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 8 },
    { buffer: 0, byteOffset: 8, byteLength: 24 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
    { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
  ],
  animations: [{
    name: "Idle",
    samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
    channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
  }],
});

function projectAssetsRoot() {
  const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT;
  if (!projectRoot) throw new Error("BRAZE_PLAYWRIGHT_PROJECT_ROOT is unavailable");
  return path.join(projectRoot, "assets");
}

test("Apply & Reimport persists model importer state across a full editor reload", async ({ page }) => {
  const filename = `Persistent Hero ${Date.now()}.fbx`;
  const source = path.join(projectAssetsRoot(), filename);
  await mkdir(projectAssetsRoot(), { recursive: true });
  await writeFile(source, EMPTY_FBX, "utf8");
  await page.goto("/");

  const tile = page.locator(".model-tile").filter({ hasText: "Persistent Hero" });
  await expect(tile).toBeVisible();
  await tile.click();
  await page.getByRole("tab", { name: "Rig", exact: true }).click();
  await page.getByLabel("Animation Type", { exact: true }).selectOption("humanoid");
  await page.getByRole("button", { name: "Apply & Reimport", exact: true }).click();
  await expect(page.locator(".model-import__status")).toHaveText("No pending changes");

  const sidecar = JSON.parse(await readFile(`${source}.braze.meta`, "utf8"));
  expect(sidecar.importer.settingsVersion).toBe(3);
  expect(sidecar.importer.settings.rig.kind).toBe("humanoid");

  await page.reload();
  await page.locator(".model-tile").filter({ hasText: "Persistent Hero" }).click();
  await page.getByRole("tab", { name: "Rig", exact: true }).click();
  await expect(page.getByLabel("Animation Type", { exact: true })).toHaveValue("humanoid");
});

test("Apply persists Clip events to asset metadata across a full editor reload", async ({ page }) => {
  const label = `Persistent Event ${Date.now()}`;
  const filename = `${label}.gltf`;
  const source = path.join(projectAssetsRoot(), filename);
  await mkdir(projectAssetsRoot(), { recursive: true });
  await writeFile(source, ANIMATED_GLTF, "utf8");
  await page.goto("/");

  const animation = page.locator("#editor-dock-surface-animation");
  const eventInspector = page.locator("#editor-dock-surface-inspector")
    .getByRole("region", { name: "Selected animation event" });
  const openClip = async () => {
    await page.getByRole("tab", { name: "Project", exact: true }).click();
    const project = page.locator("#editor-dock-surface-project");
    const model = project.locator(".model-tile").filter({ hasText: label });
    await expect(model).toBeVisible();
    const clip = project.locator('.model-subasset-tile[data-subasset-kind="clip"]')
      .filter({ hasText: "Idle" });
    if (!await clip.isVisible()) {
      await model.getByRole("button", { name: /Expand imported contents/ }).click();
    }
    await clip.dblclick();
  };
  await openClip();

  const timeline = animation.getByLabel("Idle imported animation timeline", { exact: true });
  const eventLine = timeline.getByLabel("Animation Event line", { exact: true });
  const bounds = await eventLine.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
    { button: "right" },
  );
  await page.getByRole("menuitem", { name: "Add Animation Event", exact: true }).click();
  await eventInspector.getByLabel("Animation event name", { exact: true }).fill("Footstep");
  await eventInspector.getByLabel("Animation event name", { exact: true }).press("Tab");
  const apply = animation.getByRole("button", { name: "Apply & Reimport", exact: true });
  await apply.click();
  await expect(apply).toBeDisabled();

  await expect.poll(async () => {
    const sidecar = JSON.parse(await readFile(`${source}.braze.meta`, "utf8")) as {
      importer?: { settings?: { clipSettings?: Record<string, { events?: unknown[] }> } };
    };
    return Object.values(sidecar.importer?.settings?.clipSettings ?? {})
      .flatMap((settings) => settings.events ?? [])
      .map((event) => (event as { name?: unknown }).name);
  }).toEqual(["Footstep"]);

  await page.reload();
  await openClip();
  await expect(animation.getByText("Recovered · Unsaved", { exact: true })).toHaveCount(0);
  await expect(animation.locator(".animation-clip-event-marker")).toHaveCount(1);
});

test("the open editor follows external create, rename, content change, and deletion", async ({ page }) => {
  const suffix = Date.now();
  const originalFilename = `Watcher Hero ${suffix}.fbx`;
  const renamedFilename = `Renamed Hero ${suffix}.fbx`;
  const source = path.join(projectAssetsRoot(), originalFilename);
  const renamed = path.join(projectAssetsRoot(), renamedFilename);
  await mkdir(projectAssetsRoot(), { recursive: true });
  await page.goto("/");

  await writeFile(source, EMPTY_FBX, "utf8");
  const originalTile = page.locator(".model-tile").filter({ hasText: "Watcher Hero" });
  await expect(originalTile).toBeVisible();
  await originalTile.click();
  const original = await assetRecord(page, originalFilename);

  await rename(source, renamed);
  await expect(page.locator(".model-tile").filter({ hasText: "Renamed Hero" })).toBeVisible();
  const moved = await assetRecord(page, renamedFilename);
  expect(moved.guid).toBe(original.guid);

  await writeFile(renamed, `${EMPTY_FBX}\n; content changed`, "utf8");
  await expect.poll(async () => (
    await assetRecord(page, renamedFilename)
  ).contentRevision).not.toBe(moved.contentRevision);

  await rm(renamed);
  await expect(page.locator(".model-tile").filter({ hasText: "Renamed Hero" })).toHaveCount(0);
  await expect(page.locator(".rail-right").getByText("Asset", { exact: true })).toHaveCount(0);
});

async function assetRecord(page: Page, filename: string) {
  const response = await page.request.get("/api/assets");
  expect(response.ok()).toBe(true);
  const payload = await response.json() as { assets: Array<Record<string, unknown>> };
  const asset = payload.assets.find((entry) => entry.filename === filename);
  expect(asset).toBeTruthy();
  return asset!;
}
