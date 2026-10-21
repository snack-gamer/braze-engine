import type * as THREE from "three";
import type { AssetRef } from "../../../assets/domain/asset-reference";
import type { LibraryAsset } from "../../../lib/asset-api";
import type { ModelImportSettings } from "../../../lib/model-import-settings";
import { animationClipForRootMotionExtraction } from "../../../three/animation-clip-loop-pose";
import { importedAvatarSkeletonReference } from "../../application/imported-character-assets";
import { buildHumanoidAvatarDefinition } from "../../application/humanoid-avatar-builder";
import type { AnimationEvent, AnimationEventPayload } from "../../domain/animation-clip";
import { CHARACTER_DOCUMENT_LIMITS } from "../../domain/character-document-limits";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPlaybackClip,
} from "../../application/playback/animator-playback-contracts";
import { assetRefKey } from "../../runtime/animator-controller-compiler";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import { extractThreeSkeletonDefinition } from "./three-skeleton-extractor";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";

export type ThreeImportedClipPlaybackMode = "conditionedPose" | "rootMotionExtraction";

export function resolveThreeImportedClip(
  reference: AssetRef,
  asset: LibraryAsset,
  animations: readonly THREE.AnimationClip[],
  targetRoot: THREE.Object3D,
  targetAvatar?: AnimatorPlaybackAvatar,
  playbackMode: ThreeImportedClipPlaybackMode = "conditionedPose",
): CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>> {
  const expected = assetRefKey(reference)!;
  if (!asset.guid || asset.guid.toLowerCase() !== reference.guid.toLowerCase()) {
    return characterRuntimeFailure(
      "clip-model-guid-mismatch",
      `Clip ${expected} does not belong to ${asset.filename}.`,
    );
  }
  const subAsset = asset.subAssets?.find((entry) => entry.localId === reference.localId);
  if (!subAsset || subAsset.kind !== "clip") return characterRuntimeFailure(
    "unresolved-imported-clip-subasset",
    `Clip subasset ${expected} is absent from the imported asset catalog.`,
  );
  if (subAsset.importEnabled === false) return characterRuntimeFailure(
    "animation-clip-import-disabled",
    `Clip ${expected} is disabled by the model's Import Animations setting.`,
  );
  if (!Number.isInteger(subAsset.sourceIndex) || subAsset.sourceIndex! < 0) {
    return characterRuntimeFailure(
      "missing-imported-clip-source-index",
      `Clip ${expected} has no stable source index. Reimport the model.`,
    );
  }
  const runtimeClipIndex = Number.isInteger(subAsset.runtimeClipIndex)
    && Number(subAsset.runtimeClipIndex) >= 0
    ? Number(subAsset.runtimeClipIndex)
    : subAsset.sourceIndex!;
  const importedClip = animations[runtimeClipIndex];
  const clip = importedClip && playbackMode === "rootMotionExtraction"
    ? animationClipForRootMotionExtraction(importedClip)
    : importedClip;
  if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) {
    return characterRuntimeFailure(
      "invalid-imported-clip-resource",
      `Clip ${expected} does not resolve to a positive-duration runtime clip.`,
    );
  }
  const events = importedEvents(subAsset.events, expected);
  if (!events.value) return { value: null, diagnostics: events.diagnostics };
  return characterRuntimeSuccess({
    id: expected,
    resource: { bindings: [{ root: targetRoot, clip }] },
    metadata: {
      durationSeconds: clip.duration,
      looping: subAsset.looping !== false,
      events: events.value,
      ...(targetAvatar ? { rootMotion: playbackRootMotionMetadata(targetAvatar) } : {}),
    },
  });
}

export function playbackRootMotionMetadata(avatar: AnimatorPlaybackAvatar) {
  const sourceBoneId = avatar.motionRootBoneId
    ?? (avatar.kind === "humanoid" ? avatar.definition.mapping.hips : avatar.rootBoneId)
    ?? avatar.skeleton.rootBoneIds[0];
  return {
    ...(sourceBoneId ? { sourceBoneId } : {}),
    hasTranslation: Boolean(sourceBoneId),
    hasRotation: Boolean(sourceBoneId),
    averageVelocity: [0, 0, 0] as [number, number, number],
    averageAngularSpeedDegrees: 0,
  };
}

