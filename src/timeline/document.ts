import type { AnimationDocument } from "../animation/types";
import type {
  PrimeTimelineDocument,
  PrimeTimelineFrameMode,
  PrimeTimelinePlayMode,
  SequencerSection,
  SequencerSectionKind,
  SequencerSectionValue,
  SequencerTrack,
  SequencerTrackKind,
} from "./types";

export const DEFAULT_PRIME_TIMELINE_FPS = 24;
export const DEFAULT_PRIME_TIMELINE_MAX_FRAME = 120;
const MIN_FPS = 1;
const MAX_FPS = 240;
const MIN_DURATION_FRAMES = 1;
const MAX_DURATION_FRAMES = 240 * 60 * 10;

const TRACK_KINDS: SequencerTrackKind[] = ["master", "animation", "activation", "property", "system"];
const SECTION_KINDS: SequencerSectionKind[] = ["range", "animation", "activation", "property"];

const TRACK_LABELS: Record<SequencerTrackKind, string> = {
  master: "Scene",
  animation: "Animation",
  activation: "Visibility",
  property: "Property",
  system: "System",
};

const SECTION_LABELS: Record<SequencerSectionKind, string> = {
  range: "Scene Range",
  animation: "Animation",
  activation: "Visibility",
  property: "Property",
};

const SECTION_COLORS: Record<SequencerSectionKind, string> = {
  range: "#6f8997",
  animation: "#8ca35d",
  activation: "#c28a4a",
  property: "#5f95c8",
};

function sectionKindForTrack(kind: SequencerTrackKind): SequencerSectionKind {
  if (kind === "animation") return "animation";
  if (kind === "activation") return "activation";
  if (kind === "property") return "property";
  return "range";
}

function createDefaultSequencerSection(
  kind: SequencerSectionKind,
  minFrame: number,
  maxFrame: number,
  id = `section-${kind}-range`,
): SequencerSection {
  return {
    id,
    name: SECTION_LABELS[kind],
    kind,
    startFrame: minFrame,
    endFrame: maxFrame,
    enabled: true,
    color: SECTION_COLORS[kind],
  };
}

export function createDefaultSequencerTrack(
  kind: SequencerTrackKind,
  minFrame: number,
  maxFrame: number,
  id = `track-${kind}`,
): SequencerTrack {
  const sectionKind = sectionKindForTrack(kind);
  return {
    id,
    name: TRACK_LABELS[kind],
    kind,
    enabled: true,
    sections: [createDefaultSequencerSection(sectionKind, minFrame, maxFrame, `${id}-section`)],
  };
}

export function createDefaultSequencerTracks(minFrame: number, maxFrame: number): SequencerTrack[] {
  return [createDefaultSequencerTrack("master", minFrame, maxFrame, "track-scene")];
}

export const defaultPrimeTimelineDocument: PrimeTimelineDocument = {
  version: 1,
  fps: DEFAULT_PRIME_TIMELINE_FPS,
  minFrame: 0,
  maxFrame: DEFAULT_PRIME_TIMELINE_MAX_FRAME,
  previewStartFrame: 0,
  previewEndFrame: DEFAULT_PRIME_TIMELINE_MAX_FRAME,
  currentFrame: 0,
  playMode: "loop",
  frameMode: "realtime",
  tracks: createDefaultSequencerTracks(0, DEFAULT_PRIME_TIMELINE_MAX_FRAME),
};

