import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultModelImportSettings } from "../../lib/model-import-settings";
import { ModelImportModelTab } from "./ModelImportModelTab";

function renderModelTab(
  overrides: Partial<typeof defaultModelImportSettings> = {},
): string {
  return renderToStaticMarkup(createElement(ModelImportModelTab, {
    settings: { ...defaultModelImportSettings, ...overrides },
    patch: () => undefined,
  }));
}

describe("ModelImportModelTab", () => {
  it("organizes functional options into user-facing inspector groups", () => {
    const markup = renderModelTab();

    expect(markup).toContain("Scale &amp; Units");
    expect(markup).toContain("Included Content");
    expect(markup).toContain("Object Structure");
    expect(markup).toContain("Surface Shading");
    expect(markup).toContain('aria-label="Model scale"');
    expect(markup).toContain('aria-label="Include Cameras"');
  });

  it("does not advertise settings that the importer does not implement", () => {
    const markup = renderModelTab();

    expect(markup).not.toContain("Bake Axis Conversion");
    expect(markup).not.toContain("Mesh Compression");
    expect(markup).not.toContain("Read/Write");
    expect(markup).not.toContain("Optimize Mesh");
    expect(markup).not.toContain("Generate Colliders");
  });

  it("reveals dependent controls only when they can affect the import", () => {
    expect(renderModelTab({ convertUnits: false })).not.toContain("Source Units");
    expect(renderModelTab({ normals: "import" })).not.toContain("Weighting");

    const recalculated = renderModelTab({ normals: "calculate", smoothnessSource: "fromAngle" });
    expect(recalculated).toContain("Weighting");
    expect(recalculated).toContain("Smoothing");
    expect(recalculated).toContain("Smooth Angle");
  });
});
