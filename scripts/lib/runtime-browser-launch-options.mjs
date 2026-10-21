import { existsSync } from "node:fs";
import { chromium } from "playwright";

/**
 * Require the browser managed by this checkout's Playwright version.
 * System Chrome on macOS can retain inherited stdio through an orphan crashpad
 * process (Playwright issue #39736). Select the managed full browser explicitly.
 */
export function runtimeBrowserLaunchOptions({ managedExecutablePath = chromium.executablePath(), fileExists = existsSync } = {}) {
  if (!fileExists(managedExecutablePath)) throw new Error("Playwright-managed Chromium is not installed. Run `npx playwright install chromium` from the engine repository root, then retry browser verification.");
  // Playwright's full managed browser uses native GPU adapters in new headless
  // mode. Its default headless shell selects SwiftShader on this macOS host.
  return { channel: "chromium" };
}
