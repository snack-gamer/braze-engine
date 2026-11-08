import { expect, test } from "playwright/test";
import { createSceneTemplate } from "../../src/scene/application/scene-templates";
import { makeObject } from "../../src/lib/payload";
import { serializeSceneObject } from "../../src/scene/serialization/scene-object-encoder";

test("bundled particle stylesheet is ready when the embedded Inspector mounts", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const id = `particle-theme-${crypto.randomUUID()}`;
  const source = createSceneTemplate("Particle theme verification");
  const particle = serializeSceneObject(makeObject("particle", 0, { id: "particle" }));
  expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null,
    scene: { ...source, activeObjectId: particle.id, objects: [...source.objects, particle] },
  } })).ok()).toBe(true);
  await page.goto(`/?scene=${id}`);
  const inspector = page.locator(".particle-inspector-host .pi-root");
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveCSS("display", "flex");
  await expect(inspector).toHaveCSS("position", "static");
  await expect(inspector).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".particle-inspector-host .ef-header")).toHaveCSS("display", "flex");
  await page.reload();
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveCSS("position", "static");
  expect(errors).toEqual([]);
});
