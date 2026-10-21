import { describe, expect, it } from "vitest";
import { deriveSkeletonCompatibilitySignature } from "../domain/skeleton";
import { CharacterCodecError } from "./character-codec-values";
import { decodeSkeletonDefinition, encodeSkeletonDefinition } from "./skeleton-definition-codec";

const MODEL_GUID = "1".repeat(32);

function legacySkeleton() {
  return {
    version: "braze/skeleton-v0",
    id: "skeleton:main",
    name: "Main Skeleton",
    source_ref: { guid: MODEL_GUID, local_id: "main" },
    bones: [
      {
        id: "bone:hips",
        name: "Hips",
        path: "Armature/Hips",
        bind_local: { position: [0, 1, 0], rotation: [0, 0, 0, 2], scale: [1, 1, 1] },
      },
      {
        id: "bone:spine",
        name: "Spine",
        path: "Armature/Hips/Spine",
        parent_id: "bone:hips",
        bind_local: { translation: [0, 0.4, 0] },
      },
    ],
    futureSkeletonMetadata: { retained: true },
  };
}

describe("skeleton definition codec", () => {
  it("migrates aliases, derives roots/signature, and round-trips", () => {
    const decoded = decodeSkeletonDefinition(legacySkeleton());
    expect(decoded.rootBoneIds).toEqual(["bone:hips"]);
    expect(decoded.sourceRef).toEqual({ guid: MODEL_GUID, localId: "main" });
    expect(decoded.bones[0]?.bindLocal.rotation).toEqual([0, 0, 0, 1]);
    expect(decoded.compatibilitySignature).toMatch(/^skeleton-v1-[a-f0-9]{16}$/);
    expect(decoded.extensions).toEqual({ futureSkeletonMetadata: { retained: true } });
    expect(decodeSkeletonDefinition(encodeSkeletonDefinition(decoded))).toEqual(decoded);
    expect(encodeSkeletonDefinition(decoded)).toMatchObject({
      futureSkeletonMetadata: { retained: true },
    });
  });

  it("keeps compatibility signatures order-independent and bind-pose-sensitive", () => {
    const skeleton = decodeSkeletonDefinition(legacySkeleton());
    const reversed = [...skeleton.bones].reverse();
    expect(deriveSkeletonCompatibilitySignature(reversed)).toBe(skeleton.compatibilitySignature);
    const changed = skeleton.bones.map((bone) => bone.id === "bone:spine"
      ? { ...bone, bindLocal: { ...bone.bindLocal, translation: [0, 0.5, 0] as [number, number, number] } }
      : bone);
    expect(deriveSkeletonCompatibilitySignature(changed)).not.toBe(skeleton.compatibilitySignature);
  });

  it.each([
    {
      ...legacySkeleton(),
      bones: [{ id: "same", name: "A" }, { id: "same", name: "B" }],
    },
    {
      ...legacySkeleton(),
      bones: [{ id: "a", name: "A", parentId: "missing" }],
    },
    {
      ...legacySkeleton(),
      bones: [
        { id: "a", name: "A", parentId: "b" },
        { id: "b", name: "B", parentId: "a" },
      ],
    },
  ])("rejects duplicate, dangling, and cyclic bone topologies", (document) => {
    expect(() => decodeSkeletonDefinition(document)).toThrowError(CharacterCodecError);
  });

  it("rejects unsupported future skeleton documents", () => {
    expect(() => decodeSkeletonDefinition({ version: "braze/skeleton-v2", bones: [] }))
      .toThrowError(CharacterCodecError);
  });
});
