import { defineConfig } from 'playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { createJavascriptProject } from './scripts/lib/create-javascript-project.mjs';
import { runtimeBrowserLaunchOptions } from './scripts/lib/runtime-browser-launch-options.mjs';

const root = process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT
  ?? (await createJavascriptProject(path.join(os.tmpdir(), `braze-playwright-project-scripting-${randomUUID()}`))).root;
process.env.BRAZE_PLAYWRIGHT_PROJECT_ROOT = root;
export default defineConfig({
  testDir: './tests/scripting', testMatch: '**/*.spec.ts', timeout: 120_000,
  expect: { timeout: 30_000 }, workers: 1, reporter: [['list']], globalTeardown: './tests/browser/global-teardown.ts',
  use: { baseURL: 'http://127.0.0.1:4373', trace: 'retain-on-failure', launchOptions: runtimeBrowserLaunchOptions() },
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:4373', reuseExistingServer: false, timeout: 120_000,
      env: { PORT: '4373', VITE_HMR_PORT: '24373', BRAZE_PROJECT_ROOT: root } },
    { command: 'npm run build:player && npm run preview:player -- --port 4374 --strictPort',
      url: 'http://127.0.0.1:4374/player.html', reuseExistingServer: false, timeout: 120_000,
      env: { BRAZE_PROJECT_ROOT: root } },
  ],
});
