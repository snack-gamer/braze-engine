import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`jointed ragdoll survives a fall on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/ragdoll-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.gaps).toHaveLength(10); expect(Math.max(...result.gaps)).toBeLessThan(0.12);
  expect(result.ys.every(Number.isFinite)).toBe(true); expect(Math.min(...result.ys)).toBeGreaterThan(0.05);
  expect(Math.max(...result.ys)).toBeLessThan(2);
});
