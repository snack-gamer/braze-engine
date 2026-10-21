export type ModelPreviewResolution = {
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
  aspect: number;
};

const MAX_DEVICE_PIXEL_RATIO = 1.5;
const MAX_DRAWING_BUFFER_EDGE = 1024;

/** Keeps the interactive preview crisp without allowing a dock resize to create a 4K canvas. */
export function resolveModelPreviewResolution(
  width: number,
  height: number,
  devicePixelRatio: number,
): ModelPreviewResolution {
  const cssWidth = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
  const cssHeight = Math.max(1, Math.floor(Number.isFinite(height) ? height : 1));
  const requestedRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  const pixelRatio = Math.min(
    requestedRatio,
    MAX_DEVICE_PIXEL_RATIO,
    MAX_DRAWING_BUFFER_EDGE / cssWidth,
    MAX_DRAWING_BUFFER_EDGE / cssHeight,
  );
  return {
    cssWidth,
    cssHeight,
    pixelRatio: Math.max(Number.EPSILON, pixelRatio),
    aspect: cssWidth / cssHeight,
  };
}
