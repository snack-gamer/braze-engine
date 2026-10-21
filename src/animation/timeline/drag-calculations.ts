import type {
  TransformChannelKeyframeRef,
  TransformChannelKeyframeUpdate,
} from "../types";

export type KeyDragSnapshot = {
  ref: TransformChannelKeyframeRef;
  startTime: number;
  startValue: number;
};

export function resolveCurveDragAxis(
  current: "time" | "value" | null,
  movedX: number,
  movedY: number,
  threshold = 4,
): "time" | "value" | null {
  if (current || (movedX <= threshold && movedY <= threshold)) return current;
  return movedY > movedX ? "value" : "time";
}

export function moveKeyTimes(
  selection: KeyDragSnapshot[],
  startPointerTime: number,
  nextPointerTime: number,
): TransformChannelKeyframeUpdate[] {
  const delta = nextPointerTime - startPointerTime;
  return selection.map(({ ref, startTime }) => ({ ...ref, time: startTime + delta }));
}

export function moveKeyValues(
  selection: KeyDragSnapshot[],
  startPointerValue: number,
  nextPointerValue: number,
): TransformChannelKeyframeUpdate[] {
  const delta = nextPointerValue - startPointerValue;
  return selection.map(({ ref, startValue }) => ({ ...ref, value: startValue + delta }));
}

export function stretchKeyTimes(
  selection: Array<{ ref: TransformChannelKeyframeRef; startTime: number }>,
  anchorTime: number,
  movingTime: number,
  nextMovingTime: number,
): TransformChannelKeyframeUpdate[] {
  const denominator = movingTime - anchorTime;
  if (Math.abs(denominator) <= 0.0001) return [];
  const scale = (nextMovingTime - anchorTime) / denominator;
  return selection.map(({ ref, startTime }) => ({
    ...ref,
    time: anchorTime + (startTime - anchorTime) * scale,
  }));
}

type CurveHandleTangentInput = {
  side: "in" | "out";
  rawTime: number;
  value: number;
  keyTime: number;
  keyValue: number;
  fps: number;
  duration: number;
};

export function curveHandleTangent(input: CurveHandleTangentInput): number {
  const minTimeDelta = Math.max(1 / Math.max(input.fps, 1), input.duration / 1000);
  const handleTime = input.side === "out"
    ? Math.max(input.rawTime, input.keyTime + minTimeDelta)
    : Math.min(input.rawTime, input.keyTime - minTimeDelta);
  return (input.value - input.keyValue) / (handleTime - input.keyTime);
}
