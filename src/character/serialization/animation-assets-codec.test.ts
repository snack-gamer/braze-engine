import { describe, expect, it } from "vitest";
import { CHARACTER_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { CharacterCodecError } from "./character-codec-values";
import { decodeAnimationClipAsset, encodeAnimationClipAsset } from "./animation-clip-codec";
import { decodeAvatarMaskAsset, encodeAvatarMaskAsset } from "./avatar-mask-codec";

const MODEL_GUID = "4".repeat(32);
const AVATAR_GUID = "5".repeat(32);

describe("character animation asset codecs", () => {
  it("migrates, bounds, and round-trips clip metadata and AssetRef bindings", () => {
    const decoded = decodeAnimationClipAsset({
      id: "clip:run",
      name: "Run",
      asset_ref: { guid: MODEL_GUID, local_id: "clip:Run" },
      source_model_ref: { guid: MODEL_GUID, local_id: "main" },
      source_rig: {
        kind: "humanoid",
        avatar_ref: { guid: AVATAR_GUID, local_id: "avatar:Human" },
        compatibility_signature: "skeleton-v1-source",
      },
      duration_seconds: 2,
      sample_rate_hz: 60,
      loop_time: false,
      bindings: [
        { kind: "bone", bone_id: "bone:hips", channels: ["translation", "rotation", "unknown"] },
        { kind: "blendShape", node_path: "Face", blend_shape_name: "Smile" },
        { kind: "garbage" },
      ],
      events: [
        { id: "foot", name: "Footstep", time_seconds: 99, payload: { foot: "left", nested: {} } },
      ],
      root_motion: {
        source_bone_id: "bone:hips",
        has_translation: true,
        has_rotation: true,
        average_velocity: [0, 0, 3],
        average_angular_speed_degrees: 15,
      },
      futureClipMetadata: { retained: true },
    });

    expect(decoded.sourceRig.avatarRef).toEqual({ guid: AVATAR_GUID, localId: "avatar:Human" });
    expect(decoded.looping).toBe(false);
    expect(decoded.bindings).toHaveLength(2);
    expect(decoded.bindings[0]).toMatchObject({ channels: ["translation", "rotation"] });
    expect(decoded.events[0]).toMatchObject({ timeSeconds: 2, payload: { foot: "left" } });
    expect(decoded.extensions).toEqual({ futureClipMetadata: { retained: true } });
    expect(decodeAnimationClipAsset(encodeAnimationClipAsset(decoded))).toEqual(decoded);
  });

  it("round-trips masks for both Humanoid body parts and Generic bones", () => {
    const decoded = decodeAvatarMaskAsset({
      id: "mask:upper-body",
      name: "Upper Body",
      source_ref: { guid: AVATAR_GUID, local_id: "mask:upper-body" },
      humanoid_body_parts: { body: true, leftArm: true, rightArm: true, unknown: true },
      transforms: [
        { bone_id: "bone:spine", path: "Armature/Hips/Spine", active: true },
        { path: "", active: true },
      ],
    });
    expect(decoded.humanoidBodyParts).toEqual({ body: true, leftArm: true, rightArm: true });
    expect(decoded.transforms).toEqual([{ boneId: "bone:spine", path: "Armature/Hips/Spine", active: true }]);
    expect(decodeAvatarMaskAsset(encodeAvatarMaskAsset(decoded))).toEqual(decoded);
  });

  it("rejects malformed clip identities and future documents", () => {
    expect(() => decodeAnimationClipAsset({
      id: "clip",
      name: "Clip",
      assetRef: { guid: "bad" },
      sourceModelRef: { guid: MODEL_GUID },
    })).toThrowError(CharacterCodecError);
    expect(() => decodeAvatarMaskAsset({ version: "braze/avatar-mask-v2" }))
      .toThrowError(CharacterCodecError);
  });

  it("strips rig references that do not belong to the authored source rig kind", () => {
    const shared = {
      id: "clip:plain",
      name: "Plain",
      assetRef: { guid: MODEL_GUID, localId: "clip:Plain" },
      sourceModelRef: { guid: MODEL_GUID, localId: "main" },
    };
    expect(decodeAnimationClipAsset({
      ...shared,
      sourceRig: {
        kind: "none",
        skeletonRef: { guid: AVATAR_GUID, localId: "skeleton:ignored" },
        avatarRef: { guid: AVATAR_GUID, localId: "avatar:ignored" },
        compatibilitySignature: "ignored",
      },
    }).sourceRig).toEqual({ kind: "none" });
    expect(decodeAnimationClipAsset({
      ...shared,
      sourceRig: {
        kind: "generic",
        skeletonRef: { guid: AVATAR_GUID, localId: "skeleton:kept" },
        avatarRef: { guid: AVATAR_GUID, localId: "avatar:ignored" },
      },
    }).sourceRig).toEqual({
      kind: "generic",
      skeletonRef: { guid: AVATAR_GUID, localId: "skeleton:kept" },
    });
  });

  it("accepts the exact clip-event and payload boundaries", () => {
    const limits = CHARACTER_DOCUMENT_LIMITS;
    const payload = Object.fromEntries(Array.from(
      { length: limits.animationEventPayloadEntries },
      (_, index) => [`value-${index}`, index],
    ));
    const decoded = decodeAnimationClipAsset(clipDocument(Array.from(
      { length: limits.animationEventsPerClip },
      (_, index) => animationEvent(index, index === 0 ? payload : {}),
    )));

    expect(decoded.events).toHaveLength(limits.animationEventsPerClip);
    expect(Object.keys(decoded.events[0]!.payload)).toHaveLength(limits.animationEventPayloadEntries);
    expect(() => encodeAnimationClipAsset(decoded)).not.toThrow();
  });

  it("rejects rather than truncating over-budget clip events on decode and encode", () => {
    const maximum = CHARACTER_DOCUMENT_LIMITS.animationEventsPerClip;
    const events = Array.from({ length: maximum + 1 }, (_, index) => animationEvent(index));
    expect(() => decodeAnimationClipAsset(clipDocument(events)))
      .toThrowError(/events: cannot exceed 256 entries/);

    const bounded = decodeAnimationClipAsset(clipDocument(events.slice(0, maximum)));
    bounded.events.push({ id: "overflow", name: "Overflow", timeSeconds: 0, payload: {} });
    expect(() => encodeAnimationClipAsset(bounded))
      .toThrowError(/events: cannot exceed 256 entries/);
  });

  it("rejects rather than truncating over-budget event payloads on decode and encode", () => {
    const maximum = CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries;
    const payload = Object.fromEntries(Array.from(
      { length: maximum + 1 },
      (_, index) => [`value-${index}`, index],
    ));
    expect(() => decodeAnimationClipAsset(clipDocument([animationEvent(0, payload)])))
      .toThrowError(/events\[0\]\.payload: cannot exceed 32 entries/);

    const bounded = decodeAnimationClipAsset(clipDocument([animationEvent(0)]));
    bounded.events[0]!.payload = payload;
    expect(() => encodeAnimationClipAsset(bounded))
      .toThrowError(/events\[0\]\.payload: cannot exceed 32 entries/);
  });
});

function clipDocument(events: unknown[]) {
  return {
    id: "clip:budget",
    name: "Budget",
    assetRef: { guid: MODEL_GUID, localId: "clip:Budget" },
    sourceModelRef: { guid: MODEL_GUID, localId: "main" },
    durationSeconds: 2,
    events,
  };
}

function animationEvent(index: number, payload: Record<string, unknown> = {}) {
  return { id: `event-${index}`, name: `Event ${index}`, timeSeconds: 1, payload };
}
