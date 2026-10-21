import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AnimatorClipLoopSelect,
  animatorClipLoopModeFromSelection,
  animatorClipLoopSelection,
} from "./AnimatorClipLoopSelect";

describe("AnimatorClipLoopSelect", () => {
  it("presents inherited authored state as the explicit source selection", () => {
    const markup = renderToStaticMarkup(createElement(AnimatorClipLoopSelect, {
      value: undefined,
      sourceLooping: false,
      onChange: () => undefined,
    }));

    expect(animatorClipLoopSelection(undefined)).toBe("source");
    expect(markup).toContain('<option value="source" selected="">Clip Default (Play Once)</option>');
  });

  it("decodes the source selection back to an omitted authored override", () => {
    expect(animatorClipLoopModeFromSelection("source")).toBeUndefined();
    expect(animatorClipLoopModeFromSelection("loop")).toBe("loop");
    expect(animatorClipLoopModeFromSelection("once")).toBe("once");
    expect(animatorClipLoopModeFromSelection("invalid")).toBeUndefined();
  });
});
