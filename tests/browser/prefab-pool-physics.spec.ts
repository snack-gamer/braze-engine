import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`pooled prefab motion resets without disturbing other bodies on the ${large ? "large" : "small"} solver`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/prefab-pool-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running", { timeout: 60000 });
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.idle).toMatchObject({ available: 1, retained: 1, active: 0 });
  expect(result.activeAfterReturn).toBe(result.start); expect(result.sameSlot).toBe(true); expect(result.stale).toBe(true);
  expect(result.generation).toBe(2); expect(result.physicalGeneration).toBe(2);
  expect(result.resetError).toBeLessThan(1e-5); expect(result.preservedError).toBe(0);
  expect(result.stats).toMatchObject({ allocatedSlots: 4, reserved: 4, runtime: 4 });
});
