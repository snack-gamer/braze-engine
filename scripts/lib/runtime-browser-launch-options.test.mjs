import assert from "node:assert/strict";
import test from "node:test";
import { runtimeBrowserLaunchOptions } from "./runtime-browser-launch-options.mjs";

const managedExecutablePath = "/managed/chromium";
test("managed Chromium selects the full browser's new headless GPU path", () => {
  const checked = [];
  const options = runtimeBrowserLaunchOptions({ managedExecutablePath,
    fileExists(filename) { checked.push(filename); return true; } });
  assert.deepEqual(options, { channel: "chromium" });
  assert.deepEqual(checked, [managedExecutablePath]);
});
test("missing managed browsers fail with an actionable installation command without probing system Chrome", () => {
  const checked = [];
  assert.throws(() => runtimeBrowserLaunchOptions({ managedExecutablePath,
    fileExists(filename) { checked.push(filename); return filename.includes("Google Chrome.app"); } }), /npx playwright install chromium/);
  assert.deepEqual(checked, [managedExecutablePath]);
});
test("launch options cannot leak across configs", () => {
  const options = { managedExecutablePath, fileExists: () => true };
  const first = runtimeBrowserLaunchOptions(options); first.args = ["--fixture-only"];
  assert.deepEqual(runtimeBrowserLaunchOptions(options), { channel: "chromium" });
});
