import { expect, test, type Locator } from "playwright/test";
import { DEFAULT_DOCK_DOCUMENT, dockPane } from "../../src/docking/layout";
import { physicsPoseLifetimeScene } from "./fixtures/physics-pose-lifetime-scene";

type GpuCapture = { devices: GPUDevice[]; errors: string[] };
type CaptureWindow = Window & { __brazePoseGpuCapture: GpuCapture };

test.use({ viewport: { width: 1900, height: 1100 } });

test("compound authored shadow casters retire GPU pose bindings across Play and Stop in both views", async ({ page, request }, testInfo) => {
  const messages: { phase: string; type: string; text: string }[] = [], pageErrors: string[] = [];
  let phase = "startup";
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) messages.push({ phase, type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((layout) => {
    localStorage.setItem("braze.editor.dock-layout.v3", JSON.stringify(layout));
    const capture: GpuCapture = { devices: [], errors: [] };
    Object.defineProperty(window, "__brazePoseGpuCapture", { value: capture });
    const original = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...args) {
      const device = await Reflect.apply(original, this, args) as GPUDevice;
      capture.devices.push(device);
      device.addEventListener("uncapturederror", (event) => capture.errors.push(event.error.message));
      return device;
    };
  }, dockPane(DEFAULT_DOCK_DOCUMENT, "game", "scene", "right"));
  const sceneId = `pose-lifetime-${crypto.randomUUID()}`;
  const scene = physicsPoseLifetimeScene();
  expect(scene.objects.filter((object) => object.parent_id === "compound")).toHaveLength(2);
  expect(scene.objects.find((object) => object.id === "sun")?.directional_light?.cast_shadows).toBe(true);
  const saved = await request.put(`/api/scenes/${sceneId}`, { data: { baseRevision: null, scene } });
  expect(saved.ok()).toBe(true);
  await page.goto(`/?scene=${sceneId}`);
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => {
    const response = await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" },
      data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values } });
    const reply = await response.json(); expect(reply.status, JSON.stringify(reply)).toBe("ok"); return reply.result;
  };
  await expect.poll(async () => (await live("editor.status")).loaded).toBe(true);
  const views = [page.getByLabel("3D scene viewport", { exact: true }), page.getByLabel("Game render viewport", { exact: true })];
  for (const view of views) { await expect(view).toBeVisible(); await expect.poll(() => coloredSurfaces(view)).toEqual([true, true]); }
  const authored = (await live("editor.inspect")).items;
  const flushGpu = () => page.evaluate(async () => {
    const capture = (window as unknown as CaptureWindow).__brazePoseGpuCapture;
    await Promise.all(capture.devices.map((device) => device.queue.onSubmittedWorkDone()));
    return { deviceCount: capture.devices.length, errors: capture.errors };
  });
  const redraw = async (cycle: number) => {
    const before = await Promise.all(views.map((view) => view.getAttribute("data-render-count")));
    await live("editor.camera", { position: [cycle * 0.03, 3.5, 7], target: [0, 1, 0] });
    await page.setViewportSize({ width: 1900 + cycle % 2 * 16, height: 1100 });
    for (let index = 0; index < views.length; index++) {
      await expect.poll(async () => Number(await views[index].getAttribute("data-render-count"))).toBeGreaterThan(Number(before[index]));
    }
    await flushGpu();
  };
  try {
    for (let cycle = 0; cycle < 4; cycle++) {
      phase = `play-${cycle}`; await live("editor.transport", { action: "play" });
      await expect.poll(async () => (await live("editor.status")).physics.status).toBe("running");
      await expect.poll(async () => (await live("editor.status")).physics.appliedStepId).toBeGreaterThan(3);
      const physics = (await live("editor.status")).physics;
      expect(physics.bodyCount).toBe(2); expect(physics.instancedBodies).toBe(0);
      if (cycle === 0) {
        // A fresh view's first shadow pass must bind live poses, not an earlier edit shader.
        const oldCanvases = await page.locator(".three-host canvas.three-render-layer").elementHandles();
        await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
        await expect(page.locator(".three-host")).toHaveCount(0);
        for (const canvas of oldCanvases) expect(await canvas.evaluate((element) => element.isConnected)).toBe(false);
        await page.getByRole("tab", { name: "Hierarchy", exact: true }).dblclick();
        await expect(page.locator(".three-host")).toHaveCount(2);
        await expect.poll(async () => (await live("editor.status")).physics.appliedStepId).toBeGreaterThan(physics.appliedStepId);
        expect((await live("editor.status")).mode).toBe("playing");
      }
      for (const view of views) await expect.poll(() => coloredSurfaces(view)).toEqual([true, true]);
      await flushGpu();
      phase = `stop-${cycle}`; await live("editor.transport", { action: "stop" });
      // Successive real redraw receipts cross the asynchronous solver-retirement fence.
      for (let draw = 0; draw < 3; draw++) await redraw(cycle * 3 + draw + 1);
      for (const view of views) await expect.poll(() => coloredSurfaces(view)).toEqual([true, true]);
      expect((await live("editor.inspect")).items).toEqual(authored);
    }
  } finally {
    phase = "cleanup"; await live("editor.transport", { action: "stop" });
    const capture = await flushGpu();
    await testInfo.attach("physics-pose-gpu-lifetime", { contentType: "application/json",
      body: JSON.stringify({ messages, pageErrors, capture }, null, 2) });
    for (const [index, view] of views.entries()) await view.screenshot({ path: testInfo.outputPath(`pose-lifetime-${index}.png`) });
  }
  const capture = await flushGpu();
  expect(capture.deviceCount).toBeGreaterThan(0);
  expect(capture.errors.length, capture.errors.slice(0, 3).join("\n")).toBe(0);
  const validationMessages = messages.filter((message) => /GPUValidationError|destroyed|queue\.Submit|Invalid CommandBuffer|uncaptured/i.test(message.text));
  expect(validationMessages.length, JSON.stringify(validationMessages.slice(0, 3))).toBe(0);
  expect(pageErrors).toEqual([]);
});

async function coloredSurfaces(view: Locator): Promise<boolean[]> {
  const png = (await view.screenshot({ scale: "css", style: ".viewport-hud, .game-view__mode-badge { visibility: hidden !important; }" })).toString("base64");
  return view.page().evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let magenta = 0, orange = 0;
    for (let y = 4; y < canvas.height - 4; y++) for (let x = 4; x < canvas.width - 4; x++) {
      const offset = (y * canvas.width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      // Magenta distinguishes the left surface from the authored blue sky.
      if (r > g * 1.6 && b > g * 1.4 && Math.max(r, b) > 30) magenta++;
      if (r > 0 && r > g * 1.15 && g > b * 1.6) orange++;
    }
    return [magenta > 50, orange > 50];
  }, png);
}
