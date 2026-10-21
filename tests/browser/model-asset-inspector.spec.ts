import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "playwright/test";
import { defaultModelImportSettings } from "../../src/lib/model-import-settings";

import { COMPOUND_MODEL_GUID, writeCompoundModel } from "../fixtures/compound-model.mjs";

const modelAsset = {
  guid: "0123456789abcdef0123456789abcdef",
  name: "Camera Preview.fbx",
  filename: "camera-icon.fbx",
  kind: "model",
  importerId: "braze.model",
  status: "ready",
  foreignIds: { unityGuid: "unity-camera-guid" },
  dependencies: [{ kind: "texture", path: "textures/camera.png" }],
  subAssets: [
    { localId: "main", kind: "model", name: "Camera Preview" },
    {
      localId: "clip:Turntable",
      kind: "clip",
      name: "Turntable",
      sourceIndex: 0,
      durationSeconds: 2.4,
      looping: false,
      trackCount: 12,
      keyframeCount: 48,
      inspectorValues: {
        Duration: "2.40 s",
        "Loop Time": "No",
        Curves: 12,
        Keyframes: 48,
        Imported: "Yes",
        Avatar: "None",
      },
    },
    {
      localId: "mesh:camera:4300000",
      kind: "mesh",
      name: "Camera Body",
      sourceIndex: 0,
      nodePath: "Camera/Body",
      skinned: false,
      vertexCount: 256,
      triangleCount: 480,
      attributes: ["normal", "position", "uv"],
      materialLocalIds: ["material:camera:2100000"],
      inspectorValues: {
        Node: "Camera/Body",
        Vertices: 256,
        Triangles: 480,
        Skinned: "No",
        Attributes: "normal, position, uv",
        Materials: "Camera Material",
      },
    },
    {
      localId: "material:camera:2100000",
      kind: "material",
      name: "Camera Material",
      sourceIndex: 0,
      materialType: "MeshStandardMaterial",
      previewColor: "#556677",
      bindings: [{ nodePath: "Camera/Body", slot: 0 }],
      inspectorValues: {
        Shader: "MeshStandardMaterial",
        "Base Color": "#556677",
        "Used By": "Camera/Body",
      },
    },
  ],
  diagnostics: [{
    code: "MODEL_TEST_WARNING",
    severity: "warning",
    message: "One optional source texture was not embedded.",
  }],
  contentRevision: "model-fixture-r1",
  path: "assets/camera-icon.fbx",
  url: "/3d-models/camera-icon.fbx",
  sizeBytes: 24_000,
  updatedAt: "2026-08-29T12:00:00.000Z",
};

const imageAsset = {
  guid: "abcdef0123456789abcdef0123456789",
  name: "Foam Texture.png",
  filename: "foam-texture.png",
  kind: "image",
  importerId: "braze.texture",
  status: "ready",
  contentRevision: "image-fixture-r1",
  path: "assets/foam-texture.png",
  url: "/textures/foamTex-512x.png",
  sizeBytes: 32_000,
  updatedAt: "2026-08-29T12:00:00.000Z",
};