export function buildThreePlaybackAvatar(
  reference: AssetRef,
  asset: LibraryAsset,
  body: THREE.Object3D,
  settings: ModelImportSettings,
  importedAssets: readonly LibraryAsset[],
): CharacterRuntimeResult<AnimatorPlaybackAvatar> {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const expected = assetRefKey(reference)!;
  if (!asset.guid || asset.guid.toLowerCase() !== reference.guid.toLowerCase()) diagnostics.push({
    code: "avatar-model-guid-mismatch",
    severity: "error",
    message: `Avatar ${expected} does not belong to ${asset.filename}.`,
  });
  const subAsset = asset.subAssets?.find((entry) => entry.localId === reference.localId);
  if (!subAsset || subAsset.kind !== "avatar") diagnostics.push({
    code: "unresolved-imported-avatar-subasset",
    severity: "error",
    message: `Avatar subasset ${expected} is absent from the imported asset catalog.`,
  });
  const skeletonRef = importedAvatarSkeletonReference(asset, reference);
  if (subAsset?.kind === "avatar"
    && Object.prototype.hasOwnProperty.call(subAsset, "skeletonLocalId")
    && !skeletonRef) diagnostics.push({
    code: "avatar-skeleton-subasset-missing",
    severity: "error",
    message: `Avatar ${expected} references a missing imported Skeleton subasset. Reimport the model.`,
  });
  const extraction = extractThreeSkeletonDefinition(body, {
    id: `${reference.guid}:${reference.localId ?? "main"}`,
    name: subAsset?.name ?? asset.name,
    sourceRef: reference,
  });
  diagnostics.push(...extraction.diagnostics.map(({ code, severity, message }) => ({
    code,
    severity,
    message,
  })));
  if (!extraction.definition) diagnostics.push({
    code: "missing-avatar-skeleton",
    severity: "error",
    message: `Avatar ${expected} contains no live skinned skeleton.`,
  });
  if (settings.rig.kind === "none") diagnostics.push({
    code: "avatar-rig-disabled",
    severity: "error",
    message: `Avatar ${expected} belongs to a model imported with Rig Type None.`,
  });
  if (settings.rig.kind === "humanoid" && settings.rig.avatarSource.kind === "copyFromAvatar") {
    const copied = settings.rig.avatarSource.avatarRef;
    const copiedAsset = importedAssets.find((candidate) => candidate.guid?.toLowerCase() === copied.guid.toLowerCase());
    const copiedSubAsset = copiedAsset?.subAssets?.find((entry) => entry.localId === copied.localId);
    if (!copiedAsset || copiedSubAsset?.kind !== "avatar") diagnostics.push({
      code: "missing-configured-avatar-source",
      severity: "error",
      message: `Copied Avatar dependency ${assetRefKey(copied)} can no longer be resolved.`,
    });
  }
  if (!extraction.definition || settings.rig.kind === "none" || hasCharacterRuntimeErrors(diagnostics)) {
    return { value: null, diagnostics };
  }
  const shared = {
    id: expected,
    skeleton: extraction.definition,
    ...(settings.rig.rootBoneId ? { rootBoneId: settings.rig.rootBoneId } : {}),
    ...(settings.rig.motionRootBoneId ? { motionRootBoneId: settings.rig.motionRootBoneId } : {}),
  };
  if (settings.rig.kind === "generic") {
    return characterRuntimeSuccess({ ...shared, kind: "generic" }, diagnostics);
  }
  const definition = buildHumanoidAvatarDefinition({
    name: subAsset?.name ?? `${asset.name} Avatar`,
    sourceRef: reference,
    skeletonRef: skeletonRef ?? {
      guid: reference.guid,
      localId: `${reference.localId ?? "main"}:skeleton`,
    },
    skeleton: extraction.definition,
    mapping: settings.rig.humanBoneMapping,
    tuning: settings.rig.humanoidTuning,
  });
  diagnostics.push(...definition.validation.issues.map(({ code, severity, message }) => ({
    code,
    severity,
    message,
  })));
  return hasCharacterRuntimeErrors(diagnostics)
    ? { value: null, diagnostics }
    : characterRuntimeSuccess({ ...shared, kind: "humanoid", definition }, diagnostics);
}

export function uniqueImportedAvatarReference(asset: LibraryAsset): AssetRef | null {
  if (!asset.guid) return null;
  const avatars = asset.subAssets?.filter((entry) => entry.kind === "avatar") ?? [];
  return avatars.length === 1 ? { guid: asset.guid, localId: avatars[0]!.localId } : null;
}

function importedEvents(
  value: unknown,
  clipId: string,
): CharacterRuntimeResult<AnimationEvent[]> {
  if (!Array.isArray(value)) return characterRuntimeSuccess([]);
  if (value.length > CHARACTER_DOCUMENT_LIMITS.animationEventsPerClip) {
    return characterRuntimeFailure(
      "imported-clip-event-limit-exceeded",
      `Imported clip ${clipId} exceeds the ${CHARACTER_DOCUMENT_LIMITS.animationEventsPerClip}-event limit. Reimport the model.`,
    );
  }
  const events: AnimationEvent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const event = entry as Record<string, unknown>;
    const name = typeof event.name === "string" ? event.name.trim() : "";
    const rawTime = event.timeSeconds;
    const timeSeconds = typeof rawTime === "number" || typeof rawTime === "string"
      ? Number(rawTime)
      : Number.NaN;
    if (!name || !Number.isFinite(timeSeconds) || timeSeconds < 0) continue;
    const payload = importedEventPayload(event.payload, clipId, index);
    if (!payload.value) return { value: null, diagnostics: payload.diagnostics };
    events.push({
      id: typeof event.id === "string" && event.id.trim() ? event.id.trim() : `event-${index + 1}`,
      name,
      timeSeconds,
      payload: payload.value,
    });
  }
  return characterRuntimeSuccess(events);
}

function importedEventPayload(
  value: unknown,
  clipId: string,
  eventIndex: number,
): CharacterRuntimeResult<AnimationEventPayload> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return characterRuntimeSuccess({});
  }
  const input = value as Record<string, unknown>;
  const payload: AnimationEventPayload = {};
  let entries = 0;
  for (const key in input) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    entries += 1;
    if (entries > CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries) {
      return characterRuntimeFailure(
        "imported-clip-event-payload-limit-exceeded",
        `Imported clip ${clipId} event ${eventIndex + 1} exceeds the ${CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries}-entry payload limit. Reimport the model.`,
      );
    }
    const item = input[key];
    if (item === null || typeof item === "string" || typeof item === "boolean"
      || (typeof item === "number" && Number.isFinite(item))) payload[key] = item;
  }
  return characterRuntimeSuccess(payload);
}
