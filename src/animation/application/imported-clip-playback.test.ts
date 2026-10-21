import { describe, expect, it } from "vitest";
import {
  advanceImportedClipPlayback,
  startImportedClipPlayback,
} from "./imported-clip-playback";

describe("imported clip preview playback", () => {
  it("always starts at the beginning", () => {
    expect(startImportedClipPlayback(true)).toEqual({ timeSeconds: 0, playing: true });
  });

  it("stops on the final pose when looping is off", () => {
    expect(advanceImportedClipPlayback(0.9, 0.2, 1, false)).toEqual({
      timeSeconds: 1,
      playing: false,
    });
  });

  it("wraps while remaining active when looping is on", () => {
    const result = advanceImportedClipPlayback(0.9, 0.2, 1, true);
    expect(result.playing).toBe(true);
    expect(result.timeSeconds).toBeCloseTo(0.1);
  });
});
