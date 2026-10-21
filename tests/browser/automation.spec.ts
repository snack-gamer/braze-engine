import { expect, test } from "playwright/test";

test("an agent previews, builds, inspects and validates a saved physics scene", async ({ request }) => {
  const capabilities = await request.get("/api/automation/v1/capabilities");
  expect(capabilities.ok()).toBe(true);
  expect((await capabilities.json()).operations).toContain("scene.edit");
  const invoke = async (body: object) => request.post("/api/automation/v1/commands", {
    headers: { "X-Braze-Automation": "1" }, data: { version: 1, requestId: "browser-agent", sceneId: "agent-sandbox", ...body },
  });
  const commands = [
    { op: "object.create", id: "camera", primitive: "camera" },
    { op: "object.create", id: "ground", primitive: "cube", values: { position: [0, -0.5, 0], scale: [10, 1, 10] } },
    { op: "component.set", id: "ground", component: "collider", values: { size: [1, 1, 1] } },
    { op: "object.create", id: "ball", primitive: "sphere", values: { position: [0, 3, 0] } },
    { op: "component.set", id: "ball", component: "collider", values: { radius: 0.5 } },
    { op: "component.set", id: "ball", component: "rigidbody", values: {} },
  ];
  const preview = await invoke({ operation: "scene.edit", baseRevision: null, commands });
  expect(preview.ok(), await preview.text()).toBe(true);
  expect((await preview.json()).result).toMatchObject({ applied: false, valid: true, objectCount: 3 });
  expect((await (await invoke({ operation: "scene.inspect" })).json()).result.exists).toBe(false);
  const applied = await invoke({ operation: "scene.edit", baseRevision: null, commands, apply: true });
  expect(applied.ok(), await applied.text()).toBe(true);
  const revision = (await applied.json()).result.revision;
  expect(typeof revision).toBe("string");
  const inspection = (await (await invoke({ operation: "scene.inspect", limit: 2 })).json()).result;
  expect(inspection).toMatchObject({ total: 3, nextOffset: 2, revision });
  const validation = (await (await invoke({ operation: "scene.validate" })).json()).result;
  expect(validation.valid).toBe(true);
  const conflict = await invoke({ operation: "scene.edit", baseRevision: null, commands, apply: true });
  expect(conflict.status()).toBe(409);
  const saved = (await (await request.get("/api/scenes/agent-sandbox")).json()).scene;
  expect(saved.objects.find((item: { id: string }) => item.id === "ball").rigidbody.enabled).toBe(true);
});
