import { describe, expect, it } from "vitest";
import { extractLoopedRootMotionDelta } from "./root-motion-loop";

const boundary = {
  cycleStart: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  cycleEnd: { position: [2, 0, 0], rotation: [0, 0, 0, 1] },
} as const;

describe("looped root-motion extraction", () => {
  it("composes arbitrary forward cycles without per-cycle iteration", () => {
    const result = extractLoopedRootMotionDelta(
      { position: [1.5, 0, 0], rotation: [0, 0, 0, 1] },
      { position: [0.5, 0, 0], rotation: [0, 0, 0, 1] },
      boundary,
      3,
    );

    expect(result.value?.translation).toEqual([5, 0, 0]);
  });

  it("composes arbitrary reverse cycles in traversal order", () => {
    const result = extractLoopedRootMotionDelta(
      { position: [0.5, 0, 0], rotation: [0, 0, 0, 1] },
      { position: [1.5, 0, 0], rotation: [0, 0, 0, 1] },
      boundary,
      -3,
    );

    expect(result.value?.translation).toEqual([-5, 0, 0]);
  });

  it("rejects unsafe cycle counts", () => {
    const result = extractLoopedRootMotionDelta(
      boundary.cycleStart,
      boundary.cycleEnd,
      boundary,
      Number.MAX_VALUE,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("invalid-root-motion-loop-count");
  });
});
