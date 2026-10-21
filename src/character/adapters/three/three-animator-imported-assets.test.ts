import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../../lib/asset-api";
import type { ModelImportSettings } from "../../../lib/model-import-settings";
import {
  animationClipForRootMotionExtraction,
  applyAnimationClipLoopPose,
} from "../../../three/animation-clip-loop-pose";
import type { AnimatorPlaybackAvatar } from "../../application/playback/animator-playback-contracts";
import { CHARACTER_DOCUMENT_LIMITS } from "../../domain/character-document-limits";
import { boneId } from "../../domain/skeleton";
import { retargetCacheKey } from "../../runtime/retarget-cache-key";
import {
  buildThreePlaybackAvatar,
  resolveThreeImportedClip,
} from "./three-animator-imported-assets";
import { retargetSourceClipRevision } from "./three-animator-retarget-resolution";

const GUID = "a".repeat(32);
const OTHER_GUID = "b".repeat(32);

function asset(): LibraryAsset {
  return {
    guid: GUID,
    name: "Hero",
    filename: "hero.glb",
    path: "assets/hero.glb",
    url: "/3d-models/hero.glb",
    sizeBytes: 1,
    contentRevision: "model-r1",
    subAssets: [
      { localId: "clip:first", kind: "clip", name: "Take", sourceIndex: 0 },
      { localId: "clip:second", kind: "clip", name: "Take", sourceIndex: 1 },
      { localId: "skeleton:hero", kind: "skeleton", name: "Hero Skeleton" },
      {
        localId: "avatar:hero",
        kind: "avatar",
        name: "Hero Avatar",
        skeletonLocalId: "skeleton:hero",
      },
    ],
  };
}

function genericAvatar(): AnimatorPlaybackAvatar {
  const root = boneId("bone:Root");
  return {
    id: `${GUID}:avatar:hero`,
    kind: "generic",
    rootBoneId: root,
    motionRootBoneId: root,
    skeleton: {
      version: 1,
      id: "hero:skeleton",
      name: "Hero",
      rootBoneIds: [root],
      compatibilitySignature: "skeleton-r1",
      bones: [],
    },
  };
}

