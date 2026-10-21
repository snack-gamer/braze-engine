import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ImportedCharacterAssetOption } from "../../application/imported-character-assets";
import { AnimatorClipEventsSummary } from "./AnimatorClipEventsSummary";

const CLIP: ImportedCharacterAssetOption = {
  ref: { guid: "a".repeat(32), localId: "clip:idle" },
  label: "Idle — Hero",
  sourceName: "Hero",
  sourceFilename: "hero.glb",
  durationSeconds: 1,
  events: [{ id: "step", name: "Footstep", timeSeconds: 0.25, payload: {} }],
};

describe("AnimatorClipEventsSummary", () => {
  it("lists imported and state-local events without making state events editable", () => {
    const markup = renderToStaticMarkup(createElement(AnimatorClipEventsSummary, {
      clip: CLIP,
      stateEvents: [{
        id: "land",
        name: "Land",
        timeNormalized: 0.5,
        payload: {},
      }],
    }));

    expect(markup).toContain("<span>2</span>");
    expect(markup).toContain("Footstep");
    expect(markup).toContain("0.25 s");
    expect(markup).toContain("Land");
    expect(markup).toContain("50%");
    expect(markup).toContain('data-event-source="state"');
    expect(markup.match(/<button/g)).toHaveLength(1);
  });

  it("shows state events even when the imported clip metadata is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(AnimatorClipEventsSummary, {
      clip: undefined,
      stateEvents: [{
        id: "event-1",
        name: "Event 1",
        timeNormalized: 0.7,
        payload: {},
      }],
    }));

    expect(markup).toContain("<span>1</span>");
    expect(markup).toContain("Event 1");
    expect(markup).toContain("70%");
    expect(markup).not.toContain("Assign an imported Clip");
  });
});