test.describe("model asset Inspector", () => {
  test.beforeEach(async ({ page }) => {
    await installAssetFixture(page);
  });

  test("keeps the Inspector dark while its deferred asset module loads", async ({ page }) => {
    await page.route("**/src/components/AssetInspector.tsx*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("button", {
      name: `Expand imported contents of ${modelAsset.name}`,
      exact: true,
    }).click();
    const mesh = page.locator(".model-subasset-tile").filter({ hasText: "Camera Body" });
    await expect(mesh).toBeVisible();
    await mesh.click();

    const rail = page.locator(".rail-right");
    const fallback = rail.locator(".editor-dock-pane-loading");
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveText("Loading Asset");
    await expect(rail.locator(".scene-loading")).toHaveCount(0);
    const [fallbackBackground, railBackground] = await Promise.all([
      fallback.evaluate((element) => getComputedStyle(element).backgroundColor),
      rail.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(fallbackBackground).toBe(railBackground);

    await expect(rail.getByText("Imported mesh", { exact: true })).toBeVisible();
  });

  test("shows a real model preview and keeps pipeline identifiers out of the authoring view", async ({ page }, testInfo) => {
    await page.goto("/");
    const tile = page.locator(".model-tile").filter({ hasText: modelAsset.name });
    await expect(tile).toBeVisible();
    await tile.click();

    const rail = page.locator(".rail-right");
    const preview = rail.locator(".asset-inspector__model-preview");
    await expect(preview).toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
    const canvas = preview.locator("canvas");
    await expect(canvas).toBeVisible();
    const drawingBuffer = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
    expect(drawingBuffer.width).toBeGreaterThan(0);
    expect(drawingBuffer.height).toBeGreaterThan(0);
    expect(Math.max(drawingBuffer.width, drawingBuffer.height)).toBeLessThanOrEqual(1024);
    await preview.screenshot({ path: testInfo.outputPath("model-preview-grid.png") });

    await expect(preview).toHaveCSS("resize", "vertical");
    const initialPreviewBounds = await preview.boundingBox();
    expect(initialPreviewBounds).not.toBeNull();
    await preview.evaluate((element) => { (element as HTMLElement).style.height = "190px"; });
    await expect.poll(async () => (await preview.boundingBox())?.height ?? 0).toBeLessThan(220);

    await preview.getByRole("button", { name: "Grid settings", exact: true }).click();
    const gridSettings = page.getByRole("dialog", { name: "Grid settings", exact: true });
    const showGrid = gridSettings.getByRole("checkbox", { name: "Show grid", exact: true });
    const gridOpacity = gridSettings.getByLabel("Grid opacity", { exact: true });
    await expect(showGrid).toBeChecked();
    await expect(gridOpacity).toHaveValue("0.56");
    await showGrid.uncheck();
    await expect(gridOpacity).toBeDisabled();
    await showGrid.check();
    await preview.getByRole("button", { name: "Grid settings", exact: true }).click();

    await expect(rail.getByText("1 mesh · 1 material · 1 clip", { exact: true })).toBeVisible();
    await expect(rail.getByText("One optional source texture was not embedded.", { exact: true })).toBeVisible();
    await expect(rail.getByText("Scale & Units", { exact: true })).toBeVisible();
    await expect(rail.getByText("Included Content", { exact: true })).toBeVisible();
    await expect(rail.getByText("Object Structure", { exact: true })).toBeVisible();
    await expect(rail.getByText("Surface Shading", { exact: true })).toBeVisible();

    await expect(rail.getByText("braze.model", { exact: true })).toHaveCount(0);
    await expect(rail.getByText(modelAsset.guid, { exact: true })).toHaveCount(0);
    await expect(rail.getByText("mesh:camera:4300000", { exact: false })).toHaveCount(0);
    await expect(rail.getByText("unity-camera-guid", { exact: true })).toHaveCount(0);
    await expect(rail.getByText("MODEL_TEST_WARNING", { exact: true })).toHaveCount(0);
    await expect(rail.getByText("Bake Axis Conversion", { exact: true })).toHaveCount(0);
    await expect(rail.getByText("Mesh Compression", { exact: true })).toHaveCount(0);
    await expect(rail.getByText("Generate Colliders", { exact: true })).toHaveCount(0);

    const sceneObjectCount = await page.locator(".object-row").count();
    const reset = rail.getByRole("button", { name: "Reset model preview view", exact: true });
    await expect(reset).toBeDisabled();
    const initialView = await previewView(preview);
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width * 0.5, bounds!.y + bounds!.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * 0.72, bounds!.y + bounds!.height * 0.62, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => preview.getAttribute("data-view-default")).toBe("false");
    await expect.poll(async () => (await previewView(preview)).azimuth).not.toBe(initialView.azimuth);
    await expect(reset).toBeEnabled();

    const orbitView = await previewView(preview);
    await canvas.hover();
    await page.mouse.wheel(0, -280);
    await expect.poll(async () => (await previewView(preview)).distance).not.toBe(orbitView.distance);

    await reset.click();
    await expect.poll(() => previewView(preview)).toEqual(initialView);
    await expect(preview).toHaveAttribute("data-view-default", "true");
    await expect(reset).toBeDisabled();
    await expect(page.locator(".object-row")).toHaveCount(sceneObjectCount);

    await rail.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(rail.getByText("braze.model", { exact: true })).toBeVisible();
    await rail.getByRole("button", { name: "Identifiers", exact: true }).click();
    await expect(rail.getByText(modelAsset.guid, { exact: true })).toBeVisible();
    await expect(rail.getByText("unity-camera-guid", { exact: true })).toBeVisible();
    await rail.getByRole("button", { name: /Diagnostic Codes/ }).click();
    await expect(rail.getByText("MODEL_TEST_WARNING", { exact: true })).toBeVisible();

    expect(await rail.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });

  test("expands an FBX into stable imported sub-assets without creating a folder", async ({ page }) => {
    await page.goto("/");
    const tile = page.locator(".model-tile").filter({ hasText: modelAsset.name });
    const clip = page.locator(".model-subasset-tile").filter({ hasText: "Turntable" });
    const gridFontSize = await tile.locator(".asset-tile__name").evaluate((element) => getComputedStyle(element).fontSize);
    const expand = tile.getByRole("button", { name: `Expand imported contents of ${modelAsset.name}`, exact: true });
    await expect(expand).toBeVisible();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(clip).toHaveCount(0);

    await expand.click();
    const collapse = tile.getByRole("button", { name: `Collapse imported contents of ${modelAsset.name}`, exact: true });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(clip).toBeVisible();
    await expect(clip).toHaveAttribute("data-subasset-kind", "clip");
    await expect(page.locator(".model-subasset-tile")).toHaveCount(3);
    await expect(page.locator(".folder-tile").filter({ hasText: modelAsset.name })).toHaveCount(0);

    const inspector = page.locator(".rail-right");
    const mesh = page.locator(".model-subasset-tile").filter({ hasText: "Camera Body" });
    await mesh.click();
    await expect(inspector.getByText("Camera Body", { exact: true })).toBeVisible();
    await expect(inspector.locator('[data-subasset-preview-kind="mesh"]'))
      .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
    await expect(inspector.getByText("Camera/Body", { exact: true })).toBeVisible();
    await expect(inspector.getByText("256", { exact: true })).toBeVisible();
    await expect(inspector.getByText("480", { exact: true })).toBeVisible();
    await expect(inspector.getByText("Camera Material", { exact: true })).toBeVisible();
    await page.locator(".model-subasset-tile").filter({ hasText: "Camera Material" }).click();
    await expect(inspector.locator('[data-subasset-preview-kind="material"]'))
      .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
    await expect(inspector.getByText("MeshStandardMaterial", { exact: true })).toBeVisible();
    await expect(inspector.getByText("#556677", { exact: true })).toBeVisible();
    await clip.click();
    await expect(inspector.getByRole("heading", { name: "Turntable", exact: true })).toBeVisible();
    await expect(inspector.getByText("Embedded in source FBX · Read-only", { exact: true })).toBeVisible();
    await expect(inspector.getByText("2.40 s", { exact: true })).toBeVisible();
    await expect(inspector.getByText("12", { exact: true })).toBeVisible();
    await expect(inspector.getByText("48", { exact: true })).toBeVisible();
    await expect(inspector.getByText("No", { exact: true })).toBeVisible();
    await expect(inspector.getByText("Scale & Units", { exact: true })).toHaveCount(0);
    await tile.click();
    await expect(inspector.getByText("Scale & Units", { exact: true })).toBeVisible();
    await collapse.click();
    await expect(clip).toHaveCount(0);
    await expand.click();
    await expect(clip).toBeVisible();

    await page.getByRole("button", { name: "List view", exact: true }).click();
    const listCollapse = tile.getByRole("button", {
      name: `Collapse imported contents of ${modelAsset.name}`,
      exact: true,
    });
    await expect(listCollapse).toBeVisible();
    const [listDisclosureBounds, listIconBounds, listFontSize, listIconWidths] = await Promise.all([
      listCollapse.boundingBox(),
      tile.locator(".model-tile__icon").boundingBox(),
      tile.locator(".asset-tile__name").evaluate((element) => getComputedStyle(element).fontSize),
      page.locator(".assets__tiles.list .model-tile__icon").evaluateAll((elements) => (
        elements.map((element) => element.getBoundingClientRect().width)
      )),
    ]);
    expect(listDisclosureBounds).not.toBeNull();
    expect(listIconBounds).not.toBeNull();
    expect(listDisclosureBounds!.x).toBeLessThan(listIconBounds!.x);
    expect(listFontSize).toBe(gridFontSize);
    expect(new Set(listIconWidths)).toEqual(new Set([17]));
    await listCollapse.click();
    await expect(clip).toHaveCount(0);
  });

  test("uses the same preview surface for imported images", async ({ page }) => {
    await page.goto("/");
    const tile = page.locator(".image-tile").filter({ hasText: imageAsset.name });
    await expect(tile).toBeVisible();
    await tile.click();

    const rail = page.locator(".rail-right");
    const image = rail.locator(".asset-inspector__preview img");
    await expect(image).toBeVisible();
    expect(await image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    await expect(rail.getByText("Image · PNG", { exact: true })).toBeVisible();
    await expect(rail.getByText("Import Settings", { exact: true })).toHaveCount(0);
  });
});

test("imports an original FBX fixture as a configured compound model with stable identities", async ({ page }) => {
  const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT;
  if (!projectRoot) throw new Error("Missing isolated Playwright project root");
  const assetsRoot = path.join(projectRoot, "assets");
  await mkdir(assetsRoot, { recursive: true });
  await writeCompoundModel(assetsRoot);

  await page.goto("/");
  const tile = page.locator(".model-tile").filter({ hasText: "Compound Character" });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  const imported = page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"]`);
  await expect(imported).toHaveCount(0);
  const expand = tile.getByRole("button", {
    name: "Expand imported contents of Compound Character.fbx",
    exact: true,
  });
  await expect(expand).toBeVisible();
  await expand.click();
  const collapse = tile.getByRole("button", {
    name: "Collapse imported contents of Compound Character.fbx",
    exact: true,
  });
  await expect(collapse).toBeVisible();
  const tileBounds = await tile.boundingBox();
  const iconBounds = await tile.locator(".model-tile__icon").boundingBox();
  const disclosureBounds = await collapse.boundingBox();
  expect(tileBounds).not.toBeNull();
  expect(iconBounds).not.toBeNull();
  expect(disclosureBounds).not.toBeNull();
  expect(disclosureBounds!.x).toBeGreaterThan(tileBounds!.x + tileBounds!.width / 2);
  expect(Math.abs(
    disclosureBounds!.y + disclosureBounds!.height / 2 - (iconBounds!.y + iconBounds!.height / 2),
  )).toBeLessThan(2);
  await expect(tile.locator("..")).toHaveClass(/asset-wrap--compound-child/);
  await expect(imported).toHaveCount(7);
  expect(await imported.evaluateAll((elements) => elements.every((element) => (
    element.parentElement?.classList.contains("asset-wrap--compound-child")
  )))).toBe(true);
  await expect(imported.filter({ hasText: "Sway" })).toHaveAttribute("data-subasset-kind", "clip");
  const meshPreviews = page.locator(
    `.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="mesh"] img`,
  );
  await expect(meshPreviews).toHaveCount(2, { timeout: 30_000 });
  await expect(meshPreviews.first()).toBeVisible();
  await expect(page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="material"] .model-subasset-tile__material-preview`))
    .toHaveCount(2);
  await expect(page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="clip"] img`))
    .toHaveCount(0);
  await expect(page.locator(".folder-tile").filter({ hasText: "Compound Character" })).toHaveCount(0);
  const inspector = page.locator(".rail-right");
  await page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="mesh"]`).first().click();
  await expect(inspector.locator('.asset-inspector__model-preview[data-subasset-preview-kind="mesh"]'))
    .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
  await expect(inspector.getByText("Vertices", { exact: true })).toBeVisible();
  await expect(inspector.getByText("Triangles", { exact: true })).toBeVisible();
  await page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="material"]`).first().click();
  await expect(inspector.locator('.asset-inspector__model-preview[data-subasset-preview-kind="material"]'))
    .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
  await expect(inspector.getByText("Shader", { exact: true })).toBeVisible();
  await expect(inspector.getByText("Base Color", { exact: true })).toBeVisible();
  await imported.filter({ hasText: "Sway" }).click();
  await expect(inspector.getByText("Curves", { exact: true })).toBeVisible();
  await expect(inspector.getByText("Keyframes", { exact: true })).toBeVisible();
  const clipPreview = inspector.locator('.character-preview-workspace[data-subasset-preview-kind="clip"]');
  const previewCanvas = clipPreview.locator("canvas");
  await expect(clipPreview.locator(".character-preview"))
    .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
  await expect(clipPreview).toHaveCSS("resize", "vertical");
  const initialPreviewHeight = (await clipPreview.boundingBox())!.height;
  const initialBufferHeight = await previewCanvas.evaluate((element) => (element as HTMLCanvasElement).height);
  await clipPreview.evaluate((element, height) => {
    (element as HTMLElement).style.height = `${height}px`;
  }, initialPreviewHeight + 80);
  await expect.poll(async () => (await clipPreview.boundingBox())?.height ?? 0)
    .toBeGreaterThan(initialPreviewHeight + 60);
  await expect.poll(() => previewCanvas.evaluate((element) => (element as HTMLCanvasElement).height))
    .toBeGreaterThan(initialBufferHeight);
  const timeline = inspector.getByRole("slider", { name: "Animation timeline" });
  const initialTime = Number(await timeline.inputValue());
  await inspector.getByRole("button", { name: "Play animation preview" }).click();
  await expect(inspector.getByRole("button", { name: "Pause animation preview" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(initialTime);
  await page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="skeleton"]`).click();
  const skeletonPreview = inspector.locator('.character-preview-workspace[data-subasset-preview-kind="skeleton"]');
  await expect(skeletonPreview.locator(".character-preview"))
    .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
  await expect(skeletonPreview.getByRole("group", { name: "Animation preview player" })).toHaveCount(0);
  await expect(inspector.getByText("Root Bone", { exact: true })).toBeVisible();
  await expect(inspector.getByText("Bones", { exact: true })).toBeVisible();
  await page.locator(`.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="avatar"]`).click();
  const avatarPreview = inspector.locator('.character-preview-workspace[data-subasset-preview-kind="avatar"]');
  await expect(avatarPreview.locator(".character-preview"))
    .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
  await expect(avatarPreview.getByRole("group", { name: "Animation preview player" })).toHaveCount(0);
  await expect(inspector.getByText("Animation Type", { exact: true })).toBeVisible();
  await expect(inspector.getByText("Human Mapping", { exact: true })).toBeVisible();
  const identityBefore = await imported.evaluateAll((elements) => elements.map((element) => ({
    guid: element.getAttribute("data-asset-guid"),
    localId: element.getAttribute("data-local-id"),
  })));

  await collapse.click();
  await expect(imported).toHaveCount(0);
  await expand.click();
  await expect(imported).toHaveCount(7);

  await tile.click();
  await inspector.getByRole("tab", { name: "Rig", exact: true }).click();
  await inspector.getByRole("button", { name: "Configure Avatar", exact: true }).click();
  const configurator = page.getByRole("dialog", { name: "Avatar Configuration", exact: true });
  await configurator.getByRole("button", { name: "Auto Map", exact: true }).click();
  const save = configurator.getByRole("button", { name: "Save & Reimport", exact: true });
  await expect(save).toBeEnabled({ timeout: 30_000 });
  await save.click();
  await expect(configurator).toHaveCount(0);
  await expect(inspector.getByText("Avatar configured", { exact: true })).toBeVisible();
  await expect(imported).toHaveCount(7);
  expect(await imported.evaluateAll((elements) => elements.map((element) => ({
    guid: element.getAttribute("data-asset-guid"),
    localId: element.getAttribute("data-local-id"),
  })))).toEqual(identityBefore);

  await tile.click();
  await inspector.getByRole("tab", { name: "Animation", exact: true }).click();
  await expect(inspector.locator(".model-import-animation-tab__source")).toHaveText("Sway");
  await expect(inspector.getByLabel("Animation clip start frame", { exact: true })).toHaveValue("0");
  await expect(inspector.getByLabel("Animation clip end frame", { exact: true })).toHaveValue("110");
  await expect(inspector.getByText("30 FPS", { exact: true })).toBeVisible();
  await expect(inspector.getByRole("switch", { name: "Loop Pose", exact: true })).toBeChecked();
  const importPreview = inspector.locator(".asset-inspector__animated-preview");
  await expect(importPreview.locator(".character-preview"))
    .toHaveAttribute("data-preview-status", "ready", { timeout: 30_000 });
  await expect(inspector.locator(".character-preview-workspace")).toHaveCount(1);
  const importTimeline = importPreview.getByRole("slider", { name: "Animation timeline", exact: true });
  await expect.poll(async () => Number(await importTimeline.getAttribute("max"))).toBeCloseTo(110 / 30, 3);
  await inspector.getByLabel("Animation clip name", { exact: true }).fill("Sway Short");
  await inspector.getByLabel("Animation clip end frame", { exact: true }).fill("60");
  await inspector.getByLabel("Animation clip end frame", { exact: true }).press("Tab");
  await inspector.getByRole("switch", { name: "Loop Time", exact: true }).uncheck();
  await expect.poll(async () => Number(await importTimeline.getAttribute("max"))).toBeCloseTo(2, 3);
  await importPreview.getByRole("button", { name: "Play animation preview", exact: true }).click();
  await expect.poll(async () => Number(await importTimeline.inputValue())).toBeGreaterThan(0);

  const clipRows = inspector.locator('.model-import-clip-table__body [role="option"]');
  await inspector.getByRole("button", { name: "Add animation clip", exact: true }).click();
  await expect(clipRows).toHaveCount(2);
  await inspector.getByLabel("Animation clip name", { exact: true }).fill("Sway Followup");
  await inspector.getByLabel("Animation clip start frame", { exact: true }).fill("60");
  await inspector.getByLabel("Animation clip start frame", { exact: true }).press("Tab");
  await inspector.getByLabel("Animation clip end frame", { exact: true }).fill("90");
  await inspector.getByLabel("Animation clip end frame", { exact: true }).press("Tab");
  await expect.poll(async () => Number(await importTimeline.getAttribute("max"))).toBeCloseTo(1, 3);

  await inspector.getByRole("button", { name: "Add animation clip", exact: true }).click();
  await expect(clipRows).toHaveCount(3);
  await inspector.getByRole("button", { name: "Remove selected animation clip", exact: true }).click();
  await expect(clipRows).toHaveCount(2);
  await inspector.getByRole("button", { name: "Apply & Reimport", exact: true }).click();
  await expect(inspector.locator(".model-import__status")).toHaveText("No pending changes");

  const configuredClip = page.locator(
    `.model-subasset-tile[data-asset-guid="${COMPOUND_MODEL_GUID}"][data-subasset-kind="clip"]`,
  );
  await expect(imported.filter({ hasText: "Sway Short" })).toHaveCount(1);
  await expect(imported.filter({ hasText: "Sway Followup" })).toHaveCount(1);
  const response = await page.request.get("/api/assets");
  const payload = await response.json() as { assets: Array<{ filename: string; subAssets?: Array<Record<string, unknown>> }> };
  const importedClips = payload.assets.find((asset) => asset.filename === "Compound Character.fbx")
    ?.subAssets?.filter((subAsset) => subAsset.kind === "clip") ?? [];
  expect(importedClips).toHaveLength(2);
  expect(importedClips[0]).toMatchObject({
    localId: identityBefore.find((identity) => identity.localId?.startsWith("clip:"))?.localId,
    name: "Sway Short",
    durationSeconds: 2,
    firstFrame: 0,
    lastFrame: 60,
    looping: false,
  });
  expect(importedClips[1]).toMatchObject({
    name: "Sway Followup",
    clipOrigin: "segment",
    sourceIndex: 0,
    durationSeconds: 1,
    firstFrame: 60,
    lastFrame: 90,
  });
  await expect(configuredClip).toHaveCount(2);
});

async function previewView(preview: ReturnType<Page["locator"]>) {
  return preview.evaluate((element) => ({
    azimuth: element.getAttribute("data-azimuth"),
    polar: element.getAttribute("data-polar"),
    distance: element.getAttribute("data-distance"),
  }));
}

async function installAssetFixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/api/assets") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", assets: [modelAsset, imageAsset] }),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/assets/import-settings") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          import: {
            version: "braze/model-import-v1",
            sourceFilename: modelAsset.filename,
            settings: defaultModelImportSettings,
            updatedAt: null,
            importVersion: "model-fixture-r1",
          },
        }),
      });
      return;
    }

    if (request.method() === "GET" && pathname === "/api/project") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          project: { assets: { folders: [], itemFolders: {}, itemNames: {} } },
          revision: "project-fixture-r1",
          sectionRevisions: { assets: "assets-fixture-r1" },
        }),
      });
      return;
    }

    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok" }),
    });
  });
}
