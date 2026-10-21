import { expect, test as base } from "playwright/test";

// Each case owns its source document; other browser specs keep their default scene.
const test = base.extend<{ sourceId: string }>({
  sourceId: async ({ request }, use) => {
    const id = `source-${crypto.randomUUID()}`;
    const scene = { version: "braze-engine/scene-v1", name: "Test Source", objects: [{ id: "camera", source_type: "camera" }] };
    expect((await request.put(`/api/scenes/${id}`, { data: { baseRevision: null, scene } })).ok()).toBe(true);
    await use(id);
  },
});

test("scene documents isolate objects, physics, history and names across switches and reload", async ({ page, request, sourceId }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/Destroyed texture|GPUValidationError|used in a submit|Invalid CommandBuffer/.test(message.text())) errors.push(message.text());
  });
  const before = await (await request.get(`/api/scenes/${sourceId}`)).json();
  const initial = { version: "braze-engine/scene-v1", name: "First World", lightingAuthoringVersion: 1,
    camera: { position: [19, 8, 12], target: [0, 1, 0], fov_degrees: 43 },
    physics: { gravity: [0, -3, 0], fixed_timestep: 1 / 60, max_substeps: 8 }, extension: { keep: true },
    objects: [{ id: "main-camera", source_type: "camera", name: "First camera" }] };
  expect((await request.put(`/api/scenes/${sourceId}`, { data: { baseRevision: before.revision, scene: initial } })).ok()).toBe(true);
  await page.goto(`/?scene=${sourceId}`);
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  let sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
  const ready = async (id: string) => { await expect.poll(async () => { const status = (await live("editor.status")).result; return status?.loaded ? status.sceneId : null; }).toBe(id); };
  await ready(sourceId); await expect(page.getByRole("button", { name: "Scene First World", exact: true })).toBeVisible();
  const shell = await page.locator(".app-shell").elementHandle();
  const search = page.getByRole("textbox", { name: "Search assets" });
  await search.fill("workspace survives");
  const searchElement = await search.elementHandle();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const firstStatus = (await live("editor.status")).result;
  const revision = firstStatus.revision;
  expect(firstStatus.sceneInstances).toEqual([{ sceneId: sourceId, instanceId: firstStatus.sceneInstanceId, phase: "ready" }]);
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  expect((await live("editor.edit", { baseRevision: revision, apply: true, commands: [
    { op: "object.create", id: "first-only", primitive: "cube", values: { name: "First world box", position: [0, 4, 0] } },
    { op: "component.set", id: "first-only", component: "collider", values: {} },
    { op: "component.set", id: "first-only", component: "rigidbody", values: {} },
  ] })).status).toBe("ok");
  const sourceRevision = (await live("editor.status")).result.revision;
  await page.getByRole("button", { name: "Create or import into Assets", exact: true }).click();
  await page.getByRole("dialog", { name: "Create", exact: true }).getByRole("button", { name: "Scene", exact: true }).click();
  await page.getByLabel("Scene name", { exact: true }).fill("Second World");
  await page.getByRole("button", { name: "Create Scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Scene Second World", exact: true })).toBeVisible();
  const secondId = (await live("editor.status")).result.sceneId; expect(secondId).not.toBe(sourceId);
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  await ready(secondId);
  expect(await page.locator("html").getAttribute("data-braze-editor-session")).toBe(sessionId);
  expect(await shell!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await searchElement!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(search).toHaveValue("workspace survives");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  let second = (await live("editor.inspect")).result;
  expect(second.items.map((o: { id: string }) => o.id)).toEqual(["main-camera", "sun"]);
  expect(second.revision).toBeGreaterThan(sourceRevision);
  const secondStatus = (await live("editor.status")).result;
  expect(secondStatus.activeObjectId).toBe("main-camera");
  expect(secondStatus.sceneInstanceId).toBeGreaterThan(firstStatus.sceneInstanceId);
  expect(secondStatus.worldSource).toBe("sky");
  expect(secondStatus.sceneInstances).toEqual([{ sceneId: secondId, instanceId: secondStatus.sceneInstanceId, phase: "ready" }]);
  expect(secondStatus.camera.position).not.toEqual([19, 8, 12]);
  await live("editor.save");
  expect((await live("editor.edit", { baseRevision: sourceRevision, commands: [{ op: "object.update", id: "main-camera", values: { name: "Stale" } }], apply: true })).status).toBe("error");
  await live("editor.undo"); expect((await live("editor.status")).result.objectCount).toBe(2);
  const savedFirst = (await (await request.get(`/api/scenes/${sourceId}`)).json()).scene;
  expect(savedFirst.objects.some((o: { id: string }) => o.id === "first-only")).toBe(true);
  expect(savedFirst.physics.gravity).toEqual([0, -3, 0]); expect(savedFirst.extension).toEqual({ keep: true });
  const savedSecond = (await (await request.get(`/api/scenes/${secondId}`)).json()).scene;
  expect(savedSecond.physics.gravity).toEqual([0, -10, 0]);
  expect(savedSecond.environment.worldSource).toBe("sky");
  expect(savedFirst.environment.worldSource).toBe("hdri");
  expect((await live("editor.scene.rename", { name: "Moon Base" })).status).toBe("ok");
  await expect(page.getByRole("button", { name: "Scene Moon Base", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  await live("editor.transport", { action: "play" });
  expect((await live("editor.scene.open", { sceneId: sourceId })).status).toBe("error");
  await live("editor.transport", { action: "stop" });
  expect((await live("editor.scene.open", { sceneId: sourceId })).status).toBe("ok"); await ready(sourceId);
  expect((await live("editor.inspect")).result.items.some((o: { id: string }) => o.id === "first-only")).toBe(true);
  expect((await live("editor.status")).result.camera.position).toEqual([19, 8, 12]);
  expect((await live("editor.status", { sceneInstanceId: firstStatus.sceneInstanceId })).status).toBe("error");
  await live("editor.transport", { action: "play" });
  await expect.poll(async () => (await live("editor.status")).result.physics?.bodyCount).toBe(1);
  await live("editor.transport", { action: "stop" });
  expect((await live("editor.scene.open", { sceneId: secondId })).status).toBe("ok"); await ready(secondId);
  await page.reload(); await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  sessionId = await page.locator("html").getAttribute("data-braze-editor-session"); await ready(secondId);
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  expect((await live("editor.status")).result.worldSource).toBe("sky");
  second = (await live("editor.inspect")).result; expect(second.sceneName).toBe("Moon Base"); expect(second.items).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("empty scenes, save copies and failed opens preserve the current editor", async ({ page, request, sourceId }) => {
  await page.goto(`/?scene=${sourceId}`);
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const created = await live("editor.scene.create", { name: "Empty World", template: "empty" }); expect(created.status).toBe("ok");
  const id = created.result.sceneId;
  await expect.poll(async () => (await live("editor.status")).result?.objectCount).toBe(0);
  expect((await live("editor.scene.open", { sceneId: "does-not-exist" })).status).toBe("error");
  expect((await live("editor.status")).result.sceneId).toBe(id);
  const copied = await live("editor.scene.copy", { name: "Empty Copy" }); expect(copied.status).toBe("ok");
  await expect.poll(async () => (await live("editor.status")).result?.sceneId).toBe(copied.result.sceneId);
  const empty = (await (await request.get(`/api/scenes/${id}`)).json()).scene;
  expect(empty.name).toBe("Empty World"); expect(empty.environment.worldSource).toBe("hdri");
  expect((await (await request.get(`/api/scenes/${copied.result.sceneId}`)).json()).scene.objects).toEqual([]);
});

test("a conflicting source save prevents a scene switch and preserves both files", async ({ page, request, sourceId }) => {
  const before = await (await request.get(`/api/scenes/${sourceId}`)).json();
  const scene = { version: "braze-engine/scene-v1", name: "Conflict Source", objects: [] };
  await request.put(`/api/scenes/${sourceId}`, { data: { baseRevision: before.revision, scene } });
  const targetId = `target-${crypto.randomUUID()}`;
  await request.put(`/api/scenes/${targetId}`, { data: { baseRevision: null, scene: { ...scene, name: "Untouched Target" } } });
  await page.goto(`/?scene=${sourceId}`); await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const loaded = await (await request.get(`/api/scenes/${sourceId}`)).json();
  await request.put(`/api/scenes/${sourceId}`, { data: { baseRevision: loaded.revision, scene: { ...scene, name: "External Edit" } } });
  const opened = await live("editor.scene.open", { sceneId: targetId }); expect(opened.status).toBe("error");
  expect(opened.message).toContain("could not be saved"); expect((await live("editor.status")).result.sceneId).toBe(sourceId);
  expect((await (await request.get(`/api/scenes/${sourceId}`)).json()).scene.name).toBe("External Edit");
  expect((await (await request.get(`/api/scenes/${targetId}`)).json()).scene.name).toBe("Untouched Target");
});

test("lit surfaces survive scene copies and Play/Stop without shader cache contamination", async ({ page, request, sourceId }) => {
  await page.goto(`/?scene=${sourceId}`);
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const status = (await live("editor.status")).result;
  expect((await live("editor.edit", { baseRevision: status.revision, apply: true, commands: [
    { op: "object.create", id: "sun", primitive: "directionalLight" },
    { op: "object.create", id: "floor", primitive: "cube", values: { position: [0, -1, 0], scale: [6, .2, 6], color: "#485767" } },
    { op: "component.set", id: "floor", component: "collider", values: {} },
    { op: "object.create", id: "gold", primitive: "cube", values: { color: "#e8b665", position: [0, 2, 0] } },
    { op: "component.set", id: "gold", component: "rigidbody", values: {} },
    { op: "component.set", id: "gold", component: "collider", values: {} },
  ] })).status).toBe("ok");
  const viewport = page.getByLabel("3D scene viewport", { exact: true });
  const coloredPixels = async () => {
    const png = (await viewport.screenshot()).toString("base64");
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 60 && pixels[i] > pixels[i + 1] * 1.2 && pixels[i + 1] > pixels[i + 2] * 1.2) colored++;
      return colored;
    }, png);
  };
  await expect.poll(coloredPixels).toBeGreaterThan(500);
  const copy = await live("editor.scene.copy", { name: "Lit Copy" }); expect(copy.status).toBe("ok");
  await expect.poll(async () => (await live("editor.status")).result?.sceneId).toBe(copy.result.sceneId);
  await expect.poll(coloredPixels).toBeGreaterThan(500);
  await live("editor.transport", { action: "play" });
  await expect.poll(async () => (await live("editor.status")).result?.physics?.status).toBe("running");
  await expect.poll(async () => (await live("editor.status")).result?.physics?.completedStepId).toBeGreaterThan(10);
  const beforeStop = Number(await viewport.getAttribute("data-render-count"));
  await live("editor.transport", { action: "stop" });
  await expect.poll(async () => Number(await viewport.getAttribute("data-render-count"))).toBeGreaterThan(beforeStop);
  await expect(viewport).toHaveAttribute("data-render-loop", "idle");
  await expect.poll(coloredPixels).toBeGreaterThan(500);
});

test("Project scene tiles replace the strip and support opening, rename and save copy", async ({ page, request, sourceId }) => {
  await page.goto(`/?scene=${sourceId}`);
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), sessionId, operation, ...values },
  })).json();
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  await expect(page.locator(".project-scenes, .project-scene-browser")).toHaveCount(0);
  await page.getByRole("button", { name: "All Scenes", exact: true }).click();
  const source = page.locator(`[data-asset-key="scene:${sourceId}"]`);
  await expect(source).toBeVisible();
  await page.getByRole("button", { name: "Create or import into Assets", exact: true }).click();
  await page.getByRole("dialog", { name: "Create", exact: true }).getByRole("button", { name: "Scene", exact: true }).click();
  await page.getByLabel("Scene name", { exact: true }).fill("Project World");
  await page.getByRole("button", { name: "Create Scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Scene Project World", exact: true })).toBeVisible();
  const createdId = (await live("editor.status")).result.sceneId;
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  const world = page.getByRole("option", { name: "Project World", exact: true });
  await expect(world).toBeVisible();
  // Scene deletion has its own recoverable confirmation; Cancel preserves the file.
  await source.click(); await page.keyboard.press("Delete");
  await expect(page.getByRole("dialog", { name: "Delete Scene" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await live("editor.status")).result.sceneId).toBe(createdId);
  const shell = await page.locator(".app-shell").elementHandle();
  await source.dblclick();
  await expect.poll(async () => (await live("editor.status")).result?.sceneId).toBe(sourceId);
  expect(await shell!.evaluate((element) => element.isConnected)).toBe(true);
  await world.dblclick();
  await expect.poll(async () => (await live("editor.status")).result?.sceneId).toBe(createdId);
  await world.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Scene name", { exact: true }).fill("Renamed World");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".scene-workspace__busy")).toHaveCount(0);
  const renamed = page.getByRole("option", { name: "Renamed World", exact: true });
  await expect(renamed).toBeVisible();
  await page.getByRole("textbox", { name: "Search assets" }).fill("Renamed");
  await expect(source).toHaveCount(0); await expect(renamed).toBeVisible();
  await renamed.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Save Copy…", exact: true }).click();
  await page.getByLabel("Scene name", { exact: true }).fill("Renamed Copy");
  await page.getByRole("button", { name: "Save Copy", exact: true }).click();
  await expect(page.getByRole("option", { name: "Renamed Copy", exact: true })).toBeVisible();
  expect((await live("editor.status")).result.sceneId).not.toBe(createdId);
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  expect((await (await request.get(`/api/scenes/${createdId}`)).json()).scene.name).toBe("Renamed World");
});

