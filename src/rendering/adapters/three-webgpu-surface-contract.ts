export type ThreeWebGpuSurfaceSize = Readonly<{
  width: number;
  height: number;
  pixelRatio: number;
}>;

export function validateThreeWebGpuSurfaceSize(
  { width, height, pixelRatio }: ThreeWebGpuSurfaceSize,
): void {
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height < 0) {
    throw new Error("Render surface dimensions must be finite, non-negative numbers.");
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error("Render surface pixel ratio must be a finite, positive number.");
  }
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
