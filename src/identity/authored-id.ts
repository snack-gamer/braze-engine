let fallbackSequence = 0;

export type AuthoredIdSources = {
  uuid: () => string | undefined;
  randomValues?: () => Uint32Array | undefined;
  now: () => number;
  random: () => number;
};

const defaultSources: AuthoredIdSources = {
  uuid: () => globalThis.crypto?.randomUUID?.(),
  randomValues: () => {
    const crypto = globalThis.crypto;
    return crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(4)) : undefined;
  },
  now: () => Date.now(),
  random: () => Math.random(),
};

/** Creates a project-stable identity that remains collision-resistant across
 * tabs and editor sessions. The fallback covers hosts without randomUUID. */
export function createAuthoredId(prefix: string, sources = defaultSources): string {
  const uuid = sources.uuid();
  if (uuid) return `${prefix}-${uuid}`;
  const randomValues = sources.randomValues?.();
  if (randomValues && randomValues.length > 0) {
    const entropy = Array.from(
      randomValues,
      (value) => value.toString(16).padStart(8, "0"),
    ).join("");
    return `${prefix}-${entropy}`;
  }
  fallbackSequence += 1;
  const random = Math.floor(sources.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `${prefix}-${sources.now().toString(36)}-${fallbackSequence.toString(36)}-${random}`;
}

/** Stable identity for legacy data that did not persist one. Include a
 * document-local index in the seed when equal values may occur more than once. */
export function createDeterministicAuthoredId(prefix: string, seed: string): string {
  const first = fnv1a(seed, 0x811c9dc5);
  const second = fnv1a(seed, 0x9e3779b9);
  return `${prefix}-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

/** Creates the 32-character hexadecimal identity required by AssetRef. */
export function createAuthoredGuid(sources = defaultSources): string {
  const authoredId = createAuthoredId("guid", sources);
  const direct = authoredId.slice("guid-".length).replace(/-/g, "").toLowerCase();
  return /^[a-f0-9]{32}$/.test(direct)
    ? direct
    : createDeterministicAuthoredGuid(authoredId);
}

/** Deterministic AssetRef-compatible identity for idempotent legacy migration. */
export function createDeterministicAuthoredGuid(seed: string): string {
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((offset) => fnv1a(seed, offset).toString(16).padStart(8, "0"))
    .join("");
}

function fnv1a(value: string, offset: number): number {
  let hash = offset >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
