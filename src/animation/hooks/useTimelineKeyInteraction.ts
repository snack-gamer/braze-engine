import {
  useCallback,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { valueFromCurveClientY } from "../timeline/curve-graph";
import {
  moveKeyTimes,
  moveKeyValues,
  resolveCurveDragAxis,
  stretchKeyTimes,
  type KeyDragSnapshot,
} from "../timeline/drag-calculations";
import { keyRefId } from "../timeline/keyframes";
import {
  entriesForSelectedKeyIds,
  selectionAfterKeyPress,
  type TimelineKeyIndex,
  type TimelineSelectionRange,
} from "../timeline/selection";
import type {
  CurveViewport,
  TimelineKey,
  TimelineRow,
} from "../timeline/types";
import type {
  TransformAnimationTrack,
  TransformChannelKeyframe,
  TransformChannelKeyframeRef,
} from "../types";
import type { SceneAnimationController } from "./useSceneAnimation";
import { useWindowPointerSession, type CapturedPointerSession } from "./useWindowPointerSession";

type KeyDragSession = CapturedPointerSession & {
  startX: number;
  startY: number;
  startTime: number;
  axisLock: "time" | "value" | null;
  currentTime: number;
  moved: boolean;
  selection: KeyDragSnapshot[];
  curve?: {
    graphElement: HTMLElement;
    minValue: number;
    maxValue: number;
    startValue: number;
    currentValue: number;
  };
};

type StretchDragSession = CapturedPointerSession & {
  anchorTime: number;
  movingTime: number;
  selection: Array<{ ref: TransformChannelKeyframeRef; startTime: number }>;
};

type KeyInteractionOptions = {
  controller: SceneAnimationController;
  tracksByObject: ReadonlyMap<string, TransformAnimationTrack>;
  keyIndex: TimelineKeyIndex;
  selectedKeyIdsRef: RefObject<Set<string>>;
  setSelectedKeyIds: Dispatch<SetStateAction<Set<string>>>;
  selectedKeyEntries: ReturnType<typeof entriesForSelectedKeyIds>;
  selectionTimeRange: TimelineSelectionRange | null;
  epsilon: number;
  timelineContentRef: RefObject<HTMLDivElement | null>;
  timeFromClientX: (clientX: number) => number | null;
  snapTimelineTime: (time: number) => number;
  setSelectedRowId: (rowId: string) => void;
  setManualCurveViewport: (viewport: CurveViewport) => void;
  refsForTimelineKey: (
    row: TimelineRow,
    key: Pick<TimelineKey, "time" | "id">,
  ) => TransformChannelKeyframeRef[];
};

export function useTimelineKeyInteraction(options: KeyInteractionOptions) {
  const suppressNextKeyClickRef = useRef(false);
  const keyDrag = useWindowPointerSession<KeyDragSession>(
    (drag, event) => {
      const rawTime = options.timeFromClientX(event.clientX);
      if (rawTime === null) return;
      const movedX = Math.abs(event.clientX - drag.startX);
      const movedY = Math.abs(event.clientY - drag.startY);
      if (movedX > 3 || movedY > 3) drag.moved = true;
      if (drag.curve) drag.axisLock = resolveCurveDragAxis(drag.axisLock, movedX, movedY);
      const nextTime = options.snapTimelineTime(rawTime);
      if ((!drag.curve || drag.axisLock !== "value") && nextTime !== drag.currentTime) {
        options.controller.updateChannelKeyframes(moveKeyTimes(drag.selection, drag.startTime, nextTime));
        drag.currentTime = nextTime;
      }
      if (!drag.curve || drag.axisLock === "time") return;
      const nextValue = valueFromCurveClientY(
        event.clientY,
        drag.curve.graphElement,
        drag.curve.minValue,
        drag.curve.maxValue,
      );
      if (nextValue === null || Math.abs(nextValue - drag.curve.currentValue) <= 0.0001) return;
      options.controller.updateChannelKeyframes(
        moveKeyValues(drag.selection, drag.curve.startValue, nextValue),
      );
      drag.curve.currentValue = nextValue;
    },
    (drag) => {
      if (drag.moved) suppressNextKeyClickRef.current = true;
      else options.controller.setPlayhead(drag.currentTime);
    },
  );

  const startKeyDrag = useCallback((
    row: TimelineRow,
    key: TimelineKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    options.setSelectedRowId(row.id);
    const refs = options.refsForTimelineKey(row, key);
    if (refs.length === 0) return;
    const keyIds = refs.map(keyRefId);
    const selection = selectionAfterKeyPress(options.selectedKeyIdsRef.current, keyIds, {
      extend: event.shiftKey,
      toggle: event.metaKey || event.ctrlKey,
    });
    options.setSelectedKeyIds(selection.selectedIds);
    const snapshots = entriesForSelectedKeyIds(selection.dragIds, options.keyIndex).map((entry) => ({
      ref: entry.ref,
      startTime: entry.key.time,
      startValue: entry.key.value,
    }));
    if (snapshots.length === 0) return;
    const startTime = options.snapTimelineTime(key.time);
    keyDrag.start({
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startTime,
      axisLock: null,
      currentTime: startTime,
      moved: false,
      selection: snapshots,
    });
  }, [keyDrag, options]);

  const startCurveKeyDrag = useCallback((
    row: TimelineRow,
    key: TransformChannelKeyframe,
    graph: { minValue: number; maxValue: number },
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!row.channel || !options.tracksByObject.has(row.objectId)) return;
    const graphElement = options.timelineContentRef.current;
    if (!graphElement) return;
    startKeyDrag(row, key, event);
    const drag = keyDrag.sessionRef.current;
    if (!drag) return;
    options.setManualCurveViewport({ minValue: graph.minValue, maxValue: graph.maxValue });
    drag.curve = {
      graphElement,
      minValue: graph.minValue,
      maxValue: graph.maxValue,
      startValue: key.value,
      currentValue: key.value,
    };
  }, [keyDrag.sessionRef, options, startKeyDrag]);

  const stretchDrag = useWindowPointerSession<StretchDragSession>(
    (drag, event) => {
      const rawTime = options.timeFromClientX(event.clientX);
      if (rawTime === null) return;
      const updates = stretchKeyTimes(
        drag.selection,
        drag.anchorTime,
        drag.movingTime,
        options.snapTimelineTime(rawTime),
      );
      if (updates.length > 0) options.controller.updateChannelKeyframes(updates);
    },
    () => undefined,
  );

  const startSelectionStretchDrag = useCallback((
    side: "left" | "right",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const range = options.selectionTimeRange;
    if (event.button !== 0 || !range) return;
    const selection = options.selectedKeyEntries.map((entry) => ({
      ref: entry.ref,
      startTime: entry.key.time,
    }));
    if (selection.length < 2 || Math.abs(range.maxTime - range.minTime) <= options.epsilon) return;
    event.preventDefault();
    event.stopPropagation();
    stretchDrag.start({
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      anchorTime: side === "left" ? range.maxTime : range.minTime,
      movingTime: side === "left" ? range.minTime : range.maxTime,
      selection,
    });
  }, [options, stretchDrag]);

  return {
    suppressNextKeyClickRef,
    startKeyDrag,
    startCurveKeyDrag,
    startSelectionStretchDrag,
  };
}
