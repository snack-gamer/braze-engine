import { defineConfig } from "playwright/test";
import { runtimeBrowserLaunchOptions } from "./scripts/lib/runtime-browser-launch-options.mjs";
import { createInputActionMapProject } from "./tests/gameplay/input-action-map-project.mjs";

const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT ?? createInputActionMapProject();
process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT = projectRoot;

export default defineConfig({
  testDir: "./tests/input-assets", testMatch: "**/*.spec.ts", timeout: 300_000,
  expect: { timeout: 30_000 }, workers: 1, reporter: [["list"]], globalTeardown: "./tests/browser/global-teardown.ts",
  use: { baseURL: "http://127.0.0.1:4373", trace: "retain-on-failure", actionTimeout: 30_000, navigationTimeout: 30_000,
    launchOptions: runtimeBrowserLaunchOptions() },
  webServer: [
    { command: "npm run dev", url: "http://127.0.0.1:4373", reuseExistingServer: false, timeout: 120_000,
      env: { PORT: "4373", VITE_HMR_PORT: "24373", BRAZE_PROJECT_ROOT: projectRoot } },
    { command: "npm run build:player && npm run preview:player -- --port 4374 --strictPort", url: "http://127.0.0.1:4374/player.html", reuseExistingServer: false, timeout: 120_000,
      env: { BRAZE_PROJECT_ROOT: projectRoot } },
  ],
});
