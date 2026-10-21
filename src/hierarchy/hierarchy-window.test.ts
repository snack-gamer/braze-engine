import { describe, expect, it } from "vitest";
import { hierarchyWindowRange } from "./hierarchy-window";

describe("hierarchy window range", () => {
  it("returns an empty range for an empty hierarchy", () => {
    expect(hierarchyWindowRange(0, 0, 220, 22, 2)).toEqual({
      start: 0, end: 0, beforeHeight: 0, afterHeight: 0,
    });
  });

  it("windows the start with overscan and exact spacer heights", () => {
    expect(hierarchyWindowRange(1_000, 0, 220, 22, 2)).toEqual({
      start: 0,
      end: 12,
      beforeHeight: 0,
      afterHeight: 21_736,
    });
  });

  it("windows a middle scroll position without mounting the skipped rows", () => {
    expect(hierarchyWindowRange(1_000, 11_000, 220, 22, 3)).toEqual({
      start: 497,
      end: 513,
      beforeHeight: 10_934,
      afterHeight: 10_714,
    });
  });

  it("clamps the range and trailing spacer at the end", () => {
    const range = hierarchyWindowRange(100, 10_000, 220, 22, 4);
    expect(range.end).toBe(100);
    expect(range.afterHeight).toBe(0);
    expect(range.start).toBeLessThan(range.end);
  });
});
