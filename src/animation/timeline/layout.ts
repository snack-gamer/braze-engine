import type { LassoRect } from "./types";

const TREE_WIDTH_KEY = "tgan.animationTreeWidthPercent.v2";
const DEFAULT_TREE_WIDTH_PERCENT = 32;
export const MIN_TREE_WIDTH_PERCENT = 22;
export const MAX_TREE_WIDTH_PERCENT = 72;
const MIN_TREE_WIDTH_PX = 150;
const MIN_TIMELINE_WIDTH_PX = 180;
const SPLITTER_WIDTH_PX = 7;

export const MIN_TIMELINE_ZOOM = 1;
export const MAX_TIMELINE_ZOOM = 16;
export const TIMELINE_ZOOM_STEP = 1.22;
export const MIN_CURVE_VERTICAL_ZOOM = 0.25;
export const MAX_CURVE_VERTICAL_ZOOM = 16;
export const CURVE_VERTICAL_ZOOM_STEP = 1.18;

export function clampTreeWidthPercent(value: number, containerWidth?: number): number {
  let min = MIN_TREE_WIDTH_PERCENT;
  let max = MAX_TREE_WIDTH_PERCENT;
  if (containerWidth && containerWidth > 0) {
    min = Math.max(min, (MIN_TREE_WIDTH_PX / containerWidth) * 100);
    max = Math.min(max, ((containerWidth - MIN_TIMELINE_WIDTH_PX - SPLITTER_WIDTH_PX) / containerWidth) * 100);
  }
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.min(upper, Math.max(lower, value));
}

export function readTreeWidthPercent(): number {
  if (typeof window === "undefined") return DEFAULT_TREE_WIDTH_PERCENT;
  try {
    const raw = window.localStorage.getItem(TREE_WIDTH_KEY);
    if (!raw) return DEFAULT_TREE_WIDTH_PERCENT;
    const stored = Number(raw);
    return Number.isFinite(stored) ? clampTreeWidthPercent(stored) : DEFAULT_TREE_WIDTH_PERCENT;
  } catch {
    return DEFAULT_TREE_WIDTH_PERCENT;
  }
}

export function persistTreeWidthPercent(value: number): void {
  try {
    window.localStorage.setItem(TREE_WIDTH_KEY, String(Math.round(value * 10) / 10));
  } catch {
    // Layout persistence is non-critical.
  }
}

export function clampTimelineZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_TIMELINE_ZOOM;
  return Math.min(MAX_TIMELINE_ZOOM, Math.max(MIN_TIMELINE_ZOOM, value));
}

export function clampCurveVerticalZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_CURVE_VERTICAL_ZOOM, Math.max(MIN_CURVE_VERTICAL_ZOOM, value));
}

export function dominantWheelDelta(event: WheelEvent): number {
  return Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
}

export function lassoBounds(startX: number, startY: number, endX: number, endY: number): LassoRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}
