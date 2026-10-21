import type { CurveViewport } from "./types";

export type ClientRectBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TimelineZoomAnchor = {
  viewportX: number;
  contentRatio: number;
};

export function timelineTimeFromClientX(
  clientX: number,
  rect: Pick<ClientRectBounds, "left" | "width">,
  duration: number,
): number | null {
  if (rect.width <= 0) return null;
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  return ratio * duration;
}

export function timelineContentPoint(
  clientX: number,
  clientY: number,
  rect: ClientRectBounds,
) {
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function createTimelineZoomAnchor(input: {
  anchorClientX?: number;
  rectLeft: number;
  viewportWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}): TimelineZoomAnchor {
  const viewportX = typeof input.anchorClientX === "number"
    ? Math.min(Math.max(input.anchorClientX - input.rectLeft, 0), input.viewportWidth)
    : input.viewportWidth / 2;
  const contentWidth = Math.max(input.scrollWidth, input.viewportWidth, 1);
  return {
    viewportX,
    contentRatio: Math.min(Math.max((input.scrollLeft + viewportX) / contentWidth, 0), 1),
  };
}

export function scrollLeftForZoomAnchor(
  anchor: TimelineZoomAnchor,
  nextScrollWidth: number,
  viewportWidth: number,
): number {
  const contentWidth = Math.max(nextScrollWidth, viewportWidth, 1);
  const maxScrollLeft = Math.max(contentWidth - viewportWidth, 0);
  return Math.min(
    Math.max(anchor.contentRatio * contentWidth - anchor.viewportX, 0),
    maxScrollLeft,
  );
}

export function panCurveViewport(
  viewport: CurveViewport,
  pointerDeltaY: number,
  viewportHeight: number,
): CurveViewport {
  const valuePerPixel = (viewport.maxValue - viewport.minValue) / Math.max(viewportHeight, 1);
  const delta = pointerDeltaY * valuePerPixel;
  return {
    minValue: viewport.minValue + delta,
    maxValue: viewport.maxValue + delta,
  };
}

export function zoomCurveViewport(viewport: CurveViewport, factor: number): CurveViewport {
  const center = (viewport.minValue + viewport.maxValue) / 2;
  const range = Math.max(viewport.maxValue - viewport.minValue, 0.0001) / factor;
  return { minValue: center - range / 2, maxValue: center + range / 2 };
}
