type Missing = typeof MISSING;
type JsonLike = unknown | Missing;

export type ProjectSectionMergeResult =
  | { status: "merged"; value: unknown }
  | { status: "conflict"; paths: readonly string[] };

const MISSING = Symbol("missing-project-value");
const owns = (record: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(record, key);

type MergeNodeResult = {
  value: JsonLike;
  conflicts: string[];
};

function isRecord(value: JsonLike): value is Record<string, unknown> {
  return value !== MISSING && value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: JsonLike, right: JsonLike): boolean {
  if (Object.is(left, right)) return true;
  if (left === MISSING || right === MISSING) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]));
}

/** Structural equality for authored project-section values. */
export function projectSectionValuesEqual(left: unknown, right: unknown): boolean {
  return jsonEqual(left, right);
}

function stringArray(value: JsonLike): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function mergeStringSet(base: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(base);
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  const values = new Set([...base, ...local, ...remote]);
  return Array.from(values)
    .filter((value) => {
      const wasPresent = baseSet.has(value);
      const localPresent = localSet.has(value);
      const remotePresent = remoteSet.has(value);
      if (localPresent === remotePresent) return localPresent;
      if (localPresent === wasPresent) return remotePresent;
      return localPresent;
    })
    .sort();
}

function mergedCharacterRevision(local: string, remote: string): string {
  const input = [local, remote].sort().join("\u0000");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `character-revision-merge-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function mergeNode(
  base: JsonLike,
  local: JsonLike,
  remote: JsonLike,
  path: string,
  mergeStringArrays: boolean,
  mergeStableRecordArrays = false,
): MergeNodeResult {
  if (jsonEqual(local, remote)) return { value: local, conflicts: [] };
  if (jsonEqual(local, base)) return { value: remote, conflicts: [] };
  if (jsonEqual(remote, base)) return { value: local, conflicts: [] };

  if (
    mergeStableRecordArrays
    && path.endsWith(".revision")
    && typeof local === "string"
    && typeof remote === "string"
  ) {
    return { value: mergedCharacterRevision(local, remote), conflicts: [] };
  }

  if (
    mergeStringArrays
    && stringArray(base)
    && stringArray(local)
    && stringArray(remote)
  ) {
    return { value: mergeStringSet(base, local, remote), conflicts: [] };
  }

  if (mergeStableRecordArrays) {
    const records = mergeStableRecordArray(base, local, remote, path, mergeStringArrays);
    if (records) return records;
  }

  if (!isRecord(local) || !isRecord(remote)) {
    return { value: local, conflicts: [path || "section"] };
  }

  const baseRecord = isRecord(base) ? base : {};
  const keys = new Set([
    ...Object.keys(baseRecord),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  const value: Record<string, unknown> = {};
  const conflicts: string[] = [];
  for (const key of Array.from(keys).sort()) {
    const childPath = path ? `${path}.${key}` : key;
    const child = mergeNode(
      owns(baseRecord, key) ? baseRecord[key] : MISSING,
      owns(local, key) ? local[key] : MISSING,
      owns(remote, key) ? remote[key] : MISSING,
      childPath,
      mergeStringArrays && key === "folders",
      mergeStableRecordArrays,
    );
    conflicts.push(...child.conflicts);
    if (child.value !== MISSING) value[key] = child.value;
  }
  return { value, conflicts };
}

function hasStableId(value: unknown): value is Record<string, unknown> & { id: string } {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0;
}

function indexedRecords(value: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(value) || !value.every(hasStableId)) return null;
  const indexed = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (indexed.has(item.id)) return null;
    indexed.set(item.id, item);
  }
  return indexed;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sequenceEdges(
  sequence: readonly string[],
  commonIds: ReadonlySet<string>,
  includeCommonEdges: boolean,
): Array<readonly [string, string]> {
  const edges: Array<readonly [string, string]> = [];
  for (let index = 1; index < sequence.length; index += 1) {
    const before = sequence[index - 1]!;
    const after = sequence[index]!;
    if (includeCommonEdges || !commonIds.has(before) || !commonIds.has(after)) {
      edges.push([before, after]);
    }
  }
  return edges;
}

function topologicalRecordOrder(
  ids: readonly string[],
  edges: readonly (readonly [string, string])[],
  preference: readonly string[],
): string[] | null {
  const idSet = new Set(ids);
  const successors = new Map(ids.map((id) => [id, new Set<string>()]));
  const incoming = new Map(ids.map((id) => [id, 0]));
  for (const [before, after] of edges) {
    if (before === after || !idSet.has(before) || !idSet.has(after)) continue;
    const next = successors.get(before)!;
    if (next.has(after)) continue;
    next.add(after);
    incoming.set(after, incoming.get(after)! + 1);
  }
  const rank = new Map(preference.map((id, index) => [id, index]));
  const compare = (left: string, right: string) => (
    (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right)
  );
  const ready = ids.filter((id) => incoming.get(id) === 0).sort(compare);
  const result: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(id);
    for (const successor of successors.get(id)!) {
      const remaining = incoming.get(successor)! - 1;
      incoming.set(successor, remaining);
      if (remaining === 0) {
        ready.push(successor);
        ready.sort(compare);
      }
    }
  }
  return result.length === ids.length ? result : null;
}

/** Preserves unilateral ordering edits and rejects incompatible concurrent ordering. */
function mergeStableRecordOrder(
  baseById: ReadonlyMap<string, Record<string, unknown>>,
  localById: ReadonlyMap<string, Record<string, unknown>>,
  remoteById: ReadonlyMap<string, Record<string, unknown>>,
  finalIds: readonly string[],
): string[] | null {
  const finalSet = new Set(finalIds);
  const shared = new Set([...baseById.keys()].filter((id) => (
    finalSet.has(id) && localById.has(id) && remoteById.has(id)
  )));
  const projected = (values: ReadonlyMap<string, unknown>) => (
    [...values.keys()].filter((id) => shared.has(id))
  );
  const baseOrder = projected(baseById);
  const localOrder = projected(localById);
  const remoteOrder = projected(remoteById);
  const localChanged = !sameOrder(localOrder, baseOrder);
  const remoteChanged = !sameOrder(remoteOrder, baseOrder);
  if (localChanged && remoteChanged && !sameOrder(localOrder, remoteOrder)) return null;

  const localSequence = [...localById.keys()].filter((id) => finalSet.has(id));
  const remoteSequence = [...remoteById.keys()].filter((id) => finalSet.has(id));
  const equivalentReorder = localChanged && remoteChanged;
  const edges = [
    ...sequenceEdges(localSequence, shared, localChanged || !remoteChanged || equivalentReorder),
    ...sequenceEdges(remoteSequence, shared, remoteChanged || !localChanged || equivalentReorder),
  ];
  const preference = localChanged && !remoteChanged
    ? [...localSequence, ...remoteSequence]
    : [...remoteSequence, ...localSequence];
  return topologicalRecordOrder(finalIds, edges, preference);
}

function mergeStableRecordArray(
  base: JsonLike,
  local: JsonLike,
  remote: JsonLike,
  path: string,
  mergeStringArrays: boolean,
): MergeNodeResult | null {
  const baseById = base === MISSING ? new Map<string, Record<string, unknown>>() : indexedRecords(base);
  const localById = indexedRecords(local);
  const remoteById = indexedRecords(remote);
  if (!baseById || !localById || !remoteById) return null;

  const candidateOrder = [
    ...remoteById.keys(),
    ...Array.from(localById.keys()).filter((id) => !remoteById.has(id)),
  ];
  const values = new Map<string, unknown>();
  const conflicts: string[] = [];
  for (const id of candidateOrder) {
    const child = mergeNode(
      baseById.get(id) ?? MISSING,
      localById.get(id) ?? MISSING,
      remoteById.get(id) ?? MISSING,
      `${path}[${id}]`,
      mergeStringArrays,
      true,
    );
    conflicts.push(...child.conflicts);
    if (child.value !== MISSING) values.set(id, child.value);
  }
  const order = mergeStableRecordOrder(
    baseById,
    localById,
    remoteById,
    [...values.keys()],
  );
  if (!order) conflicts.push(`${path}.$order`);
  return {
    value: (order ?? [...values.keys()]).map((id) => values.get(id)),
    conflicts,
  };
}

function mergeMaterials(base: unknown, local: unknown, remote: unknown): ProjectSectionMergeResult {
  const baseById = indexedRecords(base);
  const localById = indexedRecords(local);
  const remoteById = indexedRecords(remote);
  if (!baseById || !localById || !remoteById) {
    return mergeGeneric(base, local, remote, "materials", false);
  }

  const order = [
    ...remoteById.keys(),
    ...Array.from(localById.keys()).filter((id) => !remoteById.has(id)),
  ];
  const merged: unknown[] = [];
  const conflicts: string[] = [];
  for (const id of order) {
    const result = mergeNode(
      baseById.get(id) ?? MISSING,
      localById.get(id) ?? MISSING,
      remoteById.get(id) ?? MISSING,
      `materials[${id}]`,
      false,
    );
    conflicts.push(...result.conflicts);
    if (result.value !== MISSING) merged.push(result.value);
  }
  if (conflicts.length > 0) {
    return { status: "conflict", paths: Object.freeze(Array.from(new Set(conflicts)).sort()) };
  }
  return { status: "merged", value: merged };
}

function mergeGeneric(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  mergeStringArrays: boolean,
  mergeStableRecordArrays = false,
): ProjectSectionMergeResult {
  const result = mergeNode(base, local, remote, path, mergeStringArrays, mergeStableRecordArrays);
  if (result.conflicts.length > 0) {
    return {
      status: "conflict",
      paths: Object.freeze(Array.from(new Set(result.conflicts)).sort()),
    };
  }
  return { status: "merged", value: result.value === MISSING ? undefined : result.value };
}

/** Three-way merges independently persisted project sections. */
export function mergeProjectSection(
  section: string,
  base: unknown,
  local: unknown,
  remote: unknown,
): ProjectSectionMergeResult {
  if (section === "materials") return mergeMaterials(base, local, remote);
  if (section === "characterAssets") {
    return mergeGeneric(base, local, remote, section, false, true);
  }
  return mergeGeneric(base, local, remote, section, section === "assets");
}
