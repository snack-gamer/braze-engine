import { expect, test } from "playwright/test";

test("Scene grid stays neutral and its manual controls survive reload", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const capabilities = await (await request.get("/api/automation/v1/capabilities")).json();
  expect(capabilities.operations).toContain("editor.camera");
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/");
  let sessionId: string | null = null;
  await expect.poll(async () => sessionId = await page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const live = async (operation: string, values = {}) => {
    const response = await (await request.post("/api/automation/v1/commands", {
      headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
    })).json();
    expect(response.status, JSON.stringify(response)).toBe("ok");
    return response.result;
  };
  await expect.poll(async () => (await live("editor.status")).loaded).toBe(true);
  await live("editor.scene.create", { name: "Grid review", template: "empty" });
  await expect.poll(async () => (await live("editor.status")).loaded).toBe(true);
  const viewport = page.getByLabel("3D scene viewport", { exact: true });
  await live("editor.camera", { position: [12, 8, 14], target: [0, 0, 0] });
  const toggleMenu = () => page.getByRole("button", { name: "Gizmos", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Gizmo and grid settings", exact: true });
  await toggleMenu();
  await menu.getByRole("checkbox", { name: "Show scene handles", exact: true }).uncheck();
  await menu.getByRole("checkbox", { name: "Show grid", exact: true }).check();
  await menu.getByLabel("Grid color", { exact: true }).fill("#59616d");
  await menu.getByLabel("Grid opacity", { exact: true }).fill("0.56");
  await menu.getByLabel("Grid horizon", { exact: true }).fill("100");
  await toggleMenu();
  const countGrid = async () => {
    const png = (await viewport.screenshot()).toString("base64");
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let grid = 0, coloredAxes = 0;
      // Ignore the orientation widget, toolbar and viewport border.
      for (let y = 180; y < canvas.height - 2; y++) for (let x = 2; x < canvas.width - 2; x++) {
        const i = (y * canvas.width + x) * 4;
        const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        if (r > 12 && b >= r && b - r < 45 && g >= r) grid++;
        if ((r > 65 && r > g * 1.5 && r > b * 1.5) || (b > 65 && b > r * 1.5 && b > g * 1.2)) coloredAxes++;
      }
      return { grid, coloredAxes };
    }, png);
  };
  await expect.poll(async () => (await countGrid()).grid).toBeGreaterThan(1000);
  expect((await countGrid()).coloredAxes).toBe(0);
  await viewport.screenshot({ path: testInfo.outputPath("grid-near.png") });
  await live("editor.camera", { position: [24, 12, 28], target: [0, 0, 0] });
  await viewport.screenshot({ path: testInfo.outputPath("grid-far.png") });
  await toggleMenu();
  await menu.getByRole("checkbox", { name: "Show grid", exact: true }).uncheck();
  await expect(menu.getByLabel("Grid opacity", { exact: true })).toBeDisabled();
  await toggleMenu();
  await expect.poll(async () => (await countGrid()).grid).toBeLessThan(100);
  await toggleMenu();
  await menu.getByRole("checkbox", { name: "Show grid", exact: true }).check();
  await menu.getByLabel("Grid horizon", { exact: true }).fill("40");
  await menu.getByLabel("Grid opacity", { exact: true }).fill("0.3");
  await toggleMenu();
  await live("editor.save");
  await page.reload();
  await expect.poll(async () => sessionId = await page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  await expect.poll(async () => (await live("editor.status")).loaded).toBe(true);
  await toggleMenu();
  await expect(menu.getByRole("checkbox", { name: "Show grid", exact: true })).toBeChecked();
  await expect(menu.getByLabel("Grid horizon", { exact: true })).toHaveValue("40");
  await expect(menu.getByLabel("Grid opacity", { exact: true })).toHaveValue("0.3");
  await toggleMenu();
  await expect.poll(async () => (await countGrid()).grid).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});
