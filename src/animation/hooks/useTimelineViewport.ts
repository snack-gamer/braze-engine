import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { curveViewport } from "../timeline/curve-graph";
import {
  CURVE_VERTICAL_ZOOM_STEP,
  TIMELINE_ZOOM_STEP,
  clampCurveVerticalZoom,
  clampTimelineZoom,
  clampTreeWidthPercent,
  dominantWheelDelta,
  persistTreeWidthPercent,
  readTreeWidthPercent,
} from "../timeline/layout";
import type { CurveViewport, TimelineRow, ViewMode } from "../timeline/types";
import {
  createTimelineZoomAnchor,
  panCurveViewport,
  scrollLeftForZoomAnchor,
  timelineContentPoint,
  timelineTimeFromClientX,
  zoomCurveViewport,
} from "../timeline/viewport-coordinates";
import { useWindowPointerSession, type CapturedPointerSession } from "./useWindowPointerSession";

type ScheduleAfterLayout = (task: () => void) => void;

type TimelineViewportOptions = {
  active: boolean;
  rows: TimelineRow[];
  duration: number;
  viewMode: ViewMode;
  scheduleAfterLayout: ScheduleAfterLayout;
};

type TreeResizeSession = CapturedPointerSession & {
  previousCursor: string;
  previousUserSelect: string;
  nextWidth: number;
};

