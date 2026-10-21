import { expect, test } from "playwright/test";

test("copies selected and filtered messages with visible feedback in a narrow Console", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const copied: string[] = [];
  // Exercise real buttons while keeping test output out of the user's OS clipboard.
  await page.exposeFunction("captureConsoleCopy", (text: string) => { copied.push(text); });
  await page.addInitScript(() => {
    localStorage.removeItem("braze.editor.console-options.v1");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: (text: string) => (window as unknown as { captureConsoleCopy: (text: string) => Promise<void> }).captureConsoleCopy(text),
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open Console", exact: true }).click();
  const output = page.getByLabel("Editor Console", { exact: true });
  await output.evaluate((element) => { element.style.maxWidth = "570px"; });
  const selectedCopy = output.getByRole("button", { name: "Copy selected", exact: true });
  const visibleCopy = output.getByRole("button", { name: /^Copy visible/ });
  await expect(selectedCopy).toBeDisabled();
  const clear = output.getByRole("button", { name: "Clear", exact: true });
  if (await clear.isEnabled()) await clear.click();
  await expect(visibleCopy).toBeDisabled();
  await page.evaluate(() => {
    console.log("[COPY] First\nFull detail on the next line.");
    console.warn("[COPY] Warning");
    console.log("[COPY] Repeat"); console.log("[COPY] Repeat");
    console.log("Excluded by search");
  });
  await output.getByRole("searchbox", { name: "Search Console", exact: true }).fill("[COPY]");
  const first = output.getByRole("option").filter({ hasText: "[COPY] First" });
  await first.click(); await selectedCopy.click();
  await expect(output.getByRole("status")).toHaveText("Copied 1 message.");
  expect(copied[0]).toContain("[COPY] First\nFull detail on the next line.");
  expect(copied[0].match(/\[COPY\] First/g)).toHaveLength(1);
  expect(copied[0]).toContain("Stack:"); expect(copied[0]).not.toContain("[COPY] Warning");
  await first.focus(); await page.keyboard.press("Control+c");
  await expect.poll(() => copied.length).toBe(2); expect(copied[1]).toBe(copied[0]);
  await output.getByRole("button", { name: "Collapse", exact: true }).click();
  await output.getByRole("button", { name: "Show Warnings", exact: true }).click();
  await expect(visibleCopy).toHaveText("Copy visible (2)"); await visibleCopy.click();
  await expect(output.getByRole("status")).toHaveText("Copied 2 messages.");
  expect(copied[2]).toContain("[COPY] First"); expect(copied[2]).toContain("[COPY] Repeat");
  expect(copied[2]).toContain("repeated 2 times");
  expect(copied[2]).not.toContain("[COPY] Warning"); expect(copied[2]).not.toContain("Excluded by search");
  const bounds = (await output.boundingBox())!;
  for (const control of [selectedCopy, visibleCopy, output.getByRole("button", { name: "Show Errors", exact: true })]) {
    const button = (await control.boundingBox())!;
    expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Permission denied"); }; });
  await visibleCopy.click();
  await expect(output.getByRole("status")).toContainText("Copy failed.");
  await expect(output.getByRole("status")).toContainText("copy manually");
  await page.screenshot({ path: "/tmp/braze-console-copy.png" });
});

test("captures, filters, collapses, clears, and pauses from the dockable Console", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.removeItem("braze.editor.dock-layout.v3");
    window.localStorage.removeItem("braze.editor.dock-layout.v2");
    window.localStorage.removeItem("braze.editor.dock-layout.v1");
    window.localStorage.removeItem("braze.editor.console-options.v1");
  });
  await page.goto("/");

  await page.evaluate(() => {
    console.log("CONSOLE_LOG_MARKER", { phase: "editor" });
    console.warn("CONSOLE_WARNING_MARKER");
    console.error("CONSOLE_ERROR_MARKER", { system: "runtime" });
    console.log("CONSOLE_REPEAT_MARKER");
    console.log("CONSOLE_REPEAT_MARKER");
    console.log("CONSOLE_REPEAT_MARKER");
  });

  const openConsole = page.getByRole("button", { name: "Open Console", exact: true });
  await openConsole.click();
  const consoleWindow = page.getByLabel("Editor Console", { exact: true });
  await expect(consoleWindow).toBeVisible();
  await expect(page.getByRole("tab", { name: "Console", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(consoleWindow.locator(".console-window__row").filter({ hasText: "CONSOLE_LOG_MARKER" })).toHaveCount(1);
  await expect(consoleWindow.locator(".console-window__row").filter({ hasText: "CONSOLE_WARNING_MARKER" })).toHaveCount(1);
  await expect(consoleWindow.locator(".console-window__row").filter({ hasText: "CONSOLE_ERROR_MARKER" })).toHaveCount(1);

  const warningFilter = consoleWindow.getByRole("button", { name: "Show Warnings", exact: true });
  await expect(warningFilter).toHaveAttribute("aria-pressed", "true");
  await warningFilter.click();
  await expect(consoleWindow.locator(".console-window__row").filter({ hasText: "CONSOLE_WARNING_MARKER" })).toHaveCount(0);
  await warningFilter.click();

  const search = consoleWindow.getByRole("searchbox", { name: "Search Console", exact: true });
  await search.fill("CONSOLE_ERROR_MARKER");
  const errorRow = consoleWindow.locator(".console-window__row").filter({ hasText: "CONSOLE_ERROR_MARKER" });
  await expect(errorRow).toHaveCount(1);
  await errorRow.click();
  const details = consoleWindow.getByLabel("Selected Console message", { exact: true });
  await expect(details).toContainText("CONSOLE_ERROR_MARKER");
  await expect(details).toContainText("system: runtime");

  await search.fill("CONSOLE_REPEAT_MARKER");
  await consoleWindow.getByRole("button", { name: "Collapse", exact: true }).click();
  const collapsedRow = consoleWindow.locator(".console-window__row").filter({ hasText: "CONSOLE_REPEAT_MARKER" });
  await expect(collapsedRow).toHaveCount(1);
  await expect(collapsedRow.getByLabel("Repeated 3 times", { exact: true })).toBeVisible();

  await search.fill("");
  await consoleWindow.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(consoleWindow.getByText("No console messages", { exact: true })).toBeVisible();

  await page.evaluate(() => console.log("CLEAR_ON_PLAY_MARKER"));
  await expect(consoleWindow.getByText("CLEAR_ON_PLAY_MARKER", { exact: false })).toBeVisible();
  const errorPause = consoleWindow.getByRole("button", { name: "Error Pause", exact: true });
  await errorPause.click();
  await expect(errorPause).toHaveAttribute("aria-pressed", "true");

  const play = page.getByLabel("Enter Play Mode", { exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-playback-mode", "playing");
  await expect(consoleWindow.getByText("CLEAR_ON_PLAY_MARKER", { exact: false })).toHaveCount(0);

  await page.evaluate(() => console.error("ERROR_PAUSE_MARKER"));
  await expect(page.locator(".app-shell")).toHaveAttribute("data-playback-mode", "paused");
  await expect(consoleWindow.getByText("ERROR_PAUSE_MARKER", { exact: false })).toBeVisible();
  await page.getByLabel("Exit Play Mode", { exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-playback-mode", "edit");

  await page.keyboard.press("Control+Shift+C");
  await expect(consoleWindow).toHaveCount(0);
});
