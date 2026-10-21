import { describe, expect, it } from "vitest";
import { primaryImportedRigSummary } from "./imported-rig-summary";

describe("imported rig summaries", () => {
  it("selects the richest generated Avatar and ignores malformed bones", () => {
    const summary = primaryImportedRigSummary({
      subAssets: [
        { localId: "main", kind: "model", name: "Character" },
        {
          localId: "avatar:small",
          kind: "avatar",
          name: "Small",
          bones: [{ localId: "bone:root", name: "Root", path: "Root", parentLocalId: null }],
          skins: [{}],
        } as never,
        {
          localId: "avatar:body",
          kind: "avatar",
          name: "Body",
          skeletonSignature: "sig-body",
          skeletonRoot: { localId: "bone:hips" },
          bones: [
            { localId: "bone:hips", name: "Hips", path: "Hips", parentLocalId: null },
            { localId: "bone:spine", name: "Spine", path: "Hips/Spine", parentLocalId: "bone:hips" },
            { localId: "", name: "Broken" },
          ],
          skins: [{}, {}],
        } as never,
      ],
    });

    expect(summary).toMatchObject({
      localId: "avatar:body",
      skeletonSignature: "sig-body",
      rootBoneId: "bone:hips",
      skinCount: 2,
    });
    expect(summary?.bones.map((bone) => bone.id)).toEqual(["bone:hips", "bone:spine"]);
  });
});
