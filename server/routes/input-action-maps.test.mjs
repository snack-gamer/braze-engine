import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { handleInputActionMapRoute } from "./input-action-maps.mjs";

const document = { version: "braze/input-action-map-v1", name: "Controls", map: { version: 1, actions: [] } };
function request(method, url, body) {
  return Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, url });
}
function response() {
  return { statusCode: 0, body: "", headers: new Map(), setHeader(key, value) { this.headers.set(key.toLowerCase(), value); }, end(body = "") { this.body = String(body); } };
}
function dependencies(overrides = {}) {
  return { root: "/unused/assets", backupsRoot: "/unused/backups", availableFilename: (filename) => filename,
    describeIndexedAsset: async (filename, contentRevision) => ({ filename, kind: "inputActionMap", contentRevision }),
    readInputActionMapDocument: async () => ({ value: document, revision: "loaded" }),
    createInputActionMapDocument: async ({ filename, document: value }) => ({ filename, value, revision: "created" }),
    writeInputActionMapDocument: async ({ filename, document: value }) => ({ filename, value, revision: "written" }), ...overrides };
}

test("input map creation and reads expose the exact indexed source revision", async () => {
  const created = response();
  await handleInputActionMapRoute(request("POST", "/api/assets/input-action-map", { document, folder: "Controls" }), created, 5179, dependencies());
  assert.equal(created.statusCode, 200);
  assert.deepEqual(JSON.parse(created.body), { status: "ok", document, revision: "created", asset: { filename: "Controls/Controls.braze-input.json", kind: "inputActionMap", contentRevision: "created" } });
  const loaded = response();
  await handleInputActionMapRoute(request("GET", "/api/assets/input-action-map?filename=Controls.braze-input.json"), loaded, 5179, dependencies());
  assert.equal(loaded.statusCode, 200); assert.equal(loaded.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(JSON.parse(loaded.body).revision, "loaded");
});

test("input map saves require the loaded revision and return actionable asynchronous conflicts", async () => {
  let writes = 0;
  const missing = response();
  await handleInputActionMapRoute(request("PUT", "/api/assets/input-action-map?filename=Controls.braze-input.json", { document }), missing, 5179,
    dependencies({ writeInputActionMapDocument: async () => { writes++; } }));
  assert.equal(missing.statusCode, 400); assert.equal(writes, 0); assert.match(JSON.parse(missing.body).message, /baseRevision/);
  const conflict = response();
  await handleInputActionMapRoute(request("PUT", "/api/assets/input-action-map?filename=Controls.braze-input.json", { document, baseRevision: "local" }), conflict, 5179,
    dependencies({ writeInputActionMapDocument: async () => { await Promise.resolve(); throw new DocumentConflictError("local", "remote"); } }));
  assert.equal(conflict.statusCode, 409); assert.deepEqual(JSON.parse(conflict.body), { status: "conflict", message: "Document changed since it was loaded. Reload before saving again.", expectedRevision: "local", actualRevision: "remote" });
});

test("malformed authored maps and escaping folders never reach persistence", async () => {
  let writes = 0;
  for (const body of [{ document, folder: "../outside" }, { document: { ...document, version: "unknown" } }]) {
    const reply = response();
    await handleInputActionMapRoute(request("POST", "/api/assets/input-action-map", body), reply, 5179, dependencies({ createInputActionMapDocument: async () => { writes++; } }));
    assert.equal(reply.statusCode, 400);
  }
  assert.equal(writes, 0);
});

test("missing selected map sources return a distinct 404", async () => {
  const reply = response();
  await handleInputActionMapRoute(request("GET", "/api/assets/input-action-map?filename=Missing.braze-input.json"), reply, 5179, dependencies({ readInputActionMapDocument: async () => null }));
  assert.equal(reply.statusCode, 404); assert.match(JSON.parse(reply.body).message, /not found/);
});
