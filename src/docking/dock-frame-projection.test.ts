import { describe, expect, it } from "vitest";
import { calculateDockFrames, DEFAULT_DOCK_DOCUMENT } from "./layout";
import { maximizeDockFrames } from "./dock-frame-projection";

describe("dock frame projection", () => {
  it("fills the workspace with one group without mutating the dock tree frames", () => {
    const workspace = { x: 0, y: 0, width: 1200, height: 800 };
    const frames = calculateDockFrames(DEFAULT_DOCK_DOCUMENT.root, workspace);
    const maximized = maximizeDockFrames(frames, workspace, "project-group");

    expect(maximized.groups).toEqual([{
      group: expect.objectContaining({ id: "project-group" }),
      rect: workspace,
    }]);
    expect(maximized.splitters).toEqual([]);
    expect(frames.groups).toHaveLength(4);
    expect(frames.splitters).toHaveLength(3);
  });

  it("leaves frames intact when focus mode is off or its group disappeared", () => {
    const workspace = { x: 0, y: 0, width: 1200, height: 800 };
    const frames = calculateDockFrames(DEFAULT_DOCK_DOCUMENT.root, workspace);
    expect(maximizeDockFrames(frames, workspace, null)).toBe(frames);
    expect(maximizeDockFrames(frames, workspace, "missing-group")).toBe(frames);
  });
});
