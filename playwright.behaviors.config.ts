import { defineConfig } from "playwright/test";
import { runtimeBrowserLaunchOptions } from "./scripts/lib/runtime-browser-launch-options.mjs";
import { createSavedBehaviorProject } from "./tests/gameplay/saved-behavior-project.mjs";

const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT ?? createSavedBehaviorProject();
process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT = projectRoot;
export default defineConfig({
  testDir: "./tests/behaviors", testMatch: "**/*.spec.ts", timeout: 120_000,
  expect: { timeout: 30_000 }, workers: 1, reporter: [["list"]],
  globalTeardown: "./tests/browser/global-teardown.ts",
  use: { baseURL: "http://127.0.0.1:4373", trace: "retain-on-failure",
    launchOptions: runtimeBrowserLaunchOptions() },
  webServer: [
    { command: "npm run dev", url: "http://127.0.0.1:4373", reuseExistingServer: false, timeout: 120_000,
      env: { PORT: "4373", VITE_HMR_PORT: "24373", BRAZE_PROJECT_ROOT: projectRoot } },
    { command: "npm run build:player && npm run preview:player -- --port 4374 --strictPort",
      url: "http://127.0.0.1:4374/player.html", reuseExistingServer: false, timeout: 120_000,
      env: { BRAZE_PROJECT_ROOT: projectRoot } },
  ],
});
