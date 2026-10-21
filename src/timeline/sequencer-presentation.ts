import type { SceneObject } from "../types";
import type {
  PrimeTimelinePlayMode,
  SequencerSection,
  SequencerSectionKind,
  SequencerTrack,
  SequencerTrackKind,
} from "./types";

export type SelectedSequencerSection = Readonly<{
  trackId: string;
  sectionId: string;
}>;

export type SelectedSequencerItem = Readonly<{
  track: SequencerTrack;
  section: SequencerSection;
}>;

export const PLAY_MODE_LABELS: Record<PrimeTimelinePlayMode, string> = {
  once: "Once",
  loop: "Loop",
  pingpong: "Ping-Pong",
};

export const SECTION_KIND_LABELS: Record<SequencerSectionKind, string> = {
  range: "Range",
  animation: "Animation",
  activation: "Visibility",
  property: "Property",
};

const TRACK_KIND_LABELS: Record<SequencerTrackKind, string> = {
  master: "Master",
  animation: "Animation",
  activation: "Activation",
  property: "Property",
  system: "System",
};

const USER_TRACK_KINDS = new Set<SequencerTrackKind>(["animation", "activation", "property"]);

export function isUserSequencerTrack(track: SequencerTrack): boolean {
  return USER_TRACK_KINDS.has(track.kind);
}

export function formatFrameTime(frame: number, fps: number): string {
  return `${(frame / Math.max(1, fps)).toFixed(2)}s`;
}

export function nextPlayMode(mode: PrimeTimelinePlayMode): PrimeTimelinePlayMode {
  if (mode === "once") return "loop";
  if (mode === "loop") return "pingpong";
  return "once";
}

export function framePercent(frame: number, minFrame: number, maxFrame: number): number {
  const span = Math.max(1, maxFrame - minFrame);
  return Math.min(100, Math.max(0, ((frame - minFrame) / span) * 100));
}

export function timelineTicks(minFrame: number, maxFrame: number): number[] {
  const span = Math.max(1, maxFrame - minFrame);
  const target = Math.max(1, span / 8);
  const step = target <= 5 ? 5
    : target <= 10 ? 10
      : target <= 25 ? 25
        : target <= 50 ? 50
          : target <= 100 ? 100
            : Math.ceil(target / 100) * 100;
  const first = Math.ceil(minFrame / step) * step;
  const ticks: number[] = [];
  for (let frame = first; frame <= maxFrame; frame += step) ticks.push(frame);
  if (!ticks.includes(minFrame)) ticks.unshift(minFrame);
  if (!ticks.includes(maxFrame)) ticks.push(maxFrame);
  return ticks;
}

export function frameAtClientX(
  clientX: number,
  left: number,
  width: number,
  minFrame: number,
  maxFrame: number,
): number {
  const ratio = width <= 0 ? 0 : (clientX - left) / width;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(minFrame + clamped * (maxFrame - minFrame));
}

export function findSelectedSection(
  tracks: SequencerTrack[],
  selected: SelectedSequencerSection | null,
): SelectedSequencerItem | null {
  if (!selected) return null;
  const track = tracks.find((item) => item.id === selected.trackId);
  const section = track?.sections.find((item) => item.id === selected.sectionId);
  return track && section ? { track, section } : null;
}

export function labelForTrack(track: SequencerTrack, objects: SceneObject[]): string {
  if (track.targetObjectId) {
    const object = objects.find((item) => item.id === track.targetObjectId);
    if (object?.primitive === "camera") return "Camera";
    if (object) return track.kind === "activation" ? "Visibility" : "Object";
  }
  if (track.kind === "activation") return "Visibility";
  return TRACK_KIND_LABELS[track.kind];
}
