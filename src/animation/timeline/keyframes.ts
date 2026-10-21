import type { TransformChannelKeyframeRef } from "../types";
import { createAuthoredId } from "../../identity/authored-id";
import type { TimelineKey } from "./types";

export function keyRefId(ref: TransformChannelKeyframeRef): string {
  return `${ref.trackId}:${ref.channelId}:${ref.keyframeId}`;
}

export function pastedKeyId(_index: number): string {
  return createAuthoredId("ck-paste");
}

export function uniqueTimes(keys: TimelineKey[]): TimelineKey[] {
  const byTime = new Map<number, TimelineKey>();
  for (const key of keys) byTime.set(key.time, key);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