function finiteNumber(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function finiteInt(value: unknown, fallback: number): number {
  return Math.round(finiteNumber(value, fallback));
}

export function clampFps(value: unknown): number {
  return Math.min(MAX_FPS, Math.max(MIN_FPS, finiteInt(value, DEFAULT_PRIME_TIMELINE_FPS)));
}

function playMode(value: unknown, fallback: PrimeTimelinePlayMode): PrimeTimelinePlayMode {
  return value === "once" || value === "loop" || value === "pingpong" ? value : fallback;
}

function frameMode(value: unknown, fallback: PrimeTimelineFrameMode): PrimeTimelineFrameMode {
  return value === "realtime" || value === "allFrames" ? value : fallback;
}

function trackKind(value: unknown, fallback: SequencerTrackKind): SequencerTrackKind {
  return TRACK_KINDS.includes(value as SequencerTrackKind) ? value as SequencerTrackKind : fallback;
}

function sectionKind(value: unknown, fallback: SequencerSectionKind): SequencerSectionKind {
  return SECTION_KINDS.includes(value as SequencerSectionKind) ? value as SequencerSectionKind : fallback;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sectionValue(value: unknown): SequencerSectionValue | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function normalizeSequencerSection(
  raw: unknown,
  fallback: SequencerSection,
  minFrame: number,
  maxFrame: number,
): SequencerSection | undefined {
  const source = recordValue(raw);
  if (!source) return undefined;
  const kind = sectionKind(source.kind, fallback.kind);
  const startFrame = Math.min(
    maxFrame,
    Math.max(minFrame, finiteInt(source.start_frame ?? source.startFrame, fallback.startFrame)),
  );
  const endFrame = Math.min(
    maxFrame,
    Math.max(startFrame, finiteInt(source.end_frame ?? source.endFrame, fallback.endFrame)),
  );
  return {
    id: stringValue(source.id, fallback.id),
    name: stringValue(source.name, fallback.name),
    kind,
    startFrame,
    endFrame,
    enabled: booleanValue(source.enabled, fallback.enabled),
    color: optionalString(source.color) ?? fallback.color,
    targetObjectId: optionalString(source.target_object_id ?? source.targetObjectId),
    propertyPath: optionalString(source.property_path ?? source.propertyPath),
    value: sectionValue(source.value),
  };
}

function normalizeSequencerTrack(
  raw: unknown,
  fallback: SequencerTrack,
  minFrame: number,
  maxFrame: number,
  index: number,
): SequencerTrack | undefined {
  const source = recordValue(raw);
  if (!source) return undefined;
  const kind = trackKind(source.kind, fallback.kind);
  const trackId = stringValue(source.id, fallback.id || `track-${index}`);
  const rawSections = Array.isArray(source.sections) ? source.sections : fallback.sections;
  const sections = rawSections
    .map((section, sectionIndex) => {
      const sectionFallback = createDefaultSequencerSection(
        sectionKindForTrack(kind),
        minFrame,
        maxFrame,
        `${trackId}-section-${sectionIndex}`,
      );
      return normalizeSequencerSection(
        section,
        fallback.sections[sectionIndex] ?? sectionFallback,
        minFrame,
        maxFrame,
      );
    })
    .filter((section): section is SequencerSection => Boolean(section));
  return {
    id: trackId,
    name: stringValue(source.name, fallback.name || TRACK_LABELS[kind]),
    kind,
    enabled: booleanValue(source.enabled, fallback.enabled),
    targetObjectId: optionalString(source.target_object_id ?? source.targetObjectId),
    sections,
  };
}

export function normalizeSequencerTracks(
  raw: unknown,
  minFrame: number,
  maxFrame: number,
): SequencerTrack[] {
  const defaults = createDefaultSequencerTracks(minFrame, maxFrame);
  if (!Array.isArray(raw)) return defaults;
  const tracks = raw
    .map((track, index) => normalizeSequencerTrack(
      track,
      defaults[index] ?? createDefaultSequencerTrack("system", minFrame, maxFrame, `track-${index}`),
      minFrame,
      maxFrame,
      index,
    ))
    .filter((track): track is SequencerTrack => Boolean(track));
  return tracks.length > 0 ? tracks : defaults;
}

export function normalizePrimeTimelineDocument(
  document: Partial<PrimeTimelineDocument> | undefined,
): PrimeTimelineDocument {
  const source = { ...defaultPrimeTimelineDocument, ...(document ?? {}) };
  const fps = clampFps(source.fps);
  const minFrame = finiteInt(source.minFrame, defaultPrimeTimelineDocument.minFrame);
  const requestedMax = finiteInt(source.maxFrame, defaultPrimeTimelineDocument.maxFrame);
  const maxFrame = Math.min(
    minFrame + MAX_DURATION_FRAMES,
    Math.max(minFrame + MIN_DURATION_FRAMES, requestedMax),
  );
  const previewStart = Math.min(
    maxFrame,
    Math.max(minFrame, finiteInt(source.previewStartFrame, minFrame)),
  );
  const previewEnd = Math.min(
    maxFrame,
    Math.max(previewStart, finiteInt(source.previewEndFrame, maxFrame)),
  );
  const currentFrame = Math.min(
    maxFrame,
    Math.max(minFrame, finiteInt(source.currentFrame, previewStart)),
  );
  return {
    version: 1,
    fps,
    minFrame,
    maxFrame,
    previewStartFrame: previewStart,
    previewEndFrame: previewEnd,
    currentFrame,
    playMode: playMode(source.playMode, defaultPrimeTimelineDocument.playMode),
    frameMode: frameMode(source.frameMode, defaultPrimeTimelineDocument.frameMode),
    tracks: normalizeSequencerTracks(source.tracks, minFrame, maxFrame),
  };
}

export function primeTimelineDuration(document: PrimeTimelineDocument): number {
  return Math.max(0, (document.maxFrame - document.minFrame) / document.fps);
}

export function frameToTime(frame: number, fps: number): number {
  return frame / Math.max(1, fps);
}

export function timeToFrame(time: number, fps: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.round(time * Math.max(1, fps));
}

export function parsePrimeTimelineDocument(raw: unknown): PrimeTimelineDocument | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  return normalizePrimeTimelineDocument({
    fps: source.fps as number,
    minFrame: source.min_frame as number ?? source.minFrame as number,
    maxFrame: source.max_frame as number ?? source.maxFrame as number,
    previewStartFrame: source.preview_start_frame as number ?? source.previewStartFrame as number,
    previewEndFrame: source.preview_end_frame as number ?? source.previewEndFrame as number,
    currentFrame: source.current_frame as number ?? source.currentFrame as number,
    playMode: source.play_mode as PrimeTimelinePlayMode ?? source.playMode as PrimeTimelinePlayMode,
    frameMode: source.frame_mode as PrimeTimelineFrameMode ?? source.frameMode as PrimeTimelineFrameMode,
    tracks: source.tracks as SequencerTrack[],
  });
}

export function serializePrimeTimelineDocument(document: PrimeTimelineDocument | undefined) {
  if (!document) return null;
  const timeline = normalizePrimeTimelineDocument(document);
  return {
    version: timeline.version,
    fps: timeline.fps,
    min_frame: timeline.minFrame,
    max_frame: timeline.maxFrame,
    preview_start_frame: timeline.previewStartFrame,
    preview_end_frame: timeline.previewEndFrame,
    current_frame: timeline.currentFrame,
    play_mode: timeline.playMode,
    frame_mode: timeline.frameMode,
    tracks: timeline.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      kind: track.kind,
      enabled: track.enabled,
      target_object_id: track.targetObjectId,
      sections: track.sections.map((section) => ({
        id: section.id,
        name: section.name,
        kind: section.kind,
        start_frame: section.startFrame,
        end_frame: section.endFrame,
        enabled: section.enabled,
        color: section.color,
        target_object_id: section.targetObjectId,
        property_path: section.propertyPath,
        value: section.value,
      })),
    })),
  };
}

export function timelineFromAnimationDocument(animation: AnimationDocument | undefined): PrimeTimelineDocument {
  if (!animation) return { ...defaultPrimeTimelineDocument };
  const fps = clampFps(animation.fps);
  const maxFrame = Math.max(1, timeToFrame(animation.duration, fps));
  return normalizePrimeTimelineDocument({
    fps,
    minFrame: 0,
    maxFrame,
    previewStartFrame: 0,
    previewEndFrame: maxFrame,
    currentFrame: timeToFrame(animation.playhead, fps),
    playMode: animation.loop === false ? "once" : "loop",
  });
}
