import type { AssetRef } from "../../assets/domain/asset-reference";
import {
  IDENTITY_CHARACTER_MATRIX,
  IDENTITY_CHARACTER_TRANSFORM,
  type CharacterAxis,
  type CharacterMatrix4,
  type CharacterQuaternion,
  type CharacterTransform,
  type CharacterVector2,
  type CharacterVector3,
} from "../domain/character-values";

export type CharacterCodecErrorCode =
  | "invalid-document"
  | "invalid-reference"
  | "invalid-topology"
  | "unsupported-version";

export class CharacterCodecError extends Error {
  readonly code: CharacterCodecErrorCode;
  readonly path: string;

  constructor(code: CharacterCodecErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "CharacterCodecError";
    this.code = code;
    this.path = path;
  }
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function documentRecord(value: unknown, path: string): Record<string, unknown> {
  const parsed = record(value);
  if (!parsed) throw new CharacterCodecError("invalid-document", path, "expected an object");
  return parsed;
}

export function acceptDocumentVersion(
  input: Record<string, unknown>,
  current: string,
  legacy: readonly string[] = [],
): void {
  const version = input.version;
  if (version === undefined || version === 1 || version === current || legacy.includes(String(version))) return;
  throw new CharacterCodecError("unsupported-version", "version", `unsupported version ${String(version)}`);
}

export function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CharacterCodecError("invalid-document", path, "expected a non-empty string");
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}

export function assertArrayWithinLimit(
  value: readonly unknown[],
  path: string,
  maximum: number,
): void {
  if (value.length > maximum) {
    throw new CharacterCodecError("invalid-document", path, `cannot exceed ${maximum} entries`);
  }
}

/** Returns an array only after rejecting an over-budget persisted collection. */
export function arrayWithinLimit(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) return [];
  assertArrayWithinLimit(value, path, maximum);
  return value;
}

export function parseAssetRef(value: unknown, path: string, required = false): AssetRef | undefined {
  const input = record(value);
  const guid = typeof input?.guid === "string" ? input.guid.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{32}$/.test(guid)) {
    if (!required && !input) return undefined;
    throw new CharacterCodecError("invalid-reference", path, "expected a 32-character asset GUID");
  }
  const rawLocalId = input?.localId ?? input?.local_id;
  const localId = optionalString(rawLocalId);
  return { guid, ...(localId ? { localId } : {}) };
}

export function serializeAssetRef(value: AssetRef): Record<string, string> {
  return { guid: value.guid, ...(value.localId ? { localId: value.localId } : {}) };
}

export function parseVector2(value: unknown, fallback: CharacterVector2 = [0, 0]): CharacterVector2 {
  if (!Array.isArray(value)) return [...fallback];
  return [finiteNumber(value[0], fallback[0]), finiteNumber(value[1], fallback[1])];
}

export function parseVector3(value: unknown, fallback: CharacterVector3 = [0, 0, 0]): CharacterVector3 {
  if (!Array.isArray(value)) return [...fallback];
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
  ];
}

export function parseQuaternion(value: unknown): CharacterQuaternion {
  if (!Array.isArray(value)) return [...IDENTITY_CHARACTER_TRANSFORM.rotation];
  const parsed: CharacterQuaternion = [
    finiteNumber(value[0], 0),
    finiteNumber(value[1], 0),
    finiteNumber(value[2], 0),
    finiteNumber(value[3], 1),
  ];
  const length = Math.hypot(...parsed);
  return length > 1e-8
    ? parsed.map((entry) => entry / length) as CharacterQuaternion
    : [...IDENTITY_CHARACTER_TRANSFORM.rotation];
}

export function parseTransform(value: unknown): CharacterTransform {
  const input = record(value) ?? {};
  const translation = input.translation ?? input.position;
  return {
    translation: parseVector3(translation, IDENTITY_CHARACTER_TRANSFORM.translation),
    rotation: parseQuaternion(input.rotation),
    scale: parseVector3(input.scale, IDENTITY_CHARACTER_TRANSFORM.scale).map(
      (entry) => Math.abs(entry) > 1e-8 ? entry : 1,
    ) as CharacterVector3,
  };
}

export function serializeTransform(value: CharacterTransform) {
  return {
    translation: [...value.translation],
    rotation: [...value.rotation],
    scale: [...value.scale],
  };
}

export function parseMatrix4(value: unknown): CharacterMatrix4 {
  if (!Array.isArray(value) || value.length !== 16) return [...IDENTITY_CHARACTER_MATRIX];
  return value.map((entry, index) => finiteNumber(entry, IDENTITY_CHARACTER_MATRIX[index]!)) as CharacterMatrix4;
}

const CHARACTER_AXES: readonly CharacterAxis[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

export function parseAxis(value: unknown, fallback: CharacterAxis): CharacterAxis {
  return CHARACTER_AXES.includes(value as CharacterAxis) ? value as CharacterAxis : fallback;
}

export function uniqueIds<T extends { id: string }>(values: readonly T[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      throw new CharacterCodecError("invalid-document", path, `duplicate id ${value.id}`);
    }
    seen.add(value.id);
  }
}

function clonePersistedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePersistedValue);
  const input = record(value);
  if (!input) return value;
  return Object.fromEntries(
    Object.entries(input).map(([key, child]) => [key, clonePersistedValue(child)]),
  );
}

/** Copies fields that this codec does not own so editing does not erase newer metadata. */
export function preservedDocumentFields(
  input: Record<string, unknown>,
  knownFields: readonly string[],
): Record<string, unknown> {
  const known = new Set(knownFields);
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => !known.has(key))
      .map(([key, value]) => [key, clonePersistedValue(value)]),
  );
}
