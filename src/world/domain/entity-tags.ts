import { EntityWorldError, type EntityHandle } from "./entity-world";

export const MAX_ENTITY_TAGS = 1;
export const MAX_TAG_QUERY_RESULTS = 256;
export const EMPTY_ENTITY_TAGS: readonly string[] = Object.freeze([]);
export type EntityTagQuery = Readonly<{ handles: readonly EntityHandle[]; total: number; truncated: boolean }>;

/** Tags are case-sensitive identifiers, separate from collision layers and asset labels. */
export function captureEntityTag(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,47}$/.test(value)) {
    throw new EntityWorldError("invalid-command", "Tags require 1–48 characters: a letter followed by letters, digits, _, . or -.");
  }
  return value;
}

export function captureEntityTags(value: unknown): readonly string[] {
  if (value === undefined) return EMPTY_ENTITY_TAGS;
  if (!Array.isArray(value) || value.length > MAX_ENTITY_TAGS) {
    throw new EntityWorldError("invalid-command", `An entity supports at most ${MAX_ENTITY_TAGS} tags in an array.`);
  }
  const tags = value.map(captureEntityTag);
  if (new Set(tags).size !== tags.length) throw new EntityWorldError("invalid-command", "Duplicate entity tags are not allowed.");
  return tags.length ? Object.freeze(tags) : EMPTY_ENTITY_TAGS;
}
