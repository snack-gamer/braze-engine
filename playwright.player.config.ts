import { defineConfig } from "playwright/test";
import { runtimeBrowserLaunchOptions } from "./scripts/lib/runtime-browser-launch-options.mjs";

const port = 4273;

export default defineConfig({
  testDir: "./tests/player",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: runtimeBrowserLaunchOptions(),
  },
  webServer: {
    command: `npm run preview:player -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/player.html`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
