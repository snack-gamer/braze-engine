import { expect, test, type Locator, type Page } from "playwright/test";
import { createSceneTemplate } from "../../src/scene/application/scene-templates";
import { makeObject } from "../../src/lib/payload";
import { serializeSceneObject } from "../../src/scene/serialization/scene-object-encoder";

async function coloredPixels(page: Page, viewport: Locator) {
  const png = (await viewport.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0, blue = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 45 && pixels[index] > pixels[index + 2] * 2 && pixels[index] > pixels[index + 1] * 2) red++;
      if (pixels[index + 2] > 45 && pixels[index + 2] > pixels[index] * 2 && pixels[index + 2] > pixels[index + 1] * 2) blue++;
    }
    return { red, blue };
  }, png);
}

test("camera projection, layer mask and background render correctly through undo, reload and Play", async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const id = `camera-${crypto.randomUUID()}`, source = createSceneTemplate("Camera verification");
  const camera = source.objects.find((object) => object.source_type === "camera")!;
  const scene = { ...source, activeObjectId: camera.id, activeCameraId: camera.id,
    environment: { ...source.environment, world_source: "hdri", hdri_url: null },
    objects: source.objects.map((object) => object === camera ? { ...object,
      transform: { position: [0, 0, 10], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
      camera: { target: [0, 0, 0], fov_degrees: 52, near: .1, far: 200, projection: "orthographic", orthographic_size: 4,
        culling_mask: 0xffffffff, background: "solid", background_color: "#202020" },
    } : object).concat([
      serializeSceneObject(makeObject("cube", 0, { id: "near-red", color: "#ff0000", position: [-1.5, 0, 0], layer: 0 })),
      serializeSceneObject(makeObject("cube", 1, { id: "far-blue", color: "#0000ff", position: [1.5, 0, -5], layer: 31 })),
    ]),
  };
  expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } })).ok()).toBe(true);
  await page.goto(`/?scene=${id}`);
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await page.getByRole("button", { name: "Toggle Game view statistics", exact: true }).click();
  const viewport = page.getByLabel("Game render viewport", { exact: true });
  await expect(page.getByLabel("Camera projection", { exact: true })).toHaveValue("orthographic");
  await expect.poll(async () => (await coloredPixels(page, viewport)).red).toBeGreaterThan(300);
  const orthographic = await coloredPixels(page, viewport);
  expect(orthographic.red / orthographic.blue).toBeGreaterThan(.85);
  expect(orthographic.red / orthographic.blue).toBeLessThan(1.15);
  await page.getByLabel("Camera projection", { exact: true }).selectOption("perspective");
  await expect.poll(async () => { const value = await coloredPixels(page, viewport); return value.red / value.blue; }).toBeGreaterThan(1.8);
  await page.getByLabel("Camera projection", { exact: true }).selectOption("orthographic");
  await page.getByLabel("Camera culling mask", { exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Nothing", exact: true }).click();
  await expect.poll(async () => { const value = await coloredPixels(page, viewport); return value.red + value.blue; }).toBe(0);
  await page.getByRole("menuitemcheckbox", { name: "Render layer 31: Unnamed", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page, viewport)).blue).toBeGreaterThan(300);
  expect((await coloredPixels(page, viewport)).red).toBe(0);
  await page.getByLabel("Render layer 31: Unnamed", { exact: true }).press("Escape");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await coloredPixels(page, viewport)).blue).toBe(0);
  await page.getByRole("button", { name: /^Redo/ }).click();
  await expect.poll(async () => (await coloredPixels(page, viewport)).blue).toBeGreaterThan(300);
  await page.getByRole("button", { name: /^Save scene \(/ }).click();
  await page.reload();
  await expect(page.getByLabel("Camera projection", { exact: true })).toHaveValue("orthographic");
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await page.getByRole("button", { name: "Toggle Game view statistics", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page, viewport)).blue).toBeGreaterThan(300);
  expect((await coloredPixels(page, viewport)).red).toBe(0);
  await page.getByRole("button", { name: "Enter Play Mode", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page, viewport)).blue).toBeGreaterThan(300);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Step one frame", exact: true }).click();
  await page.getByRole("button", { name: "Exit Play Mode", exact: true }).click();
  await viewport.screenshot({ path: info.outputPath("camera-orthographic-layer31.png") });
  await page.screenshot({ path: info.outputPath("camera-inspector.png") });
  expect(errors).toEqual([]);
});

test("camera glyph selection and Look through never block Scene or Game", async ({ page, request }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const id = `glyph-${crypto.randomUUID()}`, source = createSceneTemplate("Camera glyph verification");
  const authored = source.objects.find((object) => object.source_type === "camera")!;
  const scene = { ...source, camera: { ...source.camera, position: [0, 0, 10], target: [0, 0, 5] },
    activeObjectId: "red-target", activeCameraId: authored.id,
    environment: { ...source.environment, world_source: "hdri", hdri_url: null },
    objects: source.objects.map((object) => object === authored ? { ...object,
      transform: { position: [0, 0, 5], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
      camera: { target: [0, 0, 0], fov_degrees: 52, near: .1, far: 200 },
    } : object).concat([
      serializeSceneObject(makeObject("cube", 0, { id: "red-target", name: "Red Target", color: "#ff0000", position: [-1.5, 0, 0] })),
      // A glyph remains selectable even when it draws over closer geometry.
      serializeSceneObject(makeObject("cube", 1, { id: "occluder", name: "Occluder", position: [0, 0, 7], scale: [.4, .4, .4] })),
    ]),
  };
  expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } })).ok()).toBe(true);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto(`/?scene=${id}`);
  const viewport = page.getByLabel("3D scene viewport", { exact: true });
  const selectGlyph = async () => {
    const canvas = viewport.locator("canvas").first(), bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(page.getByLabel("Object name", { exact: true })).toHaveValue("Main Camera");
  };
  await expect.poll(async () => (await coloredPixels(page, viewport)).red).toBeGreaterThan(300);
  await selectGlyph();
  await viewport.screenshot({ path: info.outputPath("camera-glyph.png") });
  await page.getByRole("button", { name: "Look through", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page, viewport)).red).toBeGreaterThan(1000);
  await page.getByRole("button", { name: /^Save scene \(/ }).click();
  await page.reload();
  await expect.poll(async () => (await coloredPixels(page, viewport)).red).toBeGreaterThan(1000);
  await viewport.screenshot({ path: info.outputPath("camera-look-through.png") });
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const response = await (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" },
    data: { version: 1, requestId: crypto.randomUUID(), operation: "editor.camera", sessionId,
      position: [0, 0, 10], target: [0, 0, 5] },
  })).json();
  expect(response.status, JSON.stringify(response)).toBe("ok");
  await page.getByRole("treeitem", { name: /^Red Target/ }).click();
  await selectGlyph();
  const guides = async (visible: boolean) => {
    await page.getByRole("button", { name: "Gizmos", exact: true }).click();
    await page.getByRole("checkbox", { name: "Camera guides", exact: true }).setChecked(visible);
    await page.getByRole("button", { name: "Gizmos", exact: true }).click();
  };
  await guides(false);
  await page.getByRole("treeitem", { name: /^Red Target/ }).click();
  const canvas = viewport.locator("canvas").first(), bounds = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(page.getByLabel("Object name", { exact: true })).toHaveValue("Occluder");
  await guides(true);
  await page.getByRole("treeitem", { name: /^Red Target/ }).click();
  await selectGlyph();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await expect.poll(async () => (await coloredPixels(page, page.getByLabel("Game render viewport", { exact: true }))).red).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
