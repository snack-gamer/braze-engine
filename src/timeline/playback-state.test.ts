import { describe, expect, it, vi } from "vitest";
import { normalizePrimeTimelineDocument } from "./document";
import { createTimelinePlaybackSample, TimelinePlaybackStore } from "./playback-state";

describe("TimelinePlaybackStore", () => {
  it("publishes the exact frame sample without changing the authored document", () => {
    const authored = normalizePrimeTimelineDocument({ currentFrame: 4, fps: 30 });
    const initial = createTimelinePlaybackSample(authored, authored.currentFrame, 0, {
      playing: false,
      scrubbing: false,
      direction: 1,
    });
    const store = new TimelinePlaybackStore(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const runtimeDocument = { ...authored, currentFrame: 5 };
    const sample = createTimelinePlaybackSample(runtimeDocument, authored.currentFrame, 0, {
      playing: true,
      scrubbing: false,
      direction: 1,
    });

    store.publish(sample);

    expect(store.getSnapshot()).toBe(sample);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(authored.currentFrame).toBe(4);
    unsubscribe();
    store.publish({ ...sample, frame: 6 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