describe("Three imported Animator assets", () => {
  it("uses sourceIndex rather than duplicate display names and adds target root metadata", () => {
    const root = new THREE.Group();
    const clips = [
      new THREE.AnimationClip("Take", 1, []),
      new THREE.AnimationClip("Take", 2, []),
    ];
    const resolved = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:second" },
      asset(),
      clips,
      root,
      genericAvatar(),
    );

    expect(resolved.value?.resource.bindings[0]?.clip).toBe(clips[1]);
    expect(resolved.value?.metadata.durationSeconds).toBe(2);
    expect(resolved.value?.metadata.rootMotion?.sourceBoneId).toBe("bone:Root");
  });

  it("selects retained authored curves only for root-motion extraction", () => {
    const root = new THREE.Group();
    const conditioned = new THREE.AnimationClip("Take", 1, [
      new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 0, 0, 10, 0, 0]),
    ]);
    applyAnimationClipLoopPose(conditioned);
    const rootMotionSource = animationClipForRootMotionExtraction(conditioned);
    const animations = [conditioned, new THREE.AnimationClip("Take", 2, [])];

    const pose = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:first" },
      asset(),
      animations,
      root,
    );
    const rootMotion = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:first" },
      asset(),
      animations,
      root,
      undefined,
      "rootMotionExtraction",
    );

    expect(pose.value?.resource.bindings[0]?.clip).toBe(conditioned);
    expect(rootMotionSource).not.toBe(conditioned);
    expect(rootMotion.value?.resource.bindings[0]?.clip).toBe(rootMotionSource);
  });

  it("keeps two clips from one model revision in distinct retarget cache identities", () => {
    const identity = (clipId: string) => retargetCacheKey({
      sourceClipRevision: retargetSourceClipRevision(clipId, "model-r1"),
      sourceSkeletonRevision: "source-skeleton",
      sourceAvatarRevision: "source-avatar",
      targetSkeletonRevision: "target-skeleton",
      targetAvatarRevision: "target-avatar",
      settingsRevision: "settings-r1",
    });
    expect(identity(`${GUID}:clip:first`)).not.toBe(identity(`${GUID}:clip:second`));
  });

  it("rejects an exact clip reference when animation import is disabled", () => {
    const disabled = asset();
    disabled.subAssets = disabled.subAssets?.map((entry) => (
      entry.localId === "clip:first" ? { ...entry, importEnabled: false } : entry
    ));
    const result = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:first" },
      disabled,
      [new THREE.AnimationClip("Take", 1, [])],
      new THREE.Group(),
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("animation-clip-import-disabled");
  });

  it("accepts the exact imported clip-event and payload boundaries", () => {
    const limits = CHARACTER_DOCUMENT_LIMITS;
    const payload = Object.fromEntries(Array.from(
      { length: limits.animationEventPayloadEntries },
      (_, index) => [`value-${index}`, index],
    ));
    const events = Array.from({ length: limits.animationEventsPerClip }, (_, index) => ({
      id: `event-${index}`,
      name: `Event ${index}`,
      timeSeconds: index / limits.animationEventsPerClip,
      payload: index === 0 ? payload : {},
    }));
    const result = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:first" },
      assetWithClipEvents(events),
      [new THREE.AnimationClip("Take", 1, [])],
      new THREE.Group(),
    );

    expect(result.value?.metadata.events).toHaveLength(limits.animationEventsPerClip);
    expect(Object.keys(result.value!.metadata.events[0]!.payload))
      .toHaveLength(limits.animationEventPayloadEntries);
  });

  it("rejects an over-budget imported event array without reading an event", () => {
    const backing = new Array(CHARACTER_DOCUMENT_LIMITS.animationEventsPerClip + 1);
    const events = new Proxy(backing, {
      get(target, property, receiver) {
        if (property === "length") return Reflect.get(target, property, receiver);
        throw new Error(`unexpected imported event access: ${String(property)}`);
      },
    });
    const result = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:first" },
      assetWithClipEvents(events),
      [new THREE.AnimationClip("Take", 1, [])],
      new THREE.Group(),
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("imported-clip-event-limit-exceeded");
  });

  it("rejects an over-budget imported event payload", () => {
    const payload = Object.fromEntries(Array.from(
      { length: CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries + 1 },
      (_, index) => [`value-${index}`, index],
    ));
    const result = resolveThreeImportedClip(
      { guid: GUID, localId: "clip:first" },
      assetWithClipEvents([{ id: "event", name: "Event", timeSeconds: 0, payload }]),
      [new THREE.AnimationClip("Take", 1, [])],
      new THREE.Group(),
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("imported-clip-event-payload-limit-exceeded");
  });

  it("diagnoses a dangling importer-published Skeleton identity", () => {
    const dangling = asset();
    dangling.subAssets = dangling.subAssets?.filter((entry) => entry.kind !== "skeleton");
    const settings = {
      rig: {
        kind: "generic",
        importBlendShapes: true,
        maxBoneInfluences: 4,
        optimizeBones: false,
      },
    } as ModelImportSettings;
    const result = buildThreePlaybackAvatar(
      { guid: GUID, localId: "avatar:hero" },
      dangling,
      new THREE.Group(),
      settings,
      [dangling],
    );

    expect(result.diagnostics.map((item) => item.code))
      .toContain("avatar-skeleton-subasset-missing");
  });

  it("diagnoses a copied Avatar dependency that no longer exists", () => {
    const settings = {
      rig: {
        kind: "humanoid",
        importBlendShapes: true,
        maxBoneInfluences: 4,
        optimizeBones: false,
        avatarSource: {
          kind: "copyFromAvatar",
          avatarRef: { guid: OTHER_GUID, localId: "avatar:missing" },
        },
        humanBoneMapping: {},
      },
    } as ModelImportSettings;
    const result = buildThreePlaybackAvatar(
      { guid: GUID, localId: "avatar:hero" },
      asset(),
      new THREE.Group(),
      settings,
      [asset()],
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toContain("missing-configured-avatar-source");
  });
});

function assetWithClipEvents(events: unknown): LibraryAsset {
  const next = asset();
  next.subAssets = next.subAssets?.map((entry) => (
    entry.localId === "clip:first" ? { ...entry, events } : entry
  ));
  return next;
}
