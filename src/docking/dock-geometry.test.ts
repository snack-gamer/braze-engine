import { describe, expect, it } from "vitest";
import {
  calculateDockFrames,
  DEFAULT_DOCK_DOCUMENT,
  type DockSplitterFrame,
  type DockSplitNode,
} from "./layout";
import {
  clampDockTreeToRect,
  dockRatioFromArrowKey,
  dockRatioFromClientPoint,
} from "./dock-geometry";

function rootFrame(rect = { x: 10, y: 20, width: 3000, height: 900 }): DockSplitterFrame {
  return {
    split: DEFAULT_DOCK_DOCUMENT.root as DockSplitNode,
    path: [],
    rect,
    position: rect.x + rect.width * (DEFAULT_DOCK_DOCUMENT.root as DockSplitNode).ratio,
  };
}

describe("dock geometry", () => {
  it("recursively clamps hostile split ratios before calculating frames", () => {
    const root = DEFAULT_DOCK_DOCUMENT.root as DockSplitNode;
    const main = root.first as DockSplitNode;
    const hostile: DockSplitNode = {
      ...root,
      ratio: 0.99,
      first: { ...main, ratio: 0.01 },
    };
    const rect = { x: 0, y: 0, width: 1600, height: 1000 };
    const clamped = clampDockTreeToRect(hostile, rect) as DockSplitNode;
    const clampedMain = clamped.first as DockSplitNode;
    const frames = calculateDockFrames(clamped, rect);

    expect(clamped.ratio).toBeLessThan(0.99);
    expect(clampedMain.ratio).toBeGreaterThan(0.01);
    expect(frames.groups.every((frame) => frame.rect.width > 0 && frame.rect.height > 0)).toBe(true);
  });

  it("converts workspace-relative pointer positions into a split ratio", () => {
    const frame = rootFrame({ x: 10, y: 20, width: 3000, height: 900 });
    expect(dockRatioFromClientPoint(frame, { left: 100, top: 200 }, 1610, 400)).toBeCloseTo(0.5);
  });

  it("handles axis-specific arrow keys and the larger shifted step", () => {
    const frame = rootFrame();
    expect(dockRatioFromArrowKey(frame, "ArrowRight", false)).toBeCloseTo(0.825);
    expect(dockRatioFromArrowKey(frame, "ArrowLeft", true)).toBeCloseTo(0.72);
    expect(dockRatioFromArrowKey(frame, "ArrowDown", false)).toBeNull();
  });
});
