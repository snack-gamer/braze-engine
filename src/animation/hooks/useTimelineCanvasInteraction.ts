import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { lassoBounds } from "../timeline/layout";
import { keyIdsInsideLasso } from "../timeline/selection";
import type {
  CurveViewport,
  LassoRect,
  TimelineKeyMarker,
  ViewMode,
} from "../timeline/types";

type TimelineDragState = {
  mode: "scrub" | "select" | "pan";
  pointerId: number;
  startX: number;
  startY: number;
  startContentX: number;
  startContentY: number;
  startScrollLeft: number;
  selectionBaseIds: Set<string>;
  additiveSelection: boolean;
  lassoActive: boolean;
  startCurveViewport: CurveViewport;
};

type TimelineCanvasInteractionOptions = {
  viewMode: ViewMode;
  visibleCurveViewport: CurveViewport;
  visibleKeyMarkers: TimelineKeyMarker[];
  selectedKeyIdsRef: RefObject<Set<string>>;
  setSelectedKeyIds: Dispatch<SetStateAction<Set<string>>>;
  timelineContentRef: RefObject<HTMLDivElement | null>;
  contentPointFromClient: (clientX: number, clientY: number) => {
    x: number;
    y: number;
  } | null;
  timeFromClientX: (clientX: number) => number | null;
  setPlayhead: (time: number) => void;
  panCurves: (start: CurveViewport, pointerDeltaY: number, height: number) => void;
};

export function useTimelineCanvasInteraction({
  viewMode,
  visibleCurveViewport,
  visibleKeyMarkers,
  selectedKeyIdsRef,
  setSelectedKeyIds,
  timelineContentRef,
  contentPointFromClient,
  timeFromClientX,
  setPlayhead,
  panCurves,
}: TimelineCanvasInteractionOptions) {
  const dragRef = useRef<TimelineDragState | null>(null);
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const [panningTimeline, setPanningTimeline] = useState(false);

  const setTimeFromClientX = useCallback((clientX: number) => {
    const time = timeFromClientX(clientX);
    if (time !== null) setPlayhead(time);
  }, [setPlayhead, timeFromClientX]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("button, input, .animation-dopesheet__splitter")) return;
    const point = contentPointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const mode = event.button === 1 || event.altKey
      ? "pan"
      : event.shiftKey
        ? "select"
        : "scrub";
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startContentX: point.x,
      startContentY: point.y,
      startScrollLeft: event.currentTarget.scrollLeft,
      selectionBaseIds: new Set(selectedKeyIdsRef.current),
      additiveSelection: event.shiftKey || event.metaKey || event.ctrlKey,
      lassoActive: false,
      startCurveViewport: visibleCurveViewport,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "pan") {
      setPanningTimeline(true);
      event.preventDefault();
    } else if (mode === "scrub") {
      setTimeFromClientX(event.clientX);
    }
  }, [contentPointFromClient, selectedKeyIdsRef, setTimeFromClientX, visibleCurveViewport]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const movedX = Math.abs(event.clientX - drag.startX);
    const movedY = Math.abs(event.clientY - drag.startY);
    if (drag.mode === "pan") {
      event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
      if (viewMode === "curves") {
        panCurves(
          drag.startCurveViewport,
          event.clientY - drag.startY,
          event.currentTarget.getBoundingClientRect().height,
        );
      }
      event.preventDefault();
      return;
    }
    if (drag.mode === "scrub") {
      setTimeFromClientX(event.clientX);
      return;
    }
    if (movedX <= 4 && movedY <= 4) return;
    const point = contentPointFromClient(event.clientX, event.clientY);
    const content = timelineContentRef.current?.getBoundingClientRect();
    if (!point || !content) return;
    drag.lassoActive = true;
    const rect = lassoBounds(drag.startContentX, drag.startContentY, point.x, point.y);
    setLassoRect(rect);
    const hitIds = keyIdsInsideLasso(
      visibleKeyMarkers,
      rect,
      { width: content.width, height: content.height },
      viewMode === "curves",
    );
    if (drag.additiveSelection) {
      const next = new Set(drag.selectionBaseIds);
      for (const id of hitIds) next.add(id);
      setSelectedKeyIds(next);
    } else {
      setSelectedKeyIds(hitIds);
    }
    event.preventDefault();
  }, [contentPointFromClient, panCurves, setSelectedKeyIds, setTimeFromClientX, timelineContentRef, viewMode, visibleKeyMarkers]);

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setPanningTimeline(false);
    setLassoRect(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.mode === "select" && !drag.lassoActive && !drag.additiveSelection) {
      setSelectedKeyIds(new Set());
    }
  }, [setSelectedKeyIds]);

  return { lassoRect, panningTimeline, handlePointerDown, handlePointerMove, stopDragging };
}
