import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModelAnimationClipSource } from "../../character/application/model-animation-clip-settings";
import type { LibraryAsset } from "../../lib/asset-api";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn((_props: unknown) => null),
}));

vi.mock("../../character/components/CharacterPreviewWorkspace", () => ({
  CharacterPreviewWorkspace: mocks.workspace,
}));

import { ModelImportAnimationPreview } from "./ModelImportAnimationPreview";

const asset: LibraryAsset = {
  name: "Hero",
  filename: "Hero.fbx",
  path: "assets/Hero.fbx",
  url: "/3d-models/Hero.fbx",
  sizeBytes: 1,
};

const clip: ModelAnimationClipSource = {
  localId: "clip:Take",
  name: "Take",
  origin: "source",
  sourceName: "Take",
  sourceIndex: 0,
  sourceTakeLocalId: "clip:Take",
  runtimeClipIndex: 0,
  sourceLooping: true,
  frameRate: null,
  sourceFirstFrame: null,
  sourceLastFrame: null,
};

describe("ModelImportAnimationPreview", () => {
  it("forwards full-take Loop Pose drafts without editable frame metadata", () => {
    renderToStaticMarkup(createElement(ModelImportAnimationPreview, {
      asset,
      clip,
      settings: {
        name: "Take",
        looping: true,
        loopPose: true,
        firstFrame: null,
        lastFrame: null,
      },
    }));

    expect(mocks.workspace).toHaveBeenCalledWith(expect.objectContaining({
      previewTarget: {
        localId: "clip:Take",
        requiredClipIndex: 0,
        draftClip: {
          sourceIndex: 0,
          looping: true,
          loopPose: true,
        },
      },
    }), undefined);
  });
});
