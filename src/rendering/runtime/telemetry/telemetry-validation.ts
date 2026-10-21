export function boundedCapacity(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return resolved;
}

export function requireFiniteMilliseconds(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative.`);
  }
}
