import { defineConfig } from 'playwright/test';
import scripting from './playwright.scripting.config.mjs';

// Same public JavaScript scaffold, with only the owned editor server needed here.
export default defineConfig({ ...scripting, testDir: './tests/mcp', webServer: [scripting.webServer[0]] });
