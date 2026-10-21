import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Test-owned identity. Production assets receive their GUID from the Asset Database.
export const PREFAB_REVIEW_GUID = "bf050000000000000000000000000001";
export const PREFAB_REVIEW_FILE = "Runtime Duo.braze-prefab.json";
export function prefabReviewDocument() {
  return JSON.parse(readFileSync(new URL("./fixtures/runtime-duo.braze-prefab.json", import.meta.url), "utf8"));
}

export function installPrefabReviewAsset(root) {
  const filename = path.join(root, "assets", PREFAB_REVIEW_FILE);
  writeFileSync(filename, JSON.stringify(prefabReviewDocument(), null, 2), { flag: "wx" });
  writeFileSync(`${filename}.braze.meta`, JSON.stringify({ fileFormatVersion: 1, guid: PREFAB_REVIEW_GUID,
    importer: { id: "braze.prefab", settingsVersion: 1, settings: {} }, labels: [], foreignIds: {} }, null, 2), { flag: "wx" });
  const configPath = path.join(root, "braze.project.json"), config = JSON.parse(readFileSync(configPath, "utf8"));
  config.runtimePhysicsCapacity = Math.max(16, config.runtimePhysicsCapacity ?? 0);
  config.runtimePrefabs = [{ guid: PREFAB_REVIEW_GUID, localId: "main" }];
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
