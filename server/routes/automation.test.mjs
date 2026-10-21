import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAutomationRoute } from "./automation.mjs";

function response() { return { statusCode: 0, setHeader() {}, end(body) { this.body = JSON.parse(body); } }; }
function request(body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = "POST";
  req.headers = { host: "127.0.0.1:5173", "x-braze-automation": "1", ...headers }; return req;
}
function setup() {
  let writes = 0;
  const route = createAutomationRoute({ root: "/unused", loadCapabilities: async () => ({}),
    readSceneDocument: async () => ({ revision: "r1", value: { objects: [] } }),
    writeSceneDocument: async () => { writes++; return { revision: "r2" }; },
    loadAuthoring: async () => ({ executeSceneCommands: () => ({ scene: { objects: [] }, valid: true, diagnostics: [], changedIds: ["test"], objectCount: 1 }) }),
  });
  return { route, writes: () => writes };
}
const command = { version: 1, requestId: "test", operation: "scene.edit", baseRevision: "r1", commands: [] };
const endpoint = "/api/automation/v1/commands";

test("automation previews without writing and applies only the matching scene revision", async () => {
  const { route, writes } = setup(); const preview = response();
  await route(request(command), preview, endpoint); assert.equal(preview.body.result.applied, false); assert.equal(writes(), 0);
  const stale = response(); await route(request({ ...command, baseRevision: "old", apply: true }), stale, endpoint);
  assert.equal(stale.statusCode, 409); assert.equal(writes(), 0);
  const applied = response(); await route(request({ ...command, apply: true }), applied, endpoint);
  assert.equal(applied.body.result.revision, "r2"); assert.equal(writes(), 1);
});

test("automation rejects cross-origin mutations, missing headers and unknown operations", async () => {
  const { route, writes } = setup();
  for (const headers of [{ origin: "https://untrusted.example" }, { "x-braze-automation": undefined }]) {
    const res = response(); await route(request(command, headers), res, endpoint); assert.equal(res.statusCode, 403);
  }
  const res = response(); await route(request({ ...command, operation: "shell.execute" }), res, endpoint);
  assert.equal(res.statusCode, 400); assert.equal(writes(), 0);
});
