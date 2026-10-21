import { expect, test } from "playwright/test";

test("mesh baking, joints, trigger events and reload use live editor authoring", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const before = await (await request.get("/api/scenes/current")).json();
  expect((await request.put("/api/scenes/current", { data: { baseRevision: before.revision, scene: { version: "braze-engine/scene-v1", objects: [{ id: "camera", source_type: "camera", name: "Camera" }] } } })).ok()).toBe(true);
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  let sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = async (operation: string, values = {}) => (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), operation, sessionId, ...values } })).json();
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const edit = async (commands: object[]) => {
    const baseRevision = (await live("editor.status")).result.revision;
    const preview = await live("editor.edit", { baseRevision, commands }); expect(preview.result?.valid, JSON.stringify(preview)).toBe(true);
    expect((await live("editor.edit", { baseRevision, commands, apply: true })).status).toBe("ok");
  };
  await edit([
    { op: "object.create", id: "floor", primitive: "cube", values: { position: [0, -0.7, 0] } },
    { op: "object.create", id: "bob", primitive: "sphere", values: { position: [0, 1, 0] } },
    { op: "component.set", id: "bob", component: "rigidbody", values: {} },
    { op: "component.set", id: "bob", component: "collider", values: { radius: 0.25 } },
    { op: "component.set", id: "bob", component: "joint", values: { kind: "distance", anchor: [0, 0, 0], connectedAnchor: [0, 2, 0], restLength: 1 } },
    { op: "object.create", id: "sensor", primitive: "cube", values: { position: [0, 1, 0] } },
    { op: "component.set", id: "sensor", component: "collider", values: { isTrigger: true, size: [2, 2, 2] } },
  ]);
  await expect.poll(async () => (await live("editor.mesh", { objectId: "floor" })).status).toBe("ok");
  const baked = await live("editor.mesh", { objectId: "floor" }); expect(baked.result.geometry.indices).toHaveLength(36);
  await edit([{ op: "component.set", id: "floor", component: "collider", values: { shape: "mesh", geometry: baked.result.geometry } }]);
  await live("editor.select", { objectId: "floor" });
  await expect(page.getByRole("button", { name: "Bake Object Mesh" })).toBeVisible();
  await page.getByRole("button", { name: "Bake Object Mesh" }).click();
  await live("editor.select", { objectId: "bob" });
  await expect(page.getByLabel("Joint type")).toBeVisible();
  expect((await live("editor.save")).status).toBe("ok");
  await live("editor.transport", { action: "play" });
  await expect.poll(async () => (await live("editor.status")).result.physics?.status).toBe("running");
  await expect.poll(async () => (await live("editor.events")).result?.events.some((event: { kind: string }) => event.kind === "trigger-enter")).toBe(true);
  expect((await live("editor.mesh", { objectId: "floor" })).status).toBe("error");
  await live("editor.transport", { action: "stop" });
  await page.reload();
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const items = (await live("editor.inspect")).result.items;
  expect(items.find((item: { id: string }) => item.id === "floor").colliders[0].geometry.indices).toHaveLength(36);
  expect(items.find((item: { id: string }) => item.id === "bob").joint.kind).toBe("distance");
  expect(items.find((item: { id: string }) => item.id === "sensor").colliders[0].is_trigger).toBe(true);
  expect(errors).toEqual([]);
});