test("an initial failed load preserves its file and recovers in the same editor", async ({ page, request, sourceId }) => {
  const failedId = `missing-${crypto.randomUUID()}`;
  const writes: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === `/api/scenes/${failedId}` && req.method() !== "GET") writes.push(req.method());
  });
  await page.goto(`/?scene=${failedId}`);
  await expect(page.getByRole("alert")).toContainText("does not exist");
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  const sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const shell = await page.locator(".app-shell").elementHandle();
  await page.getByRole("button", { name: "All Scenes", exact: true }).click();
  await page.locator(`[data-asset-key="scene:${sourceId}"]`).dblclick();
  await expect(page.getByRole("button", { name: "Scene Test Source", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Save scene.*saved/i })).toBeEnabled();
  expect(await shell!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await page.locator("html").getAttribute("data-braze-editor-session")).toBe(sessionId);
  expect(writes).toEqual([]);
  expect((await (await request.get(`/api/scenes/${failedId}`)).json()).scene).toBeNull();
});

test("Basic sky renders after creation, copy and reload while tabs keep their own document", async ({ page, context, request, sourceId }) => {
  await page.goto(`/?scene=${sourceId}`);
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  let sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values },
  })).json();
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const otherTab = await context.newPage(); await otherTab.goto(`/?scene=${sourceId}`);
  await expect(otherTab.getByRole("button", { name: "Scene Test Source", exact: true })).toBeVisible();
  const created = await live("editor.scene.create", { name: "Sky World" }); expect(created.status).toBe("ok");
  const skyPixels = async () => {
    const image = (await page.getByLabel("3D scene viewport", { exact: true }).screenshot()).toString("base64");
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, Math.floor(canvas.height / 2)).data;
      let sky = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > 100 && pixels[i + 2] > pixels[i] * 1.2 && pixels[i + 1] > pixels[i] * 1.1) sky++;
      return sky;
    }, image);
  };
  await expect.poll(async () => (await live("editor.status")).result?.worldSource).toBe("sky");
  await expect.poll(skyPixels).toBeGreaterThan(10_000);
  const copied = await live("editor.scene.copy", { name: "Sky Copy" }); expect(copied.status).toBe("ok");
  await expect.poll(async () => (await live("editor.status")).result?.sceneId).toBe(copied.result.sceneId);
  await expect.poll(skyPixels).toBeGreaterThan(10_000);
  await page.reload();
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  expect((await live("editor.status")).result.sceneId).toBe(copied.result.sceneId);
  await expect.poll(skyPixels).toBeGreaterThan(10_000);
  expect(new URL(page.url()).searchParams.has("scene")).toBe(false);
  await otherTab.reload();
  await expect(otherTab.getByRole("button", { name: "Scene Test Source", exact: true })).toBeVisible();
  expect(new URL(otherTab.url()).searchParams.has("scene")).toBe(false);
});
