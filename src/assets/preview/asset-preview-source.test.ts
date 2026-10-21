import { describe, expect, it } from "vitest";
import {
  assetPreviewKey,
  assetPreviewSourceUrl,
  modelPreviewPrimitive,
  refreshedAssetPreviewRevision,
} from "./asset-preview-source";

describe("asset preview source", () => {
  it("separates cache records by kind, source and content revision", () => {
    expect(assetPreviewKey({ kind: "model", url: "/assets/shop.glb", revision: "r1" }))
      .not.toBe(assetPreviewKey({ kind: "model", url: "/assets/shop.glb", revision: "r2" }));
    expect(assetPreviewKey({ kind: "model", url: "/assets/studio.hdr", revision: "r1" }))
      .not.toBe(assetPreviewKey({ kind: "hdri", url: "/assets/studio.hdr", revision: "r1" }));
    expect(assetPreviewKey({ kind: "model", url: "/assets/shop.glb", size: "thumbnail" }))
      .not.toBe(assetPreviewKey({ kind: "model", url: "/assets/shop.glb", size: "inspector" }));
  });

  it("preserves existing query parameters and fragments while cache busting", () => {
    expect(assetPreviewSourceUrl({
      kind: "model",
      url: "/3d-models/Shop.glb?quality=high#mesh",
      revision: "import 2",
    })).toBe("/3d-models/Shop.glb?quality=high&previewRevision=import+2&importVersion=import+2#mesh");
  });

  it("does not add model import settings parameters to direct images", () => {
    expect(assetPreviewSourceUrl({
      kind: "image",
      url: "/3d-models/Textures/Atlas.png",
      revision: "image-r2",
    })).toBe("/3d-models/Textures/Atlas.png?previewRevision=image-r2");
  });

  it("leaves immutable inline sources alone", () => {
    expect(assetPreviewSourceUrl({ kind: "image", url: "data:image/png;base64,abc", revision: "r1" }))
      .toBe("data:image/png;base64,abc");
  });

  it("resolves model loaders independently of revision queries", () => {
    expect(modelPreviewPrimitive("/models/prop.fbx?importVersion=2")).toBe("fbx");
    expect(modelPreviewPrimitive("/models/prop.usd#root")).toBe("usdz");
    expect(modelPreviewPrimitive("/models/prop.glb?previewRevision=3")).toBe("gltf");
  });

  it("retains both source changes and explicit refresh generations", () => {
    expect(refreshedAssetPreviewRevision("source-r1", null, 0)).toBe("source-r1");
    expect(refreshedAssetPreviewRevision("source-r1", "import-r2", 4))
      .toBe("source-r1|import-r2|refresh-4");
    expect(refreshedAssetPreviewRevision("source-r3", "import-r2", 4))
      .toBe("source-r3|import-r2|refresh-4");
  });
});
