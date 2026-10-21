import { expect, test } from "playwright/test";
import type { ThreeFrameLifecycleFixtureResult } from "./fixtures/three-frame-lifecycle";

test("app-owned device frames advance Three FRAME nodes once without a private RAF", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/tests/browser/fixtures/three-frame-lifecycle.html");
  await page.waitForFunction(() => Boolean(window.__threeFrameLifecycleFixture), null, {
    polling: 50,
    timeout: 60_000,
  });
  const result = await page.evaluate(() => window.__threeFrameLifecycleFixture) as ThreeFrameLifecycleFixtureResult;
  test.skip(result.status === "unsupported", result.error ?? "WebGPU is unavailable in this browser.");

  expect(result.error).toBeUndefined();
  expect(result.status).toBe("passed");
  expect(result.validationErrors).toEqual([]);
  expect(result.uncapturedErrors).toEqual([]);
  expect(result.sessionErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(result.dispositions).toEqual([
    "submitted",
    "submitted",
    "submitted",
    "submitted",
    "submitted",
  ]);
  expect(result.repeatedOpportunityWasStable).toBe(true);

  // Multiple renders — including one after six browser RAFs — stay in the
  // first app-owned device frame. The cloud post-pass runs once for that frame.
  expect(result.atmosphereUpdateCounts).toEqual([1, 1, 1, 2, 2]);
  expect(result.atmosphereUpdates).toHaveLength(2);
  expect(result.rendererFrames).toHaveLength(5);
  expect(result.rendererFrames.slice(0, 3)).toEqual([
    result.rendererFrames[0],
    result.rendererFrames[0],
    result.rendererFrames[0],
  ]);
  expect(result.rendererFrames.slice(3)).toEqual([
    result.rendererFrames[0]! + 1,
    result.rendererFrames[0]! + 1,
  ]);

  const [firstFrame, secondFrame] = result.atmosphereUpdates;
  expect(firstFrame!.frameId).toBe(result.rendererFrames[0]);
  expect(secondFrame!.frameId).toBe(firstFrame!.frameId + 1);
  expect(secondFrame!.rendererInfoFrame).toBe(secondFrame!.frameId);
  expect(secondFrame!.time).toBeGreaterThan(firstFrame!.time);
  expect(secondFrame!.deltaTime).toBeGreaterThan(0);

  // Three schedules one RAF while initializing its renderer. Ownership must
  // cancel it, and no private callbacks may recur while the app frame is idle.
  expect(result.rendererRafRequestsAtOwnership).toBeGreaterThanOrEqual(1);
  expect(result.rendererRafCancellationsAtOwnership).toBeGreaterThanOrEqual(1);
  expect(result.rendererRafRequestsDuringIdle).toBe(0);
  expect(result.rendererRafCallbacksDuringIdle).toBe(0);
});
