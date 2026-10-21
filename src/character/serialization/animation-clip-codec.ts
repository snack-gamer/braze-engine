import type {
  AnimationClipAsset,
  AnimationClipBinding,
  AnimationEvent,
  AnimationEventPayload,
} from "../domain/animation-clip";
import { CHARACTER_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { boneId } from "../domain/skeleton";
import type { RigKind } from "../domain/rig";
import {
  acceptDocumentVersion,
  arrayWithinLimit,
  assertArrayWithinLimit,
  CharacterCodecError,
  clampedNumber,
  documentRecord,
  finiteNumber,
  optionalString,
  parseAssetRef,
  parseVector3,
  preservedDocumentFields,
  record,
  requiredString,
  serializeAssetRef,
  uniqueIds,
} from "./character-codec-values";

export const ANIMATION_CLIP_ASSET_FORMAT = "braze/animation-clip-v1";

const ANIMATION_CLIP_FIELDS = [
  "version", "id", "name", "assetRef", "asset_ref",
  "sourceModelRef", "source_model_ref", "sourceRig", "source_rig",
  "durationSeconds", "duration_seconds", "sampleRateHz", "sample_rate_hz",
  "looping", "loop_time", "bindings", "events", "rootMotion", "root_motion",
] as const;

function rigKind(value: unknown): RigKind {
  return value === "generic" || value === "humanoid" ? value : "none";
}

function decodeBindings(value: unknown): AnimationClipBinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AnimationClipBinding[] => {
    const input = record(item);
    if (!input) return [];
    if (input.kind === "bone") {
      const id = optionalString(input.boneId ?? input.bone_id);
      if (!id) return [];
      const allowed = new Set(["translation", "rotation", "scale"]);
      const channels = Array.isArray(input.channels)
        ? [...new Set(input.channels.filter((channel): channel is "translation" | "rotation" | "scale" => (
            typeof channel === "string" && allowed.has(channel)
          )))]
        : [];
      return [{ kind: "bone", boneId: boneId(id), channels }];
    }
    if (input.kind === "blendShape") {
      const nodePath = optionalString(input.nodePath ?? input.node_path);
      const blendShapeName = optionalString(input.blendShapeName ?? input.blend_shape_name);
      return nodePath && blendShapeName ? [{ kind: "blendShape", nodePath, blendShapeName }] : [];
    }
    if (input.kind === "property") {
      const nodePath = optionalString(input.nodePath ?? input.node_path);
      const property = optionalString(input.property);
      return nodePath && property ? [{ kind: "property", nodePath, property }] : [];
    }
    return [];
  });
}

function eventPayload(value: unknown, path: string): AnimationEventPayload {
  const input = record(value) ?? {};
  assertPayloadEntriesWithinLimit(input, path);
  const payload: AnimationEventPayload = {};
  for (const [key, item] of Object.entries(input)) {
    if (item === null || typeof item === "string" || typeof item === "boolean"
      || (typeof item === "number" && Number.isFinite(item))) payload[key] = item;
  }
  return payload;
}

function decodeEvents(value: unknown, durationSeconds: number): AnimationEvent[] {
  const persisted = arrayWithinLimit(
    value,
    "events",
    CHARACTER_DOCUMENT_LIMITS.animationEventsPerClip,
  );
  const events = persisted.flatMap((item, index): AnimationEvent[] => {
    const input = record(item);
    const name = optionalString(input?.name);
    if (!input || !name) return [];
    return [{
      id: optionalString(input.id) ?? `event-${index + 1}`,
      name,
      timeSeconds: clampedNumber(input.timeSeconds ?? input.time_seconds, 0, 0, durationSeconds),
      payload: eventPayload(input.payload, `events[${index}].payload`),
    }];
  });
  uniqueIds(events, "events");
  return events.sort((left, right) => left.timeSeconds - right.timeSeconds);
}

