import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/asset-api";
import { defaultModelImportSettings } from "../../lib/model-import-settings";
import { ModelImportAnimationTab } from "./ModelImportAnimationTab";

const asset: LibraryAsset = {
  name: "Hero",
  filename: "Hero.glb",
  path: "assets/Hero.glb",
  url: "/3d-models/Hero.glb",
  sizeBytes: 1,
  subAssets: [
    {
      localId: "clip:Attack:a",
      kind: "clip",
      name: "Attack",
      sourceName: "Take 001",
      sourceIndex: 0,
      frameRate: 30,
      sourceFirstFrame: 0,
      sourceLastFrame: 51,
      looping: false,
    },
    { localId: "clip:Attack:b", kind: "clip", name: "Attack", sourceIndex: 1, looping: true },
  ],
};

function render(importAnimations = true) {
  return renderToStaticMarkup(createElement(ModelImportAnimationTab, {
    asset,
    settings: { ...defaultModelImportSettings, importAnimations },
    patch: () => undefined,
  }));
}

describe("ModelImportAnimationTab", () => {
  it("shows source-backed clip selection, timing, naming, and loop controls", () => {
    const markup = render();
    expect(markup).toContain("Source Take");
    expect(markup).toContain("Take 001");
    expect(markup).toContain('aria-label="Imported animation clips"');
    expect(markup).toContain('aria-label="Add animation clip"');
    expect(markup).toContain('aria-label="Remove selected animation clip"');
    expect(markup).toContain('aria-label="Animation clip name"');
    expect(markup).toContain('aria-label="Animation clip start frame"');
    expect(markup).toContain('aria-label="Animation clip end frame"');
    expect(markup).toContain("Length 1.700 s");
    expect(markup).toContain("30 FPS");
    expect(markup).toContain('aria-label="Animation clip start handle"');
    expect(markup).toMatch(/aria-checked="false" aria-label="Loop Time"/);
    expect(markup).toMatch(/aria-checked="false" aria-label="Loop Pose"/);
  });

  it("does not offer playback controls while animation import is disabled", () => {
    expect(render(false)).not.toContain("Source Take");
  });
});
