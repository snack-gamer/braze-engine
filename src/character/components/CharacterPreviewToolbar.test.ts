import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterPreviewToolbar } from "./CharacterPreviewToolbar";

describe("CharacterPreviewToolbar", () => {
  it("presents clip playback as a named player with a themed progress track", () => {
    const markup = renderToStaticMarkup(createElement(CharacterPreviewToolbar, {
      clips: [{ index: 0, name: "Walk" }],
      playback: { clipIndex: 0, timeSeconds: 1, durationSeconds: 4, playing: false },
      skeletonVisible: true,
      gridVisible: true,
      gridOpacity: 0.25,
      onClipChange: () => undefined,
      onPlayingChange: () => undefined,
      onTimeChange: () => undefined,
      onSkeletonVisibleChange: () => undefined,
      onGridVisibleChange: () => undefined,
      onGridOpacityChange: () => undefined,
      onResetPose: () => undefined,
      onResetView: () => undefined,
    }));

    expect(markup).toContain('aria-label="Animation preview player"');
    expect(markup).toContain('aria-label="Play animation preview"');
    expect(markup).toContain('aria-label="Animation timeline"');
    expect(markup).toContain('aria-valuetext="0:01.00 of 0:04.00"');
    expect(markup).toContain("editor-range-control__track");
    expect(markup).toContain("editor-range-control__fill");
  });
});
