import { expect, test } from "playwright/test";

for (const large of [false, true]) test(`runtime bodies preserve existing GPU state on the ${large ? "large" : "small"} solver`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/entity-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running", { timeout: 60000 });
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.first).toBeLessThan(3.5); expect(result.first).toBeGreaterThan(3.49);
  expect(result.landed).toBeCloseTo(0.5, 1);
  expect(result.replaced).toBeLessThan(7); expect(result.replaced).toBeGreaterThan(6.99);
  expect(result.rejected).toBe(true); expect(result.activeBeforeRemoval).toBe(result.authored + 2);
  expect(result.activeAfterRemoval).toBe(result.authored); expect(result.staleEvents).toEqual([]);
  expect(result.preservedError).toBe(0);
});
