import { defineConfig } from "playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeBrowserLaunchOptions } from "./scripts/lib/runtime-browser-launch-options.mjs";

const port = 4173;
// Browser pages may emit a keepalive save while they are closing, after
// Playwright has detached page-level request interception. Point the test
// server at an isolated project so no test can mutate the developer's game.
const testProjectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT
  || mkdtempSync(join(tmpdir(), "braze-playwright-project-"));
process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT = testProjectRoot;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalTeardown: "./tests/browser/global-teardown.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: runtimeBrowserLaunchOptions(),
  },
  webServer: {
    command: "npm run dev",
    env: {
      PORT: String(port),
      VITE_HMR_PORT: String(port + 20_000),
      BRAZE_PROJECT_ROOT: testProjectRoot,
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
