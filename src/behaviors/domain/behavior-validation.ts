import { BEHAVIOR_DOCUMENT_LIMITS } from "./behavior-limits";
import type { BehaviorValue, BehaviorValues } from "./behavior-component";

export class BehaviorValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`); this.name = "BehaviorValidationError";
  }
}

export function behaviorRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BehaviorValidationError(path, "expected an object");
  }
  return value as Record<string, unknown>;
}

export function behaviorString(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new BehaviorValidationError(path, `expected a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

export function behaviorVersion(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new BehaviorValidationError(path, "expected a positive integer version");
  }
  return value;
}

export function parseBehaviorValue(value: unknown, path: string): BehaviorValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= BEHAVIOR_DOCUMENT_LIMITS.stringLength) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const input = behaviorRecord(value, path);
    if (Object.keys(input).length === 1 && "entityId" in input) {
      return Object.freeze({ entityId: behaviorString(input.entityId, `${path}.entityId`, 256) });
    }
  }
  throw new BehaviorValidationError(path, "expected a bounded string, finite number, boolean, null, or entity reference");
}

export function parseBehaviorValues(value: unknown, path = "values"): BehaviorValues {
  const input = behaviorRecord(value, path);
  const keys = Object.keys(input);
  if (keys.length > BEHAVIOR_DOCUMENT_LIMITS.values) {
    throw new BehaviorValidationError(path, `cannot exceed ${BEHAVIOR_DOCUMENT_LIMITS.values} values`);
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [
    behaviorString(key, `${path} key`, BEHAVIOR_DOCUMENT_LIMITS.keyLength),
    parseBehaviorValue(input[key], `${path}.${key}`),
  ])));
}
