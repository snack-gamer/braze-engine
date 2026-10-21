export type AnimatorGraphViewport = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;

export type AnimatorGraphPoint = Readonly<{ x: number; y: number }>;
export type AnimatorGraphSize = Readonly<{ width: number; height: number }>;
export type AnimatorGraphBounds = AnimatorGraphPoint & AnimatorGraphSize;

export const ANIMATOR_GRAPH_VIEWPORT_DEFAULT: AnimatorGraphViewport = { x: 0, y: 0, scale: 1 };
export const ANIMATOR_GRAPH_VIEWPORT_MIN_SCALE = 0.35;
export const ANIMATOR_GRAPH_VIEWPORT_MAX_SCALE = 2;
export const ANIMATOR_GRAPH_GRID_STEP = 20;
export const ANIMATOR_GRAPH_GRID_MAJOR_STEP = 100;

/** Avoids compositing graph text when the viewport is at its native scale and origin. */
export function animatorGraphWorldTransform(viewport: AnimatorGraphViewport): string | undefined {
  if (viewport.x === 0 && viewport.y === 0 && viewport.scale === 1) return undefined;
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
}

export function panAnimatorGraphViewport(
  viewport: AnimatorGraphViewport,
  delta: AnimatorGraphPoint,
): AnimatorGraphViewport {
  return { ...viewport, x: viewport.x + delta.x, y: viewport.y + delta.y };
}

export function animatorGraphClientPointToWorld(
  viewport: AnimatorGraphViewport,
  clientPoint: AnimatorGraphPoint,
  viewportOrigin: AnimatorGraphPoint,
): AnimatorGraphPoint {
  return {
    x: (clientPoint.x - viewportOrigin.x - viewport.x) / viewport.scale,
    y: (clientPoint.y - viewportOrigin.y - viewport.y) / viewport.scale,
  };
}

export function zoomAnimatorGraphViewport(
  viewport: AnimatorGraphViewport,
  requestedScale: number,
  anchor: AnimatorGraphPoint,
): AnimatorGraphViewport {
  const scale = clampScale(requestedScale);
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  };
}

export function fitAnimatorGraphViewport(
  bounds: AnimatorGraphBounds,
  viewport: AnimatorGraphSize,
  padding: number,
): AnimatorGraphViewport {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = clampScale(Math.min(
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
    1,
  ));
  return {
    scale,
    x: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

export function animatorGraphGridOffset(offset: number, step: number): number {
  const remainder = offset % step;
  return remainder < 0 ? remainder + step : remainder;
}

function clampScale(scale: number): number {
  return Math.min(ANIMATOR_GRAPH_VIEWPORT_MAX_SCALE, Math.max(ANIMATOR_GRAPH_VIEWPORT_MIN_SCALE, scale));
}
