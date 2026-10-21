import { useSyncExternalStore } from "react";
import type { TimelinePlaybackSource } from "./playback-state";

const inactiveSubscription = () => () => undefined;

export function useTimelinePlaybackSnapshot(source: TimelinePlaybackSource, active = true) {
  return useSyncExternalStore(
    active ? source.subscribe : inactiveSubscription,
    source.getSnapshot,
    source.getSnapshot,
  );
}
