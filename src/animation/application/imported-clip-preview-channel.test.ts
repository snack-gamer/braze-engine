import { describe, expect, it, vi } from "vitest";
import { createImportedClipPreviewChannel } from "./imported-clip-preview-channel";

const clipRef = { guid: "a".repeat(32), localId: "clip:idle" };

describe("imported clip preview channel", () => {
  it("replays the latest sample to a late Scene viewport subscriber", () => {
    const channel = createImportedClipPreviewChannel();
    channel.publish({ clipRef, timeSeconds: 0.75 });
    const listener = vi.fn();

    channel.subscribe(listener);

    expect(listener).toHaveBeenCalledWith({ clipRef, timeSeconds: 0.75 });
  });

  it("clears once and releases unsubscribed listeners", () => {
    const channel = createImportedClipPreviewChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    channel.publish({ clipRef, timeSeconds: 0.25 });
    channel.clear();
    channel.clear();
    unsubscribe();
    channel.publish({ clipRef, timeSeconds: 0.5 });

    expect(listener.mock.calls).toEqual([
      [null],
      [{ clipRef, timeSeconds: 0.25 }],
      [null],
    ]);
  });

  it("normalizes invalid time without changing authored data", () => {
    const channel = createImportedClipPreviewChannel();
    const listener = vi.fn();
    channel.subscribe(listener);

    channel.publish({ clipRef, timeSeconds: Number.NaN });

    expect(listener).toHaveBeenLastCalledWith({ clipRef, timeSeconds: 0 });
  });
});
