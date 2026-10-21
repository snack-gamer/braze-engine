import { describe, expect, it } from "vitest";
import { calculateAssetVirtualWindow } from "./virtual-window";

describe("calculateAssetVirtualWindow", () => {
  it("bounds a thousands-item grid to visible rows plus overscan", () => {
    const window = calculateAssetVirtualWindow({
      mode: "grid",
      itemCount: 5_000,
      viewportWidth: 800,
      viewportHeight: 600,
      scrollTop: 20_000,
      tileSize: 72,
      swatchSize: 50,
    });

    expect(window.columns).toBe(10);
    expect(window.startIndex).toBeGreaterThan(0);
    expect(window.endIndex).toBeLessThan(5_000);
    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(130);
    expect(window.totalHeight).toBeGreaterThan(39_000);
  });

  it("bounds a thousands-item list and clamps the last window", () => {
    const window = calculateAssetVirtualWindow({
      mode: "list",
      itemCount: 10_000,
      viewportWidth: 420,
      viewportHeight: 440,
      scrollTop: 219_571,
      tileSize: 72,
      swatchSize: 50,
    });

    expect(window.startIndex).toBeLessThanOrEqual(10_000);
    expect(window.endIndex).toBe(10_000);
    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(24);
    expect(window.totalHeight).toBe(220_011);
  });

  it("returns an empty range for an empty catalog", () => {
    const window = calculateAssetVirtualWindow({
      mode: "grid",
      itemCount: 0,
      viewportWidth: 500,
      viewportHeight: 500,
      scrollTop: 0,
      tileSize: 72,
      swatchSize: 50,
    });
    expect([window.startIndex, window.endIndex]).toEqual([0, 0]);
  });
});
