import { expect, test } from "playwright/test";

test("live agent edits are visible, undoable, revision checked and preserve Play snapshots", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const invoke = async (body: object) => {
    const response = await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), ...body } });
    return response.json();
  };
  const existing = await (await request.get("/api/scenes/current")).json();
  const seed = await request.put("/api/scenes/current", { data: { baseRevision: existing.revision,
    scene: { version: "braze-engine/scene-v1", objects: [{ id: "camera", source_type: "camera", name: "Camera" }] } } });
  expect(seed.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByLabel("3D scene viewport")).toBeVisible();
  let sessionId = "";
  await expect.poll(async () => { sessionId = (await invoke({ operation: "editor.sessions" })).result[0]?.sessionId; return sessionId; }).toBeTruthy();
  const live = (operation: string, rest = {}) => invoke({ operation, sessionId, ...rest });
  await expect.poll(async () => (await live("editor.status")).result.loaded).toBe(true);
  const before = (await live("editor.status")).result;
  const commands = [
    { op: "object.create", id: "live-ball", primitive: "sphere", values: { name: "Live agent ball", position: [0, 4, 0], color: "#34a8df" } },
    { op: "component.set", id: "live-ball", component: "collider", values: {} },
    { op: "component.set", id: "live-ball", component: "rigidbody", values: {} },
  ];
  expect((await live("editor.edit", { baseRevision: before.revision, commands })).result.applied).toBe(false);
  expect((await live("editor.status")).result.objectCount).toBe(before.objectCount);
  const applied = await live("editor.edit", { baseRevision: before.revision, commands, apply: true });
  expect(applied.status, JSON.stringify(applied)).toBe("ok");
  await expect(page.getByText("Live agent ball", { exact: true }).first()).toBeVisible();
  expect((await live("editor.edit", { baseRevision: before.revision, commands, apply: true })).status).toBe("error");
  await live("editor.undo");
  expect((await live("editor.status")).result.objectCount).toBe(before.objectCount);
  await live("editor.redo");
  expect((await live("editor.status")).result.objectCount).toBe(before.objectCount + 1);
  const saved = await live("editor.save");
  expect(saved.status, JSON.stringify(saved)).toBe("ok");
  expect(saved.result.saved).toBe(true);
  expect((await live("editor.transport", { action: "play" })).result.mode).toBe("playing");
  await expect(page.getByLabel("Exit Play Mode")).toBeVisible();
  await expect.poll(async () => (await live("editor.status")).result.physics?.status).toBe("running");
  expect((await live("editor.transport", { action: "pause" })).result.mode).toBe("paused");
  await expect(page.getByLabel("Resume", { exact: true })).toBeVisible();
  expect((await live("editor.transport", { action: "step" })).result.mode).toBe("paused");
  expect((await live("editor.edit", { baseRevision: applied.result.revision, commands, apply: true })).status).toBe("error");
  await live("editor.transport", { action: "stop" });
  await expect(page.getByLabel("Enter Play Mode")).toBeVisible();
  const objects = (await live("editor.inspect")).result.items;
  expect(objects.find((object: { id: string }) => object.id === "live-ball").transform.position).toEqual([0, 4, 0]);
  expect(errors).toEqual([]);
});
