export type ModelPreviewGridFrame = Readonly<{
  size: number;
  cellSize: number;
  groundHeight: number;
}>;

export type ModelPreviewBounds = Readonly<{
  minimumY: number;
  width: number;
  height: number;
  depth: number;
}>;

/** Frames a useful ground grid across models authored at very different unit scales. */
export function calculateModelPreviewGridFrame(bounds: ModelPreviewBounds): ModelPreviewGridFrame {
  const width = positiveFinite(bounds.width);
  const height = positiveFinite(bounds.height);
  const depth = positiveFinite(bounds.depth);
  const footprint = Math.max(width, depth, height * 0.7, 1e-6);
  const targetSize = footprint * 2;
  const cellSize = niceStep(targetSize / 20);
  const majorSize = cellSize * 10;
  const size = Math.max(majorSize, Math.ceil(targetSize / majorSize) * majorSize);
  const minimumY = Number.isFinite(bounds.minimumY) ? bounds.minimumY : 0;
  return {
    size,
    cellSize,
    groundHeight: minimumY - Math.max(height, footprint) * 5e-4,
  };
}

function niceStep(value: number): number {
  const safe = Math.max(1e-9, Number.isFinite(value) ? value : 1);
  const exponent = 10 ** Math.floor(Math.log10(safe));
  const fraction = safe / exponent;
  const multiplier = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return multiplier * exponent;
}

function positiveFinite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
