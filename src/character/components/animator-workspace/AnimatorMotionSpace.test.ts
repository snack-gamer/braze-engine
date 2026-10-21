import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BlendTree1D } from "../../domain/blend-tree";
import { AnimatorMotionSpace } from "./AnimatorMotionSpace";

describe("AnimatorMotionSpace 1D preview", () => {
  it("keeps an empty weight chart visible with actionable setup guidance", () => {
    const markup = render([]);

    expect(markup).toContain("No motions to blend");
    expect(markup).toContain("Drag Animation Clips");
    expect(markup).toContain('role="slider"');
    expect(markup).toContain("animator-motion-space__playhead");
    expect(markup).toContain("100%");
    expect(markup).toContain("0%");
  });

  it("explains that a single child supplies the full pose", () => {
    const markup = render([["walk", 0]]);

    expect(markup).toContain("Walk plays at 100%");
    expect(markup).toContain("Add another motion");
    expect(markup).toContain('role="slider"');
    expect(markup).toContain("animator-motion-space__envelope");
  });

  it("shows named thresholds, live weights, and a parameter playhead", () => {
    const markup = render([["walk", 0], ["run", 1]], 0.25);

    expect(markup).toContain("Speed = 0.25");
    expect(markup).toContain("Walk");
    expect(markup).toContain("Run");
    expect(markup).toContain("75%");
    expect(markup).toContain("25%");
    expect(markup).toContain("animator-motion-space__playhead");
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="1"');
    expect(markup).toContain('aria-valuetext="Walk 75%, Run 25%"');
    expect(markup).not.toContain("animator-motion-space__puck");
  });
});

function render(children: ReadonlyArray<readonly [string, number]>, value = 0): string {
  const tree: BlendTree1D = {
    kind: "1d",
    parameterId: "speed",
    children: children.map(([id, threshold]) => ({
      id,
      threshold,
      timeScale: 1,
      mirror: false,
      motion: { kind: "clip", clipRef: { guid: id }, speed: 1 },
    })),
  };
  return renderToStaticMarkup(createElement(AnimatorMotionSpace, {
    motion: { kind: "blendTree", tree },
    clips: children.map(([id]) => ({
      ref: { guid: id },
      label: id === "walk" ? "Walk" : "Run",
      sourceName: id,
      sourceFilename: `${id}.fbx`,
    })),
    parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }],
    values: { speed: value },
    onSetParameter: vi.fn(),
  }));
}
