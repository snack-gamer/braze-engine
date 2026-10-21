import { expect, test } from "playwright/test";
import { createSceneTemplate } from "../../src/scene/application/scene-templates";

test("a newly opened sky uses its authored sun and preserves the visible disc after reopening", async ({ page, request }) => {
  const id = `sky-${crypto.randomUUID()}`, source = createSceneTemplate("Sky Sun");
  const environment = source.environment as { sky: Record<string, unknown> };
  const scene = { ...source, camera: { position: [0, 5, 10], target: [5, 11.634139, 4.433296], fov_degrees: 52 },
    environment: { ...environment, sky: { ...environment.sky, cloudsCoverage: 0 } } };
  await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } });
  await page.goto(`/?scene=${id}`);
  const viewport = page.getByLabel("3D scene viewport", { exact: true });
  const sunBrightness = async () => {
    const png = (await viewport.screenshot()).toString("base64");
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(Math.floor(canvas.width / 2) - 10, Math.floor(canvas.height / 2) - 10, 20, 20).data;
      let bright = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 225) bright++;
      return bright;
    }, png);
  };
  await expect.poll(sunBrightness).toBeGreaterThan(5);
  await viewport.screenshot({ path: "/tmp/braze-sky-sun-test.png" });
  await page.reload();
  await expect.poll(sunBrightness).toBeGreaterThan(5);
});

test("Basic sky has a continuous horizon and ground gradient instead of a flat lower hemisphere", async ({ page, request }) => {
  const id = `ground-${crypto.randomUUID()}`, source = createSceneTemplate("Daylight");
  const scene = { ...source, camera: { position: [0, 10, 20], target: [0, 0, 10], fov_degrees: 52 } };
  await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } });
  await page.goto(`/?scene=${id}`);
  const viewport = page.getByLabel("3D scene viewport", { exact: true });
  const verticalDifference = async () => {
    const png = (await viewport.screenshot()).toString("base64");
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const sample = (y: number) => {
        const d = ctx.getImageData(Math.floor(canvas.width * .65), Math.floor(canvas.height * y), 20, 10).data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        return sum / (d.length / 4 * 3);
      };
      return sample(.25) - sample(.85);
    }, png);
  };
  await expect.poll(verticalDifference).toBeGreaterThan(20);
  await viewport.screenshot({ path: "/tmp/braze-sky-ground-test.png" });
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const receipt = await (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: {
    version: 1, requestId: crypto.randomUUID(), sessionId, operation: "editor.camera", position: [0, 5, 10], target: [0, 6, 0],
  } })).json(); expect(receipt.status).toBe("ok");
  await expect.poll(async () => Number(await viewport.getAttribute("data-render-count"))).toBeGreaterThan(2);
  await viewport.screenshot({ path: "/tmp/braze-sky-daylight-test.png" });
});