export function useTimelineViewport({
  active,
  rows,
  duration,
  viewMode,
  scheduleAfterLayout,
}: TimelineViewportOptions) {
  const dopesheetRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineContentRef = useRef<HTMLDivElement | null>(null);
  const shiftPressedRef = useRef(false);
  const syncScrollRef = useRef<"tree" | "timeline" | null>(null);
  const [treeWidthPercent, setTreeWidthPercent] = useState(readTreeWidthPercent);
  const [resizingTree, setResizingTree] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [curveVerticalZoom, setCurveVerticalZoom] = useState(1);
  const [manualCurveViewport, setManualCurveViewport] = useState<CurveViewport | null>(null);

  const visibleCurveViewport = useMemo(
    () => manualCurveViewport ?? curveViewport(rows, duration, curveVerticalZoom, 0),
    [curveVerticalZoom, duration, manualCurveViewport, rows],
  );

  useEffect(() => {
    if (!active) {
      shiftPressedRef.current = false;
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftPressedRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftPressedRef.current = false;
    };
    const reset = () => {
      shiftPressedRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", reset);
    };
  }, [active]);

  const timeFromClientX = useCallback((clientX: number) => {
    const rect = timelineContentRef.current?.getBoundingClientRect();
    return rect ? timelineTimeFromClientX(clientX, rect, duration) : null;
  }, [duration]);

  const contentPointFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = timelineContentRef.current?.getBoundingClientRect();
    return rect ? timelineContentPoint(clientX, clientY, rect) : null;
  }, []);

  const updateTimelineZoom = useCallback((nextZoom: number, anchorClientX?: number) => {
    const track = timelineRef.current;
    const clamped = clampTimelineZoom(nextZoom);
    if (!track) {
      setTimelineZoom(clamped);
      return;
    }
    const rect = track.getBoundingClientRect();
    const anchor = createTimelineZoomAnchor({
      anchorClientX,
      rectLeft: rect.left,
      viewportWidth: rect.width,
      scrollWidth: track.scrollWidth,
      scrollLeft: track.scrollLeft,
    });
    setTimelineZoom(clamped);
    scheduleAfterLayout(() => {
      const nextRect = track.getBoundingClientRect();
      track.scrollLeft = scrollLeftForZoomAnchor(anchor, track.scrollWidth, nextRect.width);
    });
  }, [scheduleAfterLayout]);

  const zoomTimeline = useCallback((factor: number, anchorClientX?: number) => {
    updateTimelineZoom(timelineZoom * factor, anchorClientX);
  }, [timelineZoom, updateTimelineZoom]);

  const zoomCurveVertically = useCallback((factor: number) => {
    setCurveVerticalZoom((current) => clampCurveVerticalZoom(current * factor));
    setManualCurveViewport(zoomCurveViewport(visibleCurveViewport, factor));
  }, [visibleCurveViewport]);

  const panCurves = useCallback((start: CurveViewport, pointerDeltaY: number, height: number) => {
    setManualCurveViewport(panCurveViewport(start, pointerDeltaY, height));
  }, []);

  const resetCurveView = useCallback(() => {
    setCurveVerticalZoom(1);
    setManualCurveViewport(null);
  }, []);

  const handleTimelineWheel = useCallback((event: WheelEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, select, textarea")) return;
    const delta = dominantWheelDelta(event);
    if (delta === 0) return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      if (event.cancelable) event.preventDefault();
      zoomTimeline(delta < 0 ? TIMELINE_ZOOM_STEP : 1 / TIMELINE_ZOOM_STEP, event.clientX);
      return;
    }
    const horizontalCurveWheel = viewMode === "curves"
      && event.deltaY === 0
      && Math.abs(event.deltaX) > 0;
    const shiftActive = event.shiftKey
      || event.getModifierState?.("Shift")
      || shiftPressedRef.current
      || horizontalCurveWheel;
    if (!shiftActive) return;
    if (event.cancelable) event.preventDefault();
    if (viewMode === "curves") {
      zoomCurveVertically(delta < 0 ? CURVE_VERTICAL_ZOOM_STEP : 1 / CURVE_VERTICAL_ZOOM_STEP);
    } else if (timelineRef.current) {
      timelineRef.current.scrollLeft += delta;
    }
  }, [viewMode, zoomCurveVertically, zoomTimeline]);

  useEffect(() => {
    const container = dopesheetRef.current;
    if (!container) return undefined;
    container.addEventListener("wheel", handleTimelineWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleTimelineWheel);
  }, [handleTimelineWheel]);

  const syncVerticalScroll = useCallback((source: "tree" | "timeline") => {
    const tree = treeRef.current;
    const timeline = timelineRef.current;
    if (!tree || !timeline) return;
    if (syncScrollRef.current && syncScrollRef.current !== source) return;
    syncScrollRef.current = source;
    if (source === "tree") timeline.scrollTop = tree.scrollTop;
    else tree.scrollTop = timeline.scrollTop;
    scheduleAfterLayout(() => {
      if (syncScrollRef.current === source) syncScrollRef.current = null;
    });
  }, [scheduleAfterLayout]);

  const widthFromPointer = useCallback((clientX: number) => {
    const rect = dopesheetRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return treeWidthPercent;
    return clampTreeWidthPercent(((clientX - rect.left) / rect.width) * 100, rect.width);
  }, [treeWidthPercent]);

  const restoreTreeResize = useCallback((session: TreeResizeSession) => {
    const body = window.document.body;
    body.style.cursor = session.previousCursor;
    body.style.userSelect = session.previousUserSelect;
    setResizingTree(false);
    persistTreeWidthPercent(session.nextWidth);
  }, []);
  const treeResize = useWindowPointerSession<TreeResizeSession>(
    (session, event) => {
      session.nextWidth = widthFromPointer(event.clientX);
      setTreeWidthPercent(session.nextWidth);
    },
    restoreTreeResize,
    restoreTreeResize,
  );

  const startTreeResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const body = window.document.body;
    const nextWidth = widthFromPointer(event.clientX);
    setResizingTree(true);
    setTreeWidthPercent(nextWidth);
    const session: TreeResizeSession = {
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      previousCursor: body.style.cursor,
      previousUserSelect: body.style.userSelect,
      nextWidth,
    };
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";
    treeResize.start(session);
  }, [treeResize, widthFromPointer]);

  const resizeTreeWithKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = event.shiftKey ? 8 : 2;
    const width = dopesheetRef.current?.getBoundingClientRect().width;
    const next = clampTreeWidthPercent(
      treeWidthPercent + (event.key === "ArrowRight" ? amount : -amount),
      width,
    );
    setTreeWidthPercent(next);
    persistTreeWidthPercent(next);
  }, [treeWidthPercent]);

  return {
    dopesheetRef,
    treeRef,
    timelineRef,
    timelineContentRef,
    treeWidthPercent,
    resizingTree,
    timelineZoom,
    curveVerticalZoom,
    visibleCurveViewport,
    setManualCurveViewport,
    timeFromClientX,
    contentPointFromClient,
    zoomTimeline,
    panCurves,
    resetCurveView,
    syncVerticalScroll,
    startTreeResize,
    resizeTreeWithKeyboard,
  };
}
