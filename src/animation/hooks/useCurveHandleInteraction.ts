import {
  useCallback,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { valueFromCurveClientY } from "../timeline/curve-graph";
import { curveHandleTangent } from "../timeline/drag-calculations";
import type { CurveViewport, TimelineRow } from "../timeline/types";
import type { TransformAnimationTrack, TransformChannelKeyframe } from "../types";
import type { SceneAnimationController } from "./useSceneAnimation";
import { useWindowPointerSession, type CapturedPointerSession } from "./useWindowPointerSession";

type CurveHandleDragSession = CapturedPointerSession & {
  side: "in" | "out";
  graphElement: HTMLElement;
  trackId: string;
  channelId: string;
  keyframeId: string;
  keyTime: number;
  keyValue: number;
  minValue: number;
  maxValue: number;
};

type CurveHandleInteractionOptions = {
  controller: SceneAnimationController;
  tracksByObject: ReadonlyMap<string, TransformAnimationTrack>;
  timelineContentRef: RefObject<HTMLDivElement | null>;
  duration: number;
  fps: number;
  timeFromClientX: (clientX: number) => number | null;
  setSelectedRowId: (rowId: string) => void;
  setManualCurveViewport: (viewport: CurveViewport) => void;
};

export function useCurveHandleInteraction(options: CurveHandleInteractionOptions) {
  const drag = useWindowPointerSession<CurveHandleDragSession>(
    (session, event) => {
      const rawTime = options.timeFromClientX(event.clientX);
      const value = valueFromCurveClientY(
        event.clientY,
        session.graphElement,
        session.minValue,
        session.maxValue,
      );
      if (rawTime === null || value === null) return;
      options.controller.setChannelKeyframeTangent(
        session.trackId,
        session.channelId,
        session.keyframeId,
        session.side,
        curveHandleTangent({
          side: session.side,
          rawTime,
          value,
          keyTime: session.keyTime,
          keyValue: session.keyValue,
          fps: options.fps,
          duration: options.duration,
        }),
      );
    },
    () => undefined,
  );

  const startCurveHandleDrag = useCallback((
    row: TimelineRow,
    key: TransformChannelKeyframe,
    side: "in" | "out",
    graph: { minValue: number; maxValue: number },
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!row.channel || event.button !== 0) return;
    const graphElement = options.timelineContentRef.current;
    const trackId = options.tracksByObject.get(row.objectId)?.id;
    if (!graphElement || !trackId) return;
    event.preventDefault();
    event.stopPropagation();
    options.setSelectedRowId(row.id);
    options.controller.setPlayhead(key.time);
    options.setManualCurveViewport({ minValue: graph.minValue, maxValue: graph.maxValue });
    drag.start({
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      side,
      graphElement,
      trackId,
      channelId: row.channel.id,
      keyframeId: key.id,
      keyTime: key.time,
      keyValue: key.value,
      minValue: graph.minValue,
      maxValue: graph.maxValue,
    });
  }, [drag, options]);

  return { startCurveHandleDrag };
}
