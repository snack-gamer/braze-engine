import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFontImportSettings } from "./font-import-settings.mjs";
import { classifyAssetSource } from "./asset-classification.mjs";
test("font sources use versioned metadata without component state", () => {
  for (const extension of ["woff2", "woff", "ttf", "otf"]) assert.equal(classifyAssetSource(`UI/Font.${extension}`).importerId, "braze.font");
  assert.deepEqual(decodeFontImportSettings({ id: "braze.font", settingsVersion: 1, settings: {} }), {});
  assert.throws(() => decodeFontImportSettings({ id: "braze.font", settingsVersion: 2, settings: {} }), /settingsVersion/);
  assert.throws(() => decodeFontImportSettings({ id: "braze.font", settingsVersion: 1, settings: { fontSize: 14 } }), /empty settings/);
});
