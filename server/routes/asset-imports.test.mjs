import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { handleAssetImportRoute } from "./asset-imports.mjs";

function request(method, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = "/api/assets/import-settings?filename=Hero.fbx";
  return req;
}

function response() {
  return {
    statusCode: 0,
    body: "",
    headers: new Map(),
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    end(body = "") { this.body = String(body); },
  };
}

function dependencies(overrides = {}) {
  return {
    readModelImportDocument: async () => ({ revision: "meta-r1" }),
    writeModelImportDocument: async () => ({ revision: "meta-r2" }),
    ...overrides,
  };
}

test("model import writes require and forward the sidecar base revision", async () => {
  const missing = response();
  let writes = 0;
  await handleAssetImportRoute(
    request("PUT", { settings: {} }),
    missing,
    5173,
    dependencies({ writeModelImportDocument: async () => { writes += 1; } }),
  );
  assert.equal(missing.statusCode, 400);
  assert.equal(writes, 0);

  const saved = response();
  let received = null;
  await handleAssetImportRoute(
    request("PUT", { settings: { importAnimations: true }, baseRevision: "meta-r1" }),
    saved,
    5173,
    dependencies({
      writeModelImportDocument: async (...args) => {
        received = args;
        return { revision: "meta-r2" };
      },
    }),
  );
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(received, ["Hero.fbx", { importAnimations: true }, "meta-r1"]);
});

test("model import conflicts are returned without overwriting disk state", async () => {
  const res = response();
  await handleAssetImportRoute(
    request("PUT", { settings: {}, baseRevision: "meta-r1" }),
    res,
    5173,
    dependencies({
      writeModelImportDocument: async () => {
        throw new DocumentConflictError("meta-r1", "meta-r2");
      },
    }),
  );
  assert.equal(res.statusCode, 409);
  assert.deepEqual(JSON.parse(res.body), {
    status: "conflict",
    message: "Document changed since it was loaded. Reload before saving again.",
    expectedRevision: "meta-r1",
    actualRevision: "meta-r2",
  });
});

test("model import reads are never served from an HTTP cache", async () => {
  const res = response();
  await handleAssetImportRoute(request("GET"), res, 5173, dependencies());
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("cache-control"), "no-store, max-age=0");
});
