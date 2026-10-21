import type {
  TransformChannelKeyframe,
  TransformChannelKeyframeInsert,
} from "../types";
import { keyRefId } from "./keyframes";
import type { TimelineKeyEntry } from "./types";

export type TimelineKeyClipboardItem = {
  trackId: string;
  channelId: string;
  offset: number;
  keyframe: Omit<TransformChannelKeyframe, "id" | "time">;
};

export function copyTimelineKeys(entries: TimelineKeyEntry[]): TimelineKeyClipboardItem[] {
  if (entries.length === 0) return [];
  const minTime = Math.min(...entries.map((entry) => entry.key.time));
  return entries.map((entry) => ({
    trackId: entry.ref.trackId,
    channelId: entry.ref.channelId,
    offset: entry.key.time - minTime,
    keyframe: {
      value: entry.key.value,
      interpolation: entry.key.interpolation,
      inTangent: entry.key.inTangent,
      outTangent: entry.key.outTangent,
    },
  }));
}

export function pasteTimelineKeys(
  clipboard: TimelineKeyClipboardItem[],
  anchorTime: number,
  createId: (index: number) => string,
): TransformChannelKeyframeInsert[] {
  return clipboard.map((item, index) => ({
    trackId: item.trackId,
    channelId: item.channelId,
    keyframe: {
      id: createId(index),
      time: anchorTime + item.offset,
      ...item.keyframe,
    },
  }));
}

export function pastedKeySelection(inserts: TransformChannelKeyframeInsert[]): Set<string> {
  return new Set(inserts.map((insert) => keyRefId({
    trackId: insert.trackId,
    channelId: insert.channelId,
    keyframeId: insert.keyframe.id,
  })));
}
