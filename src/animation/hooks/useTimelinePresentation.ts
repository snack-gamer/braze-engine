import { useMemo } from "react";
import { buildCurvePresentations, buildTimelineMarkers } from "../timeline/presentation";
import { selectedTimelineRange, type TimelineKeyIndex } from "../timeline/selection";
import type { CurveViewport, TimelineRow, ViewMode } from "../timeline/types";

type TimelinePresentationOptions = {
  viewMode: ViewMode;
  rows: TimelineRow[];
  duration: number;
  epsilon: number;
  keyIndex: TimelineKeyIndex;
  selectedKeyIds: ReadonlySet<string>;
  curveViewport: CurveViewport;
};

export function useTimelinePresentation(options: TimelinePresentationOptions) {
  const curves = useMemo(
    () => buildCurvePresentations(options.rows, options.duration, options.curveViewport),
    [options.curveViewport, options.duration, options.rows],
  );
  const visibleKeyMarkers = useMemo(
    () => buildTimelineMarkers({
      viewMode: options.viewMode,
      rows: options.rows,
      curves,
      duration: options.duration,
      epsilon: options.epsilon,
      keyIndex: options.keyIndex,
    }),
    [curves, options.duration, options.epsilon, options.keyIndex, options.rows, options.viewMode],
  );
  const selectionTimeRange = useMemo(
    () => selectedTimelineRange(visibleKeyMarkers, options.selectedKeyIds, options.duration),
    [options.duration, options.selectedKeyIds, visibleKeyMarkers],
  );
  return { curves, visibleKeyMarkers, selectionTimeRange };
}
