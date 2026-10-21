import type { CSSProperties } from "react";
import { clampDockRatioForSplit, type DockSplitterFrame } from "./layout";
import type { EditorDockController } from "./dock-workspace-types";
import { useDockSplitterInteraction } from "./useDockSplitterInteraction";

type DockSplitterProps = {
  frame: DockSplitterFrame;
  controller: EditorDockController;
};

export function DockSplitter({ frame, controller }: DockSplitterProps) {
  const horizontal = frame.split.axis === "horizontal";
  const available = horizontal ? frame.rect.width : frame.rect.height;
  const minimum = clampDockRatioForSplit(frame.split, available, 0);
  const maximum = clampDockRatioForSplit(frame.split, available, 1);
  const pathValue = frame.path.length > 0 ? frame.path.join(".") : "root";
  const style: CSSProperties = horizontal
    ? { left: `${frame.position}px`, top: `${frame.rect.y}px`, height: `${frame.rect.height}px` }
    : { left: `${frame.rect.x}px`, top: `${frame.position}px`, width: `${frame.rect.width}px` };
  const interaction = useDockSplitterInteraction({
    frame,
    setSplitRatio: controller.setSplitRatio,
  });

  return (
    <div
      className={`editor-dock-splitter editor-dock-splitter--${frame.split.axis} ${interaction.resizing ? "is-resizing" : ""}`}
      style={style}
      role="separator"
      tabIndex={0}
      data-dock-split-path={pathValue}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={`Resize ${horizontal ? "left and right" : "top and bottom"} dock groups`}
      aria-valuemin={Math.round(minimum * 100)}
      aria-valuemax={Math.round(maximum * 100)}
      aria-valuenow={Math.round(frame.split.ratio * 100)}
      onPointerDown={interaction.beginResize}
      onKeyDown={interaction.resizeWithKeyboard}
    />
  );
}