export function decodeAnimationClipAsset(value: unknown): AnimationClipAsset {
  const input = documentRecord(value, "animationClip");
  acceptDocumentVersion(input, ANIMATION_CLIP_ASSET_FORMAT, ["braze/animation-clip-v0"]);
  const durationSeconds = Math.max(0, finiteNumber(input.durationSeconds ?? input.duration_seconds, 0));
  const sourceRig = record(input.sourceRig ?? input.source_rig) ?? {};
  const sourceRigKind = rigKind(sourceRig.kind);
  const rootMotion = record(input.rootMotion ?? input.root_motion) ?? {};
  const skeletonRef = parseAssetRef(sourceRig.skeletonRef ?? sourceRig.skeleton_ref, "sourceRig.skeletonRef");
  const avatarRef = parseAssetRef(sourceRig.avatarRef ?? sourceRig.avatar_ref, "sourceRig.avatarRef");
  const sourceBone = optionalString(rootMotion.sourceBoneId ?? rootMotion.source_bone_id);
  const extensions = preservedDocumentFields(input, ANIMATION_CLIP_FIELDS);
  return {
    version: 1,
    id: requiredString(input.id, "id"),
    name: requiredString(input.name, "name"),
    assetRef: parseAssetRef(input.assetRef ?? input.asset_ref, "assetRef", true)!,
    sourceModelRef: parseAssetRef(input.sourceModelRef ?? input.source_model_ref, "sourceModelRef", true)!,
    sourceRig: {
      kind: sourceRigKind,
      ...(sourceRigKind !== "none" && skeletonRef ? { skeletonRef } : {}),
      ...(sourceRigKind === "humanoid" && avatarRef ? { avatarRef } : {}),
      ...(sourceRigKind !== "none"
        && optionalString(sourceRig.compatibilitySignature ?? sourceRig.compatibility_signature)
        ? { compatibilitySignature: optionalString(sourceRig.compatibilitySignature ?? sourceRig.compatibility_signature)! }
        : {}),
    },
    durationSeconds,
    sampleRateHz: Math.max(1, finiteNumber(input.sampleRateHz ?? input.sample_rate_hz, 30)),
    looping: input.looping !== false && input.loop_time !== false,
    bindings: decodeBindings(input.bindings),
    events: decodeEvents(input.events, durationSeconds),
    rootMotion: {
      ...(sourceBone ? { sourceBoneId: boneId(sourceBone) } : {}),
      hasTranslation: rootMotion.hasTranslation === true || rootMotion.has_translation === true,
      hasRotation: rootMotion.hasRotation === true || rootMotion.has_rotation === true,
      averageVelocity: parseVector3(rootMotion.averageVelocity ?? rootMotion.average_velocity),
      averageAngularSpeedDegrees: finiteNumber(
        rootMotion.averageAngularSpeedDegrees ?? rootMotion.average_angular_speed_degrees,
        0,
      ),
    },
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
}

export function encodeAnimationClipAsset(value: AnimationClipAsset) {
  assertArrayWithinLimit(
    value.events,
    "events",
    CHARACTER_DOCUMENT_LIMITS.animationEventsPerClip,
  );
  value.events.forEach((event, index) => {
    assertPayloadEntriesWithinLimit(event.payload, `events[${index}].payload`);
  });
  return {
    ...(value.extensions ?? {}),
    version: ANIMATION_CLIP_ASSET_FORMAT,
    id: value.id,
    name: value.name,
    assetRef: serializeAssetRef(value.assetRef),
    sourceModelRef: serializeAssetRef(value.sourceModelRef),
    sourceRig: {
      kind: value.sourceRig.kind,
      ...(value.sourceRig.skeletonRef ? { skeletonRef: serializeAssetRef(value.sourceRig.skeletonRef) } : {}),
      ...(value.sourceRig.avatarRef ? { avatarRef: serializeAssetRef(value.sourceRig.avatarRef) } : {}),
      ...(value.sourceRig.compatibilitySignature ? { compatibilitySignature: value.sourceRig.compatibilitySignature } : {}),
    },
    durationSeconds: value.durationSeconds,
    sampleRateHz: value.sampleRateHz,
    looping: value.looping,
    bindings: value.bindings.map((binding) => ({ ...binding })),
    events: value.events.map((event) => ({ ...event, payload: { ...event.payload } })),
    rootMotion: {
      ...value.rootMotion,
      averageVelocity: [...value.rootMotion.averageVelocity],
    },
  };
}

function assertPayloadEntriesWithinLimit(
  payload: Record<string, unknown>,
  path: string,
): void {
  let entries = 0;
  for (const key in payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    entries += 1;
    if (entries > CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries) {
      throw new CharacterCodecError(
        "invalid-document",
        path,
        `cannot exceed ${CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries} entries`,
      );
    }
  }
}
