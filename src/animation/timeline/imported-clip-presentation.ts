const MAX_TIMELINE_ROWS = 512;
const MAX_TIMELINE_KEY_TIMES = 65_536;
const MAX_TIMELINE_LABEL_LENGTH = 160;
const MAX_CADENCE_SAMPLES_PER_TRACK = 2_048;
const DEFAULT_FRAME_RATE = 30;

export const IMPORTED_CLIP_TIMELINE_LIMITS = Object.freeze({
  maximumRows: MAX_TIMELINE_ROWS,
  maximumKeyTimes: MAX_TIMELINE_KEY_TIMES,
});

export type ImportedClipTimelineRow = Readonly<{
  id: string;
  targetLabel: string;
  propertyLabel: string;
  keyTimesSeconds: readonly number[];
  keyframeCount: number;
  truncated: boolean;
}>;

export type ImportedClipTimelinePresentation = Readonly<{
  clipName: string;
  durationSeconds: number;
  frameRate: number;
  rows: readonly ImportedClipTimelineRow[];
  keyframeCount: number;
  displayedKeyframeCount: number;
  truncated: boolean;
}>;

export type ImportedClipTrackSource = Readonly<{
  name: string;
  keyTimesSeconds: ArrayLike<number>;
}>;

type PresentationInput = Readonly<{
  clipName: string;
  durationSeconds: number;
  frameRate?: number | null;
  tracks: readonly ImportedClipTrackSource[];
}>;

type TrackCandidate = Readonly<{
  source: ImportedClipTrackSource;
  sourceIndex: number;
  keyframeCount: number;
}>;

/** Copies Three track timing into a bounded, immutable, renderer-neutral view. */
export function createImportedClipTimelinePresentation(
  input: PresentationInput,
): ImportedClipTimelinePresentation {
  const candidates = timelineTrackCandidates(input.tracks);
  const allocations = keyTimeAllocations(candidates.map((track) => track.keyframeCount));
  const rows = candidates.map((track, rowIndex): ImportedClipTimelineRow => {
    const labels = importedClipTrackLabels(track.source.name);
    const keyTimesSeconds = Object.freeze(copyExactKeyTimes(
      track.source.keyTimesSeconds,
      track.keyframeCount,
      allocations[rowIndex] ?? 0,
    ));
    return Object.freeze({
      id: `track:${track.sourceIndex}:${boundedLabel(track.source.name, "Track")}`,
      ...labels,
      keyTimesSeconds,
      keyframeCount: track.keyframeCount,
      truncated: keyTimesSeconds.length < track.keyframeCount,
    });
  });
  const keyframeCount = candidates.reduce((total, row) => total + row.keyframeCount, 0);
  const displayedKeyframeCount = rows.reduce((total, row) => total + row.keyTimesSeconds.length, 0);
  const presentation = {
    clipName: boundedLabel(input.clipName, "Clip"),
    durationSeconds: finitePositive(input.durationSeconds) ?? 0,
    frameRate: finitePositive(input.frameRate) ?? inferredFrameRate(candidates),
    rows: Object.freeze(rows),
    keyframeCount,
    displayedKeyframeCount,
    truncated: candidates.length < input.tracks.length || displayedKeyframeCount < keyframeCount,
  } satisfies ImportedClipTimelinePresentation;
  return Object.freeze(presentation);
}

export function importedClipTrackLabels(trackName: string): Readonly<{
  targetLabel: string;
  propertyLabel: string;
}> {
  const cleanName = boundedLabel(trackName, "Track");
  const propertySeparator = cleanName.lastIndexOf(".");
  const rawTarget = propertySeparator >= 0 ? cleanName.slice(0, propertySeparator) : "";
  const rawProperty = propertySeparator >= 0 ? cleanName.slice(propertySeparator + 1) : cleanName;
  const indexedProperty = /^([^\[]+)(?:\[([^\]]+)\])?$/.exec(rawProperty);
  const propertyName = indexedProperty?.[1] ?? rawProperty;
  const propertyIndex = indexedProperty?.[2]?.trim() ?? "";
  return Object.freeze({
    targetLabel: targetLabel(rawTarget),
    propertyLabel: propertyLabel(propertyName, propertyIndex),
  });
}

function timelineTrackCandidates(tracks: readonly ImportedClipTrackSource[]): TrackCandidate[] {
  const candidates: TrackCandidate[] = [];
  for (let sourceIndex = 0; sourceIndex < tracks.length; sourceIndex += 1) {
    if (candidates.length >= MAX_TIMELINE_ROWS) break;
    const source = tracks[sourceIndex];
    if (!source || !validArrayLikeLength(source.keyTimesSeconds.length)) continue;
    const keyframeCount = finiteKeyTimeCount(source.keyTimesSeconds);
    if (keyframeCount > 0) candidates.push({ source, sourceIndex, keyframeCount });
  }
  return candidates;
}

