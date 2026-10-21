import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

const SHA256_RE = /^[a-f0-9]{64}$/;
const UNITY_GUID_RE = /^[a-f0-9]{32}$/;

function normalizedHex(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function manifestUnityPrefabGuid(manifest) {
  const guid = normalizedHex(manifest?.source?.unityGuid);
  if (!UNITY_GUID_RE.test(guid)) {
    throw new Error("Manifest source.unityGuid must be a 32-character hexadecimal Unity GUID");
  }
  return guid;
}

export function assertUnityPrefabIdentity(meta, incomingUnityGuid, assetLabel = "asset") {
  const incoming = normalizedHex(incomingUnityGuid);
  if (!UNITY_GUID_RE.test(incoming)) {
    throw new Error("Incoming Unity prefab GUID must be a 32-character hexadecimal value");
  }

  const existingValue = meta?.foreignIds?.unityPrefabGuid;
  if (existingValue === undefined || existingValue === null || String(existingValue).trim() === "") {
    return;
  }

  const existing = normalizedHex(existingValue);
  if (!UNITY_GUID_RE.test(existing)) {
    throw new Error(
      `Refusing to register ${assetLabel}: its existing metadata has an invalid foreignIds.unityPrefabGuid`,
    );
  }
  if (existing !== incoming) {
    throw new Error(
      `Refusing to register ${assetLabel}: its existing metadata is bound to Unity prefab ${existing}, ` +
      `but this export comes from ${incoming}. Use the original stable destination or explicitly migrate the asset metadata.`,
    );
  }
}

async function sha256File(filename) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filename);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", reject);
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifyExportGlbHash(filename, expectedValue) {
  const expected = normalizedHex(expectedValue);
  if (!SHA256_RE.test(expected)) {
    throw new Error("Manifest output.sha256 must be a 64-character hexadecimal SHA-256 digest");
  }

  const actual = await sha256File(filename);
  if (actual !== expected) {
    throw new Error(
      `Exported GLB SHA-256 mismatch for ${filename}: manifest=${expected}, actual=${actual}`,
    );
  }
  return actual;
}
