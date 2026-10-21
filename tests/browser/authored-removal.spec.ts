import { expect, test } from "playwright/test";

for (const large of [false, true]) test(`authored destruction preserves running ${large ? "large" : "small"} GPU worlds without reserve slots`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/authored-removal.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running", { timeout: 60_000 });
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.preservedError).toBe(0); expect(result.count).toBe(result.initial - 2); expect(result.floorRemoved).toBe(true);
  expect(result.baselineY).toBeCloseTo(0.5, 1); expect(result.restingY).toBeLessThan(-3);
  expect(result.releasedX).toBeGreaterThan(23.9); expect(result.tetheredX).toBeLessThan(22.1);
  expect(result.staleEvents).toEqual([]);
});