function keyTimeAllocations(counts: readonly number[]): number[] {
  const allocations = Array(counts.length).fill(0) as number[];
  let available = MAX_TIMELINE_KEY_TIMES;
  let active = counts.map((count, index) => ({ count, index }));
  while (active.length > 0 && available > 0) {
    const share = Math.max(1, Math.floor(available / active.length));
    const completed = active.filter(({ count, index }) => count - allocations[index] <= share);
    if (completed.length === 0) {
      active.forEach(({ index }, order) => {
        allocations[index] += share + (order < available % active.length ? 1 : 0);
      });
      break;
    }
    for (const { count, index } of completed) {
      const allocation = count - allocations[index];
      allocations[index] += allocation;
      available -= allocation;
    }
    const completedIndices = new Set(completed.map(({ index }) => index));
    active = active.filter(({ index }) => !completedIndices.has(index));
  }
  return allocations;
}

function copyExactKeyTimes(
  source: ArrayLike<number>,
  keyframeCount: number,
  limit: number,
): number[] {
  if (limit <= 0 || keyframeCount <= 0) return [];
  const requestedRanks = sampledRanks(keyframeCount, Math.min(keyframeCount, limit));
  const copied: number[] = [];
  let finiteRank = 0;
  let requestedIndex = 0;
  for (let index = 0; index < source.length && requestedIndex < requestedRanks.length; index += 1) {
    const value = Number(source[index]);
    if (!Number.isFinite(value)) continue;
    if (finiteRank === requestedRanks[requestedIndex]) {
      copied.push(value);
      requestedIndex += 1;
    }
    finiteRank += 1;
  }
  return copied;
}

function sampledRanks(count: number, limit: number): number[] {
  if (limit >= count) return Array.from({ length: count }, (_, index) => index);
  if (limit === 1) return [0];
  return Array.from({ length: limit }, (_, index) => (
    Math.round((index * (count - 1)) / (limit - 1))
  ));
}

function finiteKeyTimeCount(values: ArrayLike<number>): number {
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (Number.isFinite(Number(values[index]))) count += 1;
  }
  return count;
}

function inferredFrameRate(tracks: readonly TrackCandidate[]): number {
  const votes = new Map<number, number>();
  for (const { source } of tracks) {
    const deltas: number[] = [];
    let previous: number | null = null;
    for (let index = 0; index < source.keyTimesSeconds.length; index += 1) {
      const current = Number(source.keyTimesSeconds[index]);
      if (!Number.isFinite(current)) continue;
      if (previous !== null && current - previous > 1.0e-6
        && deltas.length < MAX_CADENCE_SAMPLES_PER_TRACK) deltas.push(current - previous);
      previous = current;
      if (deltas.length >= MAX_CADENCE_SAMPLES_PER_TRACK) break;
    }
    if (deltas.length === 0) continue;
    deltas.sort((left, right) => left - right);
    const frameRate = 1 / deltas[Math.floor(deltas.length / 2)];
    if (frameRate < 1 || frameRate > 1_000) continue;
    const rounded = Math.round(frameRate * 1_000) / 1_000;
    votes.set(rounded, (votes.get(rounded) ?? 0) + 1);
  }
  return [...votes.entries()].sort((left, right) => (
    right[1] - left[1]
    || Math.abs(left[0] - DEFAULT_FRAME_RATE) - Math.abs(right[0] - DEFAULT_FRAME_RATE)
    || left[0] - right[0]
  ))[0]?.[0] ?? DEFAULT_FRAME_RATE;
}

function targetLabel(rawTarget: string): string {
  const bonesTarget = /(?:^|\.)bones\[([^\]]+)\]$/.exec(rawTarget);
  if (bonesTarget?.[1]) return boundedLabel(bonesTarget[1], "Root");
  const withoutAccessor = rawTarget
    .replace(/^\.+/, "")
    .replace(/\.(?:material|materials\[[^\]]+\])$/, "");
  return boundedLabel(withoutAccessor, "Root");
}

function propertyLabel(name: string, index: string): string {
  const known: Record<string, string> = {
    position: "Position",
    quaternion: "Rotation",
    rotation: "Rotation",
    scale: "Scale",
    color: "Color",
    opacity: "Opacity",
    visible: "Visibility",
    morphTargetInfluences: "Blend Shape",
  };
  const base = known[name] ?? name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
  return boundedLabel(index ? `${base} · ${index}` : base, "Property");
}

function boundedLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clean.slice(0, MAX_TIMELINE_LABEL_LENGTH) || fallback;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function validArrayLikeLength(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
