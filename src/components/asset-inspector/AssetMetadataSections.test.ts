import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../lib/api";
import {
  AssetAdvancedSection,
  AssetImportIssuesSection,
  AssetOverviewSection,
} from "./AssetMetadataSections";

const model: LibraryAsset = {
  guid: "0123456789abcdef0123456789abcdef",
  name: "Town Shop.glb",
  filename: "urban/Town Shop.glb",
  kind: "model",
  importerId: "braze.model",
  status: "ready",
  foreignIds: { unityPrefabGuid: "foreign-guid" },
  subAssets: [
    { localId: "main", kind: "model", name: "Town Shop" },
    { localId: "mesh:shop:4300000", kind: "mesh", name: "Shop" },
    { localId: "material:brick:2100000", kind: "material", name: "Brick" },
  ],
  dependencies: [{ kind: "texture", path: "textures/brick.png" }],
  diagnostics: [{ code: "MODEL_TEXTURE_MISSING", severity: "warning", message: "Brick texture is missing." }],
  path: "assets/urban/Town Shop.glb",
  url: "/3d-models/urban/Town%20Shop.glb",
  sizeBytes: 2048,
  updatedAt: "2026-08-29T12:00:00.000Z",
};

describe("asset Inspector metadata", () => {
  it("keeps the normal overview concise and author-facing", () => {
    const markup = renderToStaticMarkup(createElement(AssetOverviewSection, {
      asset: model,
      kind: "model",
      usageCount: 2,
      preview: createElement("div", { "data-testid": "preview" }),
    }));

    expect(markup).toContain("Town Shop.glb");
    expect(markup).toContain("1 mesh · 1 material");
    expect(markup).toContain("2 instances");
    expect(markup).not.toContain("0123456789abcdef");
    expect(markup).not.toContain("braze.model");
    expect(markup).not.toContain("mesh:shop:4300000");
  });

  it("keeps readable import problems visible", () => {
    const markup = renderToStaticMarkup(createElement(AssetImportIssuesSection, { asset: model }));

    expect(markup).toContain("Import warning");
    expect(markup).toContain("Brick texture is missing.");
    expect(markup).not.toContain("MODEL_TEXTURE_MISSING");
  });

  it("retains technical identity and pipeline data in a closed section", () => {
    const markup = renderToStaticMarkup(createElement(AssetAdvancedSection, { asset: model }));

    expect(markup).toContain("Advanced");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("0123456789abcdef");
    expect(markup).not.toContain("mesh:shop:4300000");
  });
});
