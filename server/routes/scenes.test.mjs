import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { handleScenesRoute } from "./scenes.mjs";

function request(method, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  return req;
}

function response() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    end(body = "") {
      this.body = String(body);
    },
  };
}

function dependencies(overrides = {}) {
  return {
    root: "/unused/scenes",
    legacyRoot: "/unused/legacy",
    backupsRoot: "/unused/backups",
    listSceneDocuments: async () => [],
    readSceneDocument: async () => null,
    writeSceneDocument: async () => ({ revision: "written" }),
    patchSceneDocument: async () => ({ revision: "patched", value: { objects: [] } }),
    ...overrides,
  };
}

test("scene route awaits an asynchronous write conflict and returns 409", async () => {
  const res = response();
  await assert.doesNotReject(handleScenesRoute(
    request("PUT", {
      scene: { version: "braze-engine/scene-v1", objects: [] },
      baseRevision: null,
    }),
    res,
    "/api/scenes/current",
    dependencies({
      writeSceneDocument: async () => {
        await Promise.resolve();
        throw new DocumentConflictError(null, "existing-revision");
      },
    }),
  ));

  assert.equal(res.statusCode, 409);
  assert.deepEqual(JSON.parse(res.body), {
    status: "conflict",
    message: "Document changed since it was loaded. Reload before saving again.",
    expectedRevision: null,
    actualRevision: "existing-revision",
  });
});

test("scene route also contains asynchronous read failures", async () => {
  const res = response();
  await assert.doesNotReject(handleScenesRoute(
    request("GET"),
    res,
    "/api/scenes/current",
    dependencies({ readSceneDocument: async () => { throw new Error("unreadable scene"); } }),
  ));

  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).message, /unreadable scene/);
});

test("full scene writes cannot omit the optimistic concurrency token", async () => {
  const res = response();
  let writes = 0;
  await handleScenesRoute(
    request("PUT", { scene: { version: "braze-engine/scene-v1", objects: [] } }),
    res,
    "/api/scenes/current",
    dependencies({ writeSceneDocument: async () => { writes += 1; } }),
  );

  assert.equal(res.statusCode, 400);
  assert.equal(writes, 0);
  assert.match(JSON.parse(res.body).message, /baseRevision: string \| null/);
});

test("scene delete requires a revision and awaits conflicts", async () => {
  let deletes = 0;
  const deps = dependencies({ deleteSceneDocument: async () => { deletes++; throw new DocumentConflictError("old", "new"); } });
  const missing = response();
  await handleScenesRoute(request("DELETE", {}), missing, "/api/scenes/level", deps);
  assert.equal(missing.statusCode, 400); assert.equal(deletes, 0);
  const conflict = response();
  await handleScenesRoute(request("DELETE", { baseRevision: "old" }), conflict, "/api/scenes/level", deps);
  assert.equal(conflict.statusCode, 409); assert.equal(deletes, 1);
});
