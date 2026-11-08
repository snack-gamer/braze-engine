export const ENTITY_LAYER_COUNT = 32;
export function captureEntityLayer(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= ENTITY_LAYER_COUNT) {
    throw new Error("Object layer must be an integer from 0 to 31.");
  }
  return value;
}
