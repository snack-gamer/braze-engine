import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../lib/asset-api";
import { createLibraryAssetSceneObject } from "./application/create-library-asset-scene-object";

const GUID = "b".repeat(32);

function riggedFbx(): LibraryAsset {
  return {
    guid: GUID,
    name: "Runner.fbx",
    filename: "Characters/Runner.fbx",
    kind: "model",
    status: "ready",
    path: "assets/Characters/Runner.fbx",
    url: "/3d-models/Characters/Runner.fbx",
    sizeBytes: 1,
    subAssets: [{
      kind: "avatar",
      localId: "avatar:runner",
      name: "Runner Avatar",
      configuredRigKind: "generic",
      bones: [{ localId: "bone:Hips", name: "Hips", path: "Hips" }],
    }],
  };
}

describe("scene insertion from imported assets", () => {
  it("adds a non-playing Animator default to a configured rigged FBX", () => {
    const object = createLibraryAssetSceneObject(riggedFbx(), [], undefined);
    expect(object.primitive).toBe("fbx");
    expect(object.animator).toMatchObject({
      enabled: true,
      avatarRef: { guid: GUID, localId: "avatar:runner" },
    });
    expect(object.animator?.controllerRef).toBeUndefined();
  });

  it("leaves unconfigured imported models free of speculative gameplay behavior", () => {
    const source = riggedFbx();
    const object = createLibraryAssetSceneObject({ ...source, subAssets: [] }, [], undefined);
    expect(object.animator).toBeUndefined();
  });
});
