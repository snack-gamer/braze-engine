import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "playwright/test";
import { createSceneTemplate } from "../../src/scene/application/scene-templates";
import { makeObject } from "../../src/lib/payload";
import { serializeSceneObject } from "../../src/scene/serialization/scene-object-encoder";

test("Mesh Filter picker clears and replaces geometry with keyboard, undo and saved identity", async ({ page, request }, info) => {
  const id = `mesh-filter-${crypto.randomUUID()}`, source = createSceneTemplate("Mesh Filter review");
  const object = makeObject("cube", 2, { id: "mesh-subject", name: "Mesh Subject", position: [1, 2, 3], scale: [1.5, 2, 1], color: "#ef8133",
    meshRenderer: { enabled: true, castShadows: false, receiveShadows: true } });
  const initial = serializeSceneObject(object);
  const scene = { ...source, objects: [...source.objects, initial], activeObjectId: object.id };
  expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } })).ok()).toBe(true);
  await page.goto(`/?scene=${id}`);
  const filter = page.locator(".mesh-filter-section"), field = filter.locator(".object-field");
  const pick = page.getByRole("button", { name: "Select Mesh", exact: true });
  await expect(pick).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Select Mesh" });
  for (const width of [1800, 1000]) {
    await page.setViewportSize({ width, height: 800 });
    const before = await page.locator(".mesh-renderer-section").boundingBox();
    await pick.click(); await expect(dialog).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search meshes" })).toBeFocused();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(width * 0.85); expect(bounds.width).toBeLessThanOrEqual(width - 16); expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect((await page.locator(".mesh-renderer-section").boundingBox())!.y).toBe(before!.y);
    await page.screenshot({ path: info.outputPath(`mesh-picker-${width}.png`) });
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(pick).toBeFocused();
  }
  await pick.click();
  await page.getByRole("searchbox", { name: "Search meshes" }).fill("sphere");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(field).toContainText(/sphere/i); await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Undo/ }).click(); await expect(field).toContainText(/cube/i);
  await page.getByRole("button", { name: /^Redo/ }).click(); await expect(field).toContainText(/sphere/i);
  await field.focus(); await page.keyboard.press("Delete"); await expect(field).toContainText("None (Mesh)");
  await pick.click(); await dialog.getByRole("option", { name: "Plane Built-in", exact: true }).dblclick();
  await page.getByRole("button", { name: /^Save scene \(/ }).click();
  await expect(page.getByRole("button", { name: /^Save scene \(/ })).toHaveAttribute("title", /saved/);
  const saved = (await (await request.get(`/api/scenes/${id}`)).json()).scene.objects.find((entry: { id: string }) => entry.id === object.id);
  expect(saved.source_type).toBe("plane"); expect(saved.mesh_filter).toEqual({ enabled: true });
  expect(saved.transform).toEqual(initial.transform); expect(saved.mesh_renderer).toEqual(initial.mesh_renderer); expect(saved.color).toBe(initial.color);
  await page.reload(); await expect(field).toContainText(/plane/i);
  await page.getByRole("button", { name: "Mesh Filter options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset", exact: true }).click(); await expect(field).toContainText("None (Mesh)");
});


test("imported mesh reveal and Project drag keep exact mesh identity", async ({ page, request }) => {
  const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT!;
  const folder = `Mesh-${crypto.randomUUID()}`, filename = `${folder}/Triangle.gltf`;
  const buffer = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  await mkdir(path.join(projectRoot, "assets", folder), { recursive: true });
  await writeFile(path.join(projectRoot, "assets", filename), JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ name: "Triangle", primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36, uri: `data:application/octet-stream;base64,${buffer.toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  }));
  const id = `mesh-drag-${crypto.randomUUID()}`, source = createSceneTemplate("Mesh drag review");
  const subject = makeObject("sphere", 2, { id: "mesh-drag-subject", name: "Mesh drag subject" });
  await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene: { ...source, objects: [...source.objects, serializeSceneObject(subject)], activeObjectId: subject.id } } });
  await page.addInitScript((filename) => localStorage.setItem("tgan.assetFavorites", JSON.stringify([`model:${filename}`])), filename);
  await page.goto(`/?scene=${id}`);
  const field = page.locator(".mesh-filter-section .object-field");
  await page.getByRole("button", { name: "Select Mesh", exact: true }).click();
  await page.getByRole("dialog", { name: "Select Mesh", exact: true }).getByRole("button", { name: "Favorites", exact: true }).click();
  await page.getByRole("option", { name: `Triangle ${filename}`, exact: true }).dblclick();
  await field.getByRole("button", { name: "Reveal Triangle in Project", exact: true }).click();
  const tile = page.locator('.model-subasset-tile[data-subasset-kind="mesh"]').filter({ hasText: "Triangle" });
  await expect(tile).toBeVisible(); await expect(tile).toHaveClass(/selected/);
  const guid = await tile.getAttribute("data-asset-guid"), localId = await tile.getAttribute("data-local-id");
  await page.getByRole("treeitem", { name: /Mesh drag subject/ }).click();
  await page.getByRole("button", { name: "Select Mesh", exact: true }).click();
  await page.getByRole("option", { name: "Sphere Built-in", exact: true }).dblclick();
  await expect(field).toContainText(/sphere/i);
  await tile.dragTo(field);
  await expect(field).toContainText("Triangle");
  await page.getByRole("button", { name: /^Save scene \(/ }).click();
  await expect(page.getByRole("button", { name: /^Save scene \(/ })).toHaveAttribute("title", /saved/);
  const saved = (await (await request.get(`/api/scenes/${id}`)).json()).scene.objects.find((entry: { id: string }) => entry.id === subject.id);
  expect(saved.asset.ref).toEqual({ guid, local_id: localId });
  await page.reload(); await expect(field).toContainText("Triangle");
});
