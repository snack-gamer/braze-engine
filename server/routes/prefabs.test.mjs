import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { DocumentConflictError } from "../lib/json-document-store.mjs";
import { handlePrefabRoute } from "./prefabs.mjs";

function request(method, url, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  return req;
}

function response() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    headers,
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
    root: "/unused/assets",
    backupsRoot: "/unused/backups/prefabs",
    availableFilename: (filename) => filename,
    createPrefabDocument: async ({ filename, prefab }) => ({
      filename,
      value: prefab,
      revision: "created-revision",
    }),
    describeIndexedAsset: async (filename, contentRevision) => ({
      filename,
      name: filename,
      url: `/3d-models/${filename}`,
      path: `assets/${filename}`,
      sizeBytes: 1,
      contentRevision,
    }),
    readPrefabDocument: async () => null,
    writePrefabDocument: async ({ filename, prefab }) => ({
      filename,
      value: prefab,
      revision: "written-revision",
    }),
    ...overrides,
  };
}

const prefab = {
  version: "braze/prefab-v1",
  name: "Crate",
  objects: [{ id: "root" }],
};

test("prefab GET returns the exact document revision with no-cache headers", async () => {
  const res = response();
  await handlePrefabRoute(
    request("GET", "/api/assets/prefab?filename=Props%2FCrate.braze-prefab.json"),
    res,
    5173,
    dependencies({
      readPrefabDocument: async ({ filename }) => ({
        value: { ...prefab, loadedFilename: filename },
        revision: "loaded-revision",
      }),
    }),
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(res.headers.get("pragma"), "no-cache");
  assert.deepEqual(JSON.parse(res.body), {
    status: "ok",
    prefab: { ...prefab, loadedFilename: "Props/Crate.braze-prefab.json" },
    revision: "loaded-revision",
  });
});

test("prefab PUT requires the loaded revision", async () => {
  const res = response();
  let writes = 0;
  await handlePrefabRoute(
    request(
      "PUT",
      "/api/assets/prefab?filename=Crate.braze-prefab.json",
      { prefab },
    ),
    res,
    5173,
    dependencies({ writePrefabDocument: async () => { writes += 1; } }),
  );

  assert.equal(res.statusCode, 400);
  assert.equal(writes, 0);
  assert.match(JSON.parse(res.body).message, /baseRevision: string \| null/);
});

test("prefab route awaits stale writes and returns an actionable 409", async () => {
  const res = response();
  await assert.doesNotReject(handlePrefabRoute(
    request(
      "PUT",
      "/api/assets/prefab?filename=Crate.braze-prefab.json",
      { prefab, baseRevision: "local-r1", assetGuid: "a".repeat(32) },
    ),
    res,
    5173,
    dependencies({
      writePrefabDocument: async (options) => {
        assert.equal(options.expectedGuid, "a".repeat(32));
        await Promise.resolve();
        throw new DocumentConflictError("local-r1", "remote-r2");
      },
    }),
  ));

  assert.equal(res.statusCode, 409);
  assert.deepEqual(JSON.parse(res.body), {
    status: "conflict",
    message: "Document changed since it was loaded. Reload before saving again.",
    expectedRevision: "local-r1",
    actualRevision: "remote-r2",
  });
});

test("prefab POST returns the revision on the created library asset", async () => {
  const res = response();
  await handlePrefabRoute(
    request("POST", "/api/assets/prefab", { prefab, name: "Crate" }),
    res,
    5173,
    dependencies(),
  );

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.revision, "created-revision");
  assert.equal(body.asset.contentRevision, "created-revision");
  assert.equal(body.asset.reused, false);
});
