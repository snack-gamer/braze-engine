import { defineConfig } from "playwright/test";
import { runtimeBrowserLaunchOptions } from "./scripts/lib/runtime-browser-launch-options.mjs";
import { createStockControlsProject } from "./tests/gameplay/stock-controls-project.mjs";

const scripted = process.env.BRAZE_STOCK_CONTROLS_SCRIPTED === "1";
const projectRoot = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT ?? createStockControlsProject({
  style: process.env.BRAZE_STOCK_CONTROLS_STYLE ?? "first-person", scripted,
});
process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT = projectRoot;

export default defineConfig({
  testDir: "./tests/stock-controls", testMatch: scripted ? "**/stock-controls-scripted.spec.ts" : "**/stock-controls-saved.spec.ts",
  timeout: 120_000, expect: { timeout: 30_000 }, workers: 1, reporter: [["list"]],
  globalTeardown: "./tests/browser/global-teardown.ts",
  // macOS headless Chromium rejects native pointer lock even for a focused, connected bare element.
  // Run these real-gesture acceptance checks with a native window on that platform.
  use: { headless: process.platform !== "darwin", baseURL: "http://127.0.0.1:4373", trace: "retain-on-failure", actionTimeout: 30_000, navigationTimeout: 30_000,
    launchOptions: runtimeBrowserLaunchOptions() },
  webServer: [
    { command: "npm run dev", url: "http://127.0.0.1:4373", reuseExistingServer: false, timeout: 120_000,
      env: { PORT: "4373", VITE_HMR_PORT: "24373", BRAZE_PROJECT_ROOT: projectRoot } },
    { command: "npm run build:player && node tests/stock-controls/stock-controls-player-export.mjs && npm run preview:player -- --port 4374 --strictPort", url: "http://127.0.0.1:4374/stock-controls/player.html", reuseExistingServer: false, timeout: 120_000,
      env: { BRAZE_PROJECT_ROOT: projectRoot } },
  ],
});
