import { describe, expect, it } from "vitest";
import { normalizePrimeTimelineDocument } from "../timeline/document";
import { createAnimationDocument } from "./document";
import { animationDocumentAtTimeline } from "./timeline-document";

describe("animationDocumentAtTimeline", () => {
  it("uses timeline transport values without replacing authored tracks", () => {
    const source = createAnimationDocument();
    const timeline = normalizePrimeTimelineDocument({
      fps: 60,
      minFrame: 0,
      maxFrame: 120,
      currentFrame: 30,
      playMode: "loop",
    });

    const projected = animationDocumentAtTimeline(source, timeline);

    expect(projected).toMatchObject({ duration: 2, fps: 60, playhead: 0.5, loop: true });
    expect(projected.tracks).toBe(source.tracks);
    expect(projected.motionSources).toBe(source.motionSources);
  });

  it("clamps a runtime playhead at the timeline duration", () => {
    const source = createAnimationDocument();
    const timeline = normalizePrimeTimelineDocument({ fps: 30, maxFrame: 30 });
    expect(animationDocumentAtTimeline(source, timeline, 5).playhead).toBe(1);
  });
});
