import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertUnityPrefabIdentity,
  manifestUnityPrefabGuid,
  verifyExportGlbHash,
} from "./unity-export-registration.mjs";

const UNITY_GUID = "10c5494ff6a0414488d20c0285a1078d";

test("manifestUnityPrefabGuid validates and normalizes Unity GUIDs", () => {
  assert.equal(
    manifestUnityPrefabGuid({ source: { unityGuid: UNITY_GUID.toUpperCase() } }),
    UNITY_GUID,
  );
  assert.throws(
    () => manifestUnityPrefabGuid({ source: { unityGuid: "not-a-guid" } }),
    /source\.unityGuid/,
  );
});

test("verifyExportGlbHash accepts the matching file and rejects stale manifests", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "braze-unity-register-"));
  try {
    const filename = path.join(directory, "shop.glb");
    const bytes = Buffer.from("deterministic glb fixture");
    await writeFile(filename, bytes);
    const digest = createHash("sha256").update(bytes).digest("hex");

    assert.equal(await verifyExportGlbHash(filename, digest.toUpperCase()), digest);
    await assert.rejects(
      verifyExportGlbHash(filename, "0".repeat(64)),
      /SHA-256 mismatch/,
    );
    await assert.rejects(
      verifyExportGlbHash(filename, "missing"),
      /output\.sha256/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("assertUnityPrefabIdentity permits an unbound or matching sidecar", () => {
  assert.doesNotThrow(() => assertUnityPrefabIdentity({}, UNITY_GUID, "model"));
  assert.doesNotThrow(() => assertUnityPrefabIdentity({
    foreignIds: { unityPrefabGuid: UNITY_GUID.toUpperCase() },
  }, UNITY_GUID, "model"));
});

test("assertUnityPrefabIdentity rejects conflicting or malformed sidecar identity", () => {
  assert.throws(
    () => assertUnityPrefabIdentity({
      foreignIds: { unityPrefabGuid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    }, UNITY_GUID, "model 'shop.glb'"),
    /Refusing to register model 'shop\.glb'.*bound to Unity prefab/s,
  );
  assert.throws(
    () => assertUnityPrefabIdentity({
      foreignIds: { unityPrefabGuid: "corrupt" },
    }, UNITY_GUID, "prefab 'shop.braze-prefab.json'"),
    /invalid foreignIds\.unityPrefabGuid/,
  );
});
