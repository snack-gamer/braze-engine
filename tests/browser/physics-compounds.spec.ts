import { expect, test } from "playwright/test";
for (const large of [false, true]) test(`compound stacks retain shared poses and real gaps on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/compound-physics.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed"); expect(result.errors).toEqual([]);
  expect(result.bodyCount).toBe(large ? 69 : 4);
  expect(result.positions.lower[1]).toBeCloseTo(0.5, 1);
  expect(result.positions.upper[1]).toBeCloseTo(1.5, 1);
  expect(result.positions.gap[1]).toBeCloseTo(0.25, 2); expect(result.positions.gap[0]).toBeCloseTo(0, 2);
});
