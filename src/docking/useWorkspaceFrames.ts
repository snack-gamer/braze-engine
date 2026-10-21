import {
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import {
  calculateDockFrames,
  type DockFrames,
  type DockLayoutNode,
} from "./layout";
import { clampDockTreeToRect } from "./dock-geometry";
import { maximizeDockFrames } from "./dock-frame-projection";

/** Measures the workspace and projects the dock tree into presentation frames. */
export function useWorkspaceFrames(
  root: DockLayoutNode,
  workspaceRef: RefObject<HTMLElement | null>,
  maximizedGroupId: string | null = null,
): DockFrames {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = () => {
      const rect = workspace.getBoundingClientRect();
      setSize((current) => current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [workspaceRef]);

  return useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return { groups: [], splitters: [] };
    const rect = { x: 0, y: 0, width: size.width, height: size.height };
    const frames = calculateDockFrames(clampDockTreeToRect(root, rect), rect);
    return maximizeDockFrames(frames, rect, maximizedGroupId);
  }, [maximizedGroupId, root, size.height, size.width]);
}
