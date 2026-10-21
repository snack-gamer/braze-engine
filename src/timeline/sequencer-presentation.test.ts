import { describe, expect, it } from "vitest";
import { createDefaultSequencerTrack } from "./document";
import {
  findSelectedSection,
  frameAtClientX,
  framePercent,
  nextPlayMode,
  timelineTicks,
} from "./sequencer-presentation";

describe("sequencer presentation geometry", () => {
  it("maps and clamps pointer positions to the authored frame range", () => {
    expect(frameAtClientX(150, 100, 200, 20, 120)).toBe(45);
    expect(frameAtClientX(0, 100, 200, 20, 120)).toBe(20);
    expect(frameAtClientX(400, 100, 200, 20, 120)).toBe(120);
    expect(frameAtClientX(400, 100, 0, 20, 120)).toBe(20);
  });

  it("builds bounded percentages and inclusive readable ticks", () => {
    expect(framePercent(-10, 0, 120)).toBe(0);
    expect(framePercent(60, 0, 120)).toBe(50);
    expect(framePercent(150, 0, 120)).toBe(100);
    expect(timelineTicks(3, 123)).toEqual([3, 25, 50, 75, 100, 123]);
  });

  it("cycles every play mode", () => {
    expect(nextPlayMode("once")).toBe("loop");
    expect(nextPlayMode("loop")).toBe("pingpong");
    expect(nextPlayMode("pingpong")).toBe("once");
  });

  it("resolves selection only while both track and section still exist", () => {
    const track = createDefaultSequencerTrack("animation", 0, 20, "animation-track");
    const sectionId = track.sections[0].id;
    expect(findSelectedSection([track], { trackId: track.id, sectionId })?.section.id).toBe(sectionId);
    expect(findSelectedSection([track], { trackId: track.id, sectionId: "missing" })).toBeNull();
  });
});
