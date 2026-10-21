import { expect, test } from "playwright/test";

for (const large of [false, true]) test(`gameplay commands reach every admitted tick on the ${large ? "large" : "small"} GPU schedule`, async ({ page }) => {
  await page.goto(`/tests/browser/fixtures/gameplay-timing.html${large ? "?large=1" : ""}`);
  await expect(page.locator("#result")).not.toHaveText("running", { timeout: 60_000 });
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.status, JSON.stringify(result)).toBe("passed");
  expect(result.errors).toEqual([]);
  for (const run of result.runs) {
    expect(run.heldAtStartup).toBe(0);
    expect(run.playingTick).toBe(120); expect(run.pausedTick).toBe(120);
    expect(run.steppedTick).toBe(121); expect(run.submittedTick).toBe(121);
    // Unit mass, one dt impulse per tick, zero damping/gravity: sum(n*dt²).
    // Coalescing impulses across ticks produces a measurably different position.
    expect(run.dynamicX).toBeCloseTo((121 * 122 / 2) / 3600, 3);
    expect(run.kinematicX).toBeCloseTo(10 + 121 * 0.05, 3);
  }
});
