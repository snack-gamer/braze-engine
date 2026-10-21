import type { DockFrames, DockRect } from "./layout";

/** Projects one existing dock group over the workspace without changing the dock document. */
export function maximizeDockFrames(
  frames: DockFrames,
  workspace: DockRect,
  groupId: string | null,
): DockFrames {
  if (!groupId) return frames;
  const maximized = frames.groups.find((frame) => frame.group.id === groupId);
  return maximized
    ? { groups: [{ ...maximized, rect: workspace }], splitters: [] }
    : frames;
}
