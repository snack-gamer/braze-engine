import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`character steps, stops at walls and pushes dynamics on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/character-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.step[0]).toBeCloseTo(1.5, 3); expect(result.step[1]).toBeCloseTo(1.12, 3);
  expect(result.stepped.stepped).toBe(true); expect(result.stepped.grounded).toBe(true);
  expect(result.wall[0]).toBeLessThan(3.531); expect(result.wall[0]).toBeGreaterThan(3.5);
  expect(result.push[0]).toBeGreaterThan(1.5);
});

test("live character authoring, settings, movement, Stop and reload share the editor boundaries", async ({ page, request }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const invoke = async (body: object) => (await request.post("/api/automation/v1/commands", { headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: crypto.randomUUID(), ...body } })).json();
  const before = await (await request.get("/api/scenes/current")).json();
  expect((await request.put("/api/scenes/current", { data: { baseRevision: before.revision, scene: { version: "braze-engine/scene-v1", objects: [{ id: "camera", source_type: "camera", name: "Camera" }] } } })).ok()).toBe(true);
  await page.goto("/");
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  let sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  const live = (operation: string, values = {}) => invoke({ operation, sessionId, ...values });
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  const commands = [
    { op: "object.create", id: "hero", primitive: "cube", values: { position: [0, 0, 0], name: "Motor test" } },
    { op: "component.set", id: "hero", component: "characterController", values: { stepHeight: 0.25 } },
    { op: "object.create", id: "floor", primitive: "cube", values: { position: [0, -0.5, 0] } },
    { op: "component.set", id: "floor", component: "collider", values: { size: [20, 1, 20] } },
    { op: "object.create", id: "step", primitive: "cube", values: { position: [1.5, 0.1, 0] } },
    { op: "component.set", id: "step", component: "collider", values: { size: [1, 0.2, 2] } },
  ];
  const revision = (await live("editor.status")).result.revision;
  expect((await live("editor.edit", { baseRevision: revision, commands })).result.valid).toBe(true);
  expect((await live("editor.edit", { baseRevision: revision, commands, apply: true })).status).toBe("ok");
  expect((await live("editor.save")).status).toBe("ok");
  await live("editor.transport", { action: "play" });
  await expect.poll(async () => (await live("editor.status")).result.physics?.status).toBe("running");
  await live("editor.transport", { action: "pause" });
  const moved = await live("editor.physics", { objectId: "hero", kind: "character-move", displacement: [1.5, 0, 0] });
  expect(moved.status, JSON.stringify(moved)).toBe("ok"); expect(moved.result.stepped).toBe(true);
  expect(moved.result.position[1]).toBeCloseTo(0.22, 3);
  expect((await live("editor.physics", { objectId: "hero", kind: "kinematic-target", position: [5, 0, 0], orientation: [0, 0, 0, 1] })).status).toBe("error");
  await live("editor.transport", { action: "step" });
  await live("editor.transport", { action: "stop" });
  const authored = (await live("editor.inspect")).result.items.find((o: { id: string }) => o.id === "hero");
  expect(authored.transform.position).toEqual([0, 0, 0]);
  expect(authored.character_controller.movement.stepHeight).toBe(0.25);
  await page.reload();
  await expect.poll(() => page.locator("html").getAttribute("data-braze-editor-session")).toBeTruthy();
  sessionId = await page.locator("html").getAttribute("data-braze-editor-session");
  await expect.poll(async () => (await live("editor.status")).result?.loaded).toBe(true);
  expect((await live("editor.inspect")).result.items.find((o: { id: string }) => o.id === "hero").character_controller.movement.stepHeight).toBe(0.25);
  expect(errors).toEqual([]);
});
