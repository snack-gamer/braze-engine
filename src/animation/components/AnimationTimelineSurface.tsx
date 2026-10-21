import type {
  CSSProperties,
  KeyboardEventHandler,
  PointerEvent as ReactPointerEvent,
  PointerEventHandler,
  RefObject,
} from "react";
import { AnimationPropertyTree } from "./AnimationPropertyTree";
import { AnimationCurveLayer } from "./AnimationCurveLayer";
import { AnimationTimelineRows } from "./AnimationTimelineRows";
import { AnimationTimelineSelection } from "./AnimationTimelineSelection";
import { MAX_TREE_WIDTH_PERCENT, MIN_TREE_WIDTH_PERCENT } from "../timeline/layout";
import type { TimelineCurvePresentation } from "../timeline/presentation";
import type { TimelineSelectionRange } from "../timeline/selection";
import type { LassoRect, TimelineKey, TimelineRow, ViewMode } from "../timeline/types";
import type { TransformChannelKeyframe, TransformChannelTarget } from "../types";

type AnimationTimelineSurfaceProps = {
  viewMode: ViewMode;
  duration: number;
  fps: number;
  rows: TimelineRow[];
  curves: TimelineCurvePresentation[];
  selectedRowId?: string;
  expandedRows: Set<string>;
  selectedKeyCount: number;
  selectionRange: TimelineSelectionRange | null;
  lassoRect: LassoRect | null;
  treeWidthPercent: number;
  timelineZoom: number;
  resizingTree: boolean;
  panningTimeline: boolean;
  dopesheetRef: RefObject<HTMLDivElement | null>;
  treeRef: RefObject<HTMLDivElement | null>;
  timelineRef: RefObject<HTMLDivElement | null>;
  timelineContentRef: RefObject<HTMLDivElement | null>;
  playheadLineRef: RefObject<HTMLDivElement | null>;
  suppressNextKeyClickRef: RefObject<boolean>;
  isKeySelected: (row: TimelineRow, key: TimelineKey) => boolean;
  onSelectRow: (rowId: string) => void;
  onToggleExpanded: (rowId: string) => void;
  onSetChannelValue: (target: TransformChannelTarget, value: number) => void;
  onSetPlayhead: (time: number) => void;
  onTreeScroll: () => void;
  onTimelineScroll: () => void;
  onStartTreeResize: PointerEventHandler<HTMLDivElement>;
  onResizeTreeWithKeyboard: KeyboardEventHandler<HTMLDivElement>;
  onTimelinePointerDown: PointerEventHandler<HTMLDivElement>;
  onTimelinePointerMove: PointerEventHandler<HTMLDivElement>;
  onTimelinePointerStop: PointerEventHandler<HTMLDivElement>;
  onStartKeyDrag: (row: TimelineRow, key: TimelineKey, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onStartCurveKeyDrag: (
    row: TimelineRow,
    key: TransformChannelKeyframe,
    graph: TimelineCurvePresentation["graph"],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onStartCurveHandleDrag: (
    row: TimelineRow,
    key: TransformChannelKeyframe,
    side: "in" | "out",
    graph: TimelineCurvePresentation["graph"],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onStartSelectionStretch: (
    side: "left" | "right",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function AnimationTimelineSurface(props: AnimationTimelineSurfaceProps) {
  return (
    <div
      ref={props.dopesheetRef}
      className={props.resizingTree ? "animation-dopesheet resizing-tree" : "animation-dopesheet"}
      style={{ "--animation-tree-width": `${props.treeWidthPercent}%` } as CSSProperties}
    >
      <AnimationPropertyTree
        treeRef={props.treeRef}
        rows={props.rows}
        selectedRowId={props.selectedRowId}
        expandedRows={props.expandedRows}
        onSelectRow={props.onSelectRow}
        onToggleExpanded={props.onToggleExpanded}
        onScroll={props.onTreeScroll}
        onSetChannelValue={props.onSetChannelValue}
      />
      <div
        className="animation-dopesheet__splitter"
        role="separator"
        aria-label="Resize animation property list"
        aria-orientation="vertical"
        aria-valuemin={MIN_TREE_WIDTH_PERCENT}
        aria-valuemax={MAX_TREE_WIDTH_PERCENT}
        aria-valuenow={Math.round(props.treeWidthPercent)}
        tabIndex={0}
        onPointerDown={props.onStartTreeResize}
        onKeyDown={props.onResizeTreeWithKeyboard}
      />
      <div
        ref={props.timelineRef}
        className={`animation-dopesheet__tracks${props.panningTimeline ? " panning" : ""}`}
        onPointerDown={props.onTimelinePointerDown}
        onPointerMove={props.onTimelinePointerMove}
        onPointerUp={props.onTimelinePointerStop}
        onPointerCancel={props.onTimelinePointerStop}
        onScroll={props.onTimelineScroll}
        onAuxClick={(event) => event.preventDefault()}
      >
        <div
          ref={props.timelineContentRef}
          className="animation-dopesheet__content"
          style={{ width: `${props.timelineZoom * 100}%` }}
        >
          <div className="animation-dopesheet__ticks" />
          <AnimationTimelineRows
            rows={props.rows}
            selectedRowId={props.selectedRowId}
            showKeys={props.viewMode === "dopesheet"}
            duration={props.duration}
            fps={props.fps}
            suppressNextKeyClickRef={props.suppressNextKeyClickRef}
            isKeySelected={props.isKeySelected}
            onSelectRow={props.onSelectRow}
            onSetPlayhead={props.onSetPlayhead}
            onStartKeyDrag={props.onStartKeyDrag}
          />
          {props.viewMode === "curves" && (
            <AnimationCurveLayer
              curves={props.curves}
              selectedRowId={props.selectedRowId}
              fps={props.fps}
              isKeySelected={props.isKeySelected}
              onStartKeyDrag={props.onStartCurveKeyDrag}
              onStartHandleDrag={props.onStartCurveHandleDrag}
            />
          )}
          <AnimationTimelineSelection
            range={props.selectionRange}
            selectedKeyCount={props.selectedKeyCount}
            lassoRect={props.lassoRect}
            onStartStretch={props.onStartSelectionStretch}
          />
          <div ref={props.playheadLineRef} className="animation-dopesheet__playhead" />
        </div>
      </div>
    </div>
  );
}
