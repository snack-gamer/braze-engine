import { keyRefId } from "./keyframes";
import type {
  LassoRect,
  TimelineKey,
  TimelineKeyEntry,
  TimelineKeyMarker,
  TimelineRow,
} from "./types";

export const TIMELINE_ROW_HEIGHT = 24;

export type TimelineKeyIndex = {
  entryById: ReadonlyMap<string, TimelineKeyEntry>;
  entriesByObject: ReadonlyMap<string, TimelineKeyEntry[]>;
  entriesByProperty: ReadonlyMap<string, TimelineKeyEntry[]>;
  entriesByChannel: ReadonlyMap<string, TimelineKeyEntry[]>;
};

export type TimelineSelectionRange = {
  minTime: number;
  maxTime: number;
  leftPercent: number;
  widthPercent: number;
};

function propertyBucket(objectId: string, property: string): string {
  return `${objectId}:${property}`;
}

function channelBucket(objectId: string, property: string, axis: number): string {
  return `${objectId}:${property}:${axis}`;
}

function addToBucket(
  buckets: Map<string, TimelineKeyEntry[]>,
  key: string,
  entry: TimelineKeyEntry,
): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(entry);
  else buckets.set(key, [entry]);
}

/** Indexes immutable authored key entries once so row rendering never scans every track. */
export function indexTimelineKeys(entries: TimelineKeyEntry[]): TimelineKeyIndex {
  const entryById = new Map<string, TimelineKeyEntry>();
  const entriesByObject = new Map<string, TimelineKeyEntry[]>();
  const entriesByProperty = new Map<string, TimelineKeyEntry[]>();
  const entriesByChannel = new Map<string, TimelineKeyEntry[]>();
  for (const entry of entries) {
    entryById.set(entry.id, entry);
    addToBucket(entriesByObject, entry.objectId, entry);
    addToBucket(entriesByProperty, propertyBucket(entry.objectId, entry.property), entry);
    addToBucket(entriesByChannel, channelBucket(entry.objectId, entry.property, entry.axis), entry);
  }
  for (const buckets of [entriesByObject, entriesByProperty, entriesByChannel]) {
    for (const bucket of buckets.values()) bucket.sort((left, right) => left.key.time - right.key.time);
  }
  return { entryById, entriesByObject, entriesByProperty, entriesByChannel };
}

function rowEntries(index: TimelineKeyIndex, row: TimelineRow): TimelineKeyEntry[] {
  if (row.property === undefined) return index.entriesByObject.get(row.objectId) ?? [];
  if (row.axis === undefined) {
    return index.entriesByProperty.get(propertyBucket(row.objectId, row.property)) ?? [];
  }
  return index.entriesByChannel.get(channelBucket(row.objectId, row.property, row.axis)) ?? [];
}

function firstEntryAtOrAfter(entries: TimelineKeyEntry[], time: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].key.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function referencesForTimelineKey(
  index: TimelineKeyIndex,
  row: TimelineRow,
  key: Pick<TimelineKey, "time" | "id">,
  epsilon: number,
) {
  const entries = rowEntries(index, row);
  const references = new Map<string, TimelineKeyEntry["ref"]>();
  const start = firstEntryAtOrAfter(entries, key.time - epsilon);
  for (let position = start; position < entries.length; position += 1) {
    const entry = entries[position];
    if (entry.key.time > key.time + epsilon) break;
    references.set(entry.id, entry.ref);
  }
  // Key ids are normally time-aligned, but retaining this fallback preserves
  // selection if imported data contains a slightly off-grid aggregate key.
  const matchingId = entries.find((entry) => entry.key.id === key.id);
  if (matchingId) references.set(matchingId.id, matchingId.ref);
  return [...references.values()];
}

export function retainValidKeySelection(
  selectedIds: ReadonlySet<string>,
  index: TimelineKeyIndex,
): Set<string> {
  return new Set([...selectedIds].filter((id) => index.entryById.has(id)));
}

export function entriesForSelectedKeyIds(
  selectedIds: ReadonlySet<string>,
  index: TimelineKeyIndex,
): TimelineKeyEntry[] {
  return [...selectedIds].flatMap((id) => {
    const entry = index.entryById.get(id);
    return entry ? [entry] : [];
  });
}

type KeyPressModifiers = {
  extend: boolean;
  toggle: boolean;
};

export function selectionAfterKeyPress(
  current: ReadonlySet<string>,
  keyIds: string[],
  modifiers: KeyPressModifiers,
): { selectedIds: Set<string>; dragIds: Set<string> } {
  const alreadySelected = keyIds.some((id) => current.has(id));
  let selectedIds = new Set(current);
  if (modifiers.toggle) {
    for (const id of keyIds) {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
    }
  } else if (modifiers.extend) {
    for (const id of keyIds) selectedIds.add(id);
  } else if (!alreadySelected) {
    selectedIds = new Set(keyIds);
  }
  const dragIds = modifiers.extend || modifiers.toggle || alreadySelected
    ? new Set(selectedIds)
    : new Set(keyIds);
  return { selectedIds, dragIds };
}

export function keyIdsForMarkers(markers: TimelineKeyMarker[]): Set<string> {
  const ids = new Set<string>();
  for (const marker of markers) {
    for (const ref of marker.refs) ids.add(keyRefId(ref));
  }
  return ids;
}

export function keyIdsInsideLasso(
  markers: TimelineKeyMarker[],
  rect: LassoRect,
  contentSize: { width: number; height: number },
  curveMode: boolean,
): Set<string> {
  const ids = new Set<string>();
  if (contentSize.width <= 0 || contentSize.height <= 0) return ids;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  for (const marker of markers) {
    const x = (marker.xPercent / 100) * contentSize.width;
    const y = curveMode && marker.yPercent !== undefined
      ? (marker.yPercent / 100) * contentSize.height
      : marker.rowIndex * TIMELINE_ROW_HEIGHT + TIMELINE_ROW_HEIGHT / 2;
    if (x < rect.left || x > right || y < rect.top || y > bottom) continue;
    for (const ref of marker.refs) ids.add(keyRefId(ref));
  }
  return ids;
}

export function selectedTimelineRange(
  markers: TimelineKeyMarker[],
  selectedIds: ReadonlySet<string>,
  duration: number,
): TimelineSelectionRange | null {
  const selectedMarkers = markers.filter((marker) =>
    marker.refs.some((ref) => selectedIds.has(keyRefId(ref)))
  );
  if (selectedMarkers.length === 0 || duration <= 0) return null;
  const minTime = Math.min(...selectedMarkers.map((marker) => marker.time));
  const maxTime = Math.max(...selectedMarkers.map((marker) => marker.time));
  const leftPercent = (minTime / duration) * 100;
  return {
    minTime,
    maxTime,
    leftPercent,
    widthPercent: Math.max((maxTime / duration) * 100 - leftPercent, 0),
  };
}
