import { describe, expect, it } from "vitest";
import { normalizePrimeTimelineDocument } from "./document";
import {
  appendSequencerSection,
  appendSequencerTrack,
  removeSequencerTrack,
  resizeTimelinePatch,
  retimeTimelinePatch,
} from "./timeline-document-operations";

describe("timeline document operations", () => {
  it("retimes the range, playhead, and sections while preserving wall-clock time", () => {
    const document = normalizePrimeTimelineDocument({
      fps: 24,
      minFrame: 0,
      maxFrame: 120,
      previewStartFrame: 24,
      previewEndFrame: 96,
      currentFrame: 48,
    });

    const patch = retimeTimelinePatch(document, 48);

    expect(patch).toMatchObject({
      fps: 48,
      minFrame: 0,
      maxFrame: 240,
      previewStartFrame: 48,
      previewEndFrame: 192,
      currentFrame: 96,
    });
    expect(patch.tracks?.[0]?.sections[0]).toMatchObject({ startFrame: 0, endFrame: 240 });
  });

  it("only follows duration changes with a preview range already touching the end", () => {
    const fullPreview = normalizePrimeTimelineDocument({ fps: 24, maxFrame: 120, previewEndFrame: 120 });
    const customPreview = normalizePrimeTimelineDocument({ fps: 24, maxFrame: 120, previewEndFrame: 72 });

    expect(resizeTimelinePatch(fullPreview, 10).previewEndFrame).toBe(240);
    expect(resizeTimelinePatch(customPreview, 10).previewEndFrame).toBe(72);
  });

  it("places object tracks and sections at the playhead for a two-second span", () => {
    const document = normalizePrimeTimelineDocument({
      fps: 24,
      currentFrame: 80,
      previewEndFrame: 100,
    });
    const added = appendSequencerTrack(document, "activation", {
      name: "Hero Visibility",
      targetObjectId: "hero",
    }, "track-hero");
    const activation = added.tracks[added.tracks.length - 1];

    expect(activation).toMatchObject({ name: "Hero Visibility", targetObjectId: "hero" });
    expect(activation?.sections[0]).toMatchObject({ startFrame: 80, endFrame: 100, targetObjectId: "hero" });

    const withSection = appendSequencerSection(
      { ...document, tracks: added.tracks },
      added.trackId,
      "section-2",
    );
    const editedTrack = withSection[withSection.length - 1];
    expect(editedTrack?.sections[editedTrack.sections.length - 1]).toMatchObject({
      id: "section-2",
      kind: "activation",
      startFrame: 80,
      endFrame: 100,
    });
  });

  it("protects master tracks from removal", () => {
    const document = normalizePrimeTimelineDocument(undefined);
    expect(removeSequencerTrack(document.tracks, "track-scene")).toEqual(document.tracks);
  });
});
