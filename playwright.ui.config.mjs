import { defineConfig } from 'playwright/test';
import scripting from './playwright.scripting.config.mjs';
export default defineConfig({ ...scripting, testDir: './tests/game-ui',
  use: { ...scripting.use, launchOptions: { ...scripting.use.launchOptions, args: [...(scripting.use.launchOptions.args ?? []), '--remote-debugging-port=9338'] } },
  webServer: scripting.webServer.map((entry, index) => index ? entry : { ...entry, env: { ...entry.env, BRAZE_BROWSER_PORT: '9338' } }) });
