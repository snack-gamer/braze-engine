import { sampleCurveValue } from "../curves";
import { timePercent } from "../time";
import type { TransformChannelKeyframe } from "../types";
import { clampCurveVerticalZoom } from "./layout";
import type { CurveViewport, TimelineRow } from "./types";

const CURVE_HANDLE_TIME_RATIO = 0.32;
const CURVE_GRAPH_PADDING = 6;

function curveSamples(keys: TransformChannelKeyframe[], duration: number) {
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  if (sorted.length === 0) return { sorted, samples: [] as Array<{ time: number; value: number }> };
  const sampleCount = Math.max(36, Math.min(240, Math.round(duration * 36)));
  const sampleTimes = new Set<number>();
  for (let index = 0; index <= sampleCount; index += 1) sampleTimes.add((duration * index) / sampleCount);
  const nearKeyOffset = Math.max(duration / 2000, 0.0001);
  for (const key of sorted) {
    sampleTimes.add(key.time);
    if (key.time > 0) sampleTimes.add(Math.max(0, key.time - nearKeyOffset));
  }
  const samples = [...sampleTimes]
    .sort((a, b) => a - b)
    .flatMap((time) => {
      const value = sampleCurveValue(sorted, time);
      return value === null ? [] : [{ time, value }];
    });
  return { sorted, samples };
}

export function curveViewport(
  rows: TimelineRow[],
  duration: number,
  verticalZoom: number,
  verticalOffset: number,
): CurveViewport {
  const values = rows
    .filter((row) => row.kind === "channel")
    .flatMap((row) => {
      const keys = row.channel?.keys ?? [];
      const { samples } = curveSamples(keys, duration);
      return [...samples.map((sample) => sample.value), ...keys.map((key) => key.value)];
    });
  if (values.length === 0) {
    return { minValue: -1 + verticalOffset, maxValue: 1 + verticalOffset };
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;
  const padding = rawRange <= 0.0001 ? 1 : rawRange * 0.12;
  const baseCenter = (rawMin + rawMax) / 2;
  const visibleRange = Math.max((rawRange + padding * 2) / clampCurveVerticalZoom(verticalZoom), 0.0001);
  const center = baseCenter + verticalOffset;
  return { minValue: center - visibleRange / 2, maxValue: center + visibleRange / 2 };
}

export function curveGraph(
  keys: TransformChannelKeyframe[],
  duration: number,
  viewport: CurveViewport,
) {
  const { sorted, samples } = curveSamples(keys, duration);
  if (sorted.length === 0 || samples.length === 0) {
    return { path: "", points: [], handles: [], minValue: viewport.minValue, maxValue: viewport.maxValue };
  }
  const min = viewport.minValue;
  const max = viewport.maxValue;
  const range = Math.max(max - min, 0.0001);
  const point = (time: number, value: number) => ({
    x: timePercent(time, duration),
    y: 100 - CURVE_GRAPH_PADDING - ((value - min) / range) * (100 - CURVE_GRAPH_PADDING * 2),
  });
  const formatPoint = (time: number, value: number) => {
    const { x, y } = point(time, value);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const points = sorted.map((key) => ({ key, ...point(key.time, key.value) }));
  const segmentSlope = (a: TransformChannelKeyframe, b: TransformChannelKeyframe) => {
    const span = b.time - a.time;
    return span === 0 ? 0 : (b.value - a.value) / span;
  };
  const handles = sorted.flatMap((key, index) => {
    const keyPoint = point(key.time, key.value);
    const result: Array<{
      key: TransformChannelKeyframe;
      side: "in" | "out";
      keyX: number;
      keyY: number;
      x: number;
      y: number;
    }> = [];
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    if (previous) {
      const handleTime = key.time - (key.time - previous.time) * CURVE_HANDLE_TIME_RATIO;
      const tangent = Number.isFinite(key.inTangent) ? key.inTangent! : segmentSlope(previous, key);
      result.push({
        key,
        side: "in",
        keyX: keyPoint.x,
        keyY: keyPoint.y,
        ...point(handleTime, key.value + tangent * (handleTime - key.time)),
      });
    }
    if (next) {
      const handleTime = key.time + (next.time - key.time) * CURVE_HANDLE_TIME_RATIO;
      const tangent = Number.isFinite(key.outTangent) ? key.outTangent! : segmentSlope(key, next);
      result.push({
        key,
        side: "out",
        keyX: keyPoint.x,
        keyY: keyPoint.y,
        ...point(handleTime, key.value + tangent * (handleTime - key.time)),
      });
    }
    return result;
  });
  if (sorted.length === 1) {
    const { y } = point(sorted[0].time, sorted[0].value);
    return { path: `M 0,${y.toFixed(2)} L 100,${y.toFixed(2)}`, points, handles, minValue: min, maxValue: max };
  }
  const path = samples
    .map((sample, index) => `${index === 0 ? "M" : "L"} ${formatPoint(sample.time, sample.value)}`)
    .join(" ");
  return { path, points, handles, minValue: min, maxValue: max };
}

export function valueFromCurveClientY(
  clientY: number,
  graphElement: HTMLElement,
  minValue: number,
  maxValue: number,
): number | null {
  const rect = graphElement.getBoundingClientRect();
  if (rect.height <= 0) return null;
  const y = ((clientY - rect.top) / rect.height) * 100;
  const ratio = (100 - CURVE_GRAPH_PADDING - y) / (100 - CURVE_GRAPH_PADDING * 2);
  return minValue + ratio * (maxValue - minValue);
}
