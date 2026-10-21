import type { AssetRef } from "../../assets/domain/asset-reference";
import type { AssetSubAsset, LibraryAsset } from "../../lib/asset-api";
import {
  normalizeModelAnimationEvents,
  type ModelAnimationEventSettings,
} from "../../lib/model-import-settings";
import { HUMANOID_BONE_NAMES, type HumanBoneMapping, type HumanoidPoseTuning } from "../domain/humanoid-avatar";
import { normalizeHumanoidPoseTuning } from "../domain/rig";
import { boneId } from "../domain/skeleton";
import { validateHumanoidMapping } from "./humanoid-mapping";

const ASSET_GUID = /^[a-f0-9]{32}$/i;

export type ImportedCharacterAssetOption = {
  ref: AssetRef;
  label: string;
  sourceName: string;
  sourceFilename: string;
  sourceIndex?: number;
  sourceLooping?: boolean;
  durationSeconds?: number;
  events?: readonly ModelAnimationEventSettings[];
};

function subAssetOptions(
  models: readonly LibraryAsset[],
  kind: "avatar" | "clip",
): ImportedCharacterAssetOption[] {
  const seen = new Set<string>();
  return models.flatMap((model) => {
    const guid = model.guid?.toLowerCase();
    if (!guid || !ASSET_GUID.test(guid)) return [];
    return (model.subAssets ?? []).flatMap((subAsset: AssetSubAsset) => {
      if (subAsset.kind !== kind || !subAsset.localId.trim()) return [];
      const key = `${guid}\u0000${subAsset.localId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        ref: { guid, localId: subAsset.localId },
        label: `${subAsset.name || kind} — ${model.name}`,
        sourceName: model.name,
        sourceFilename: model.filename,
        ...(Number.isInteger(subAsset.sourceIndex) ? { sourceIndex: subAsset.sourceIndex } : {}),
        ...(kind === "clip" ? { sourceLooping: subAsset.looping !== false } : {}),
        ...(kind === "clip"
          && typeof subAsset.durationSeconds === "number"
          && Number.isFinite(subAsset.durationSeconds)
          && subAsset.durationSeconds > 0
          ? { durationSeconds: subAsset.durationSeconds }
          : {}),
        ...(kind === "clip" && Array.isArray(subAsset.events)
          ? { events: normalizeModelAnimationEvents(subAsset.events) }
          : {}),
      }];
    });
  }).sort((left, right) => left.label.localeCompare(right.label));
}

export function importedAvatarOptions(models: readonly LibraryAsset[]): ImportedCharacterAssetOption[] {
  return subAssetOptions(models, "avatar");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Reads only known Humanoid slots from an importer-authored Avatar subasset. */
export function importedHumanoidMapping(subAsset: AssetSubAsset): HumanBoneMapping {
  if (subAsset.kind !== "avatar") return {};
  const mappingSource = record(subAsset.humanBoneMapping) ?? {};
  const mapping: HumanBoneMapping = {};
  for (const name of HUMANOID_BONE_NAMES) {
    const value = mappingSource[name];
    if (typeof value === "string" && value.trim()) mapping[name] = boneId(value.trim());
  }
  return mapping;
}

/** Reads bounded retargeting tuning from an importer-authored Avatar subasset. */
export function importedHumanoidTuning(subAsset: AssetSubAsset): HumanoidPoseTuning {
  return normalizeHumanoidPoseTuning(subAsset.kind === "avatar" ? subAsset.humanoidTuning : undefined);
}

function isConfiguredHumanoidAvatar(subAsset: AssetSubAsset): boolean {
  if (subAsset.kind !== "avatar"
    || subAsset.configuredRigKind !== "humanoid") return false;
  const mapping = importedHumanoidMapping(subAsset);
  const importedBones = (Array.isArray(subAsset.bones) ? subAsset.bones : []).flatMap((value) => {
    const input = record(value);
    const localId = typeof input?.localId === "string" ? input.localId.trim() : "";
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    const path = typeof input?.path === "string" ? input.path.trim() : "";
    if (!localId || !name || !path) return [];
    return [{
      localId,
      name,
      path: threeRuntimeBonePath(path),
      parentLocalId: typeof input?.parentLocalId === "string" && input.parentLocalId.trim()
        ? input.parentLocalId.trim()
        : null,
    }];
  });
  // The source analyzer owns semantic local IDs while GLTFLoader exposes
  // sanitized hierarchy paths. Rig settings are authored against the latter,
  // so validation must compare the same stable runtime identity.
  const idByLocalId = new Map(importedBones.map((bone) => [
    bone.localId,
    boneId(`bone:${bone.path}`),
  ]));
  const bones = importedBones.map((bone) => ({
    id: idByLocalId.get(bone.localId)!,
    name: bone.name,
    path: bone.path,
    parentId: bone.parentLocalId ? idByLocalId.get(bone.parentLocalId) ?? null : null,
  }));
  return validateHumanoidMapping(bones, mapping).status !== "invalid";
}

function isReusableHumanoidAvatar(subAsset: AssetSubAsset): boolean {
  return subAsset.configuredAvatarSource === "createFromModel"
    && isConfiguredHumanoidAvatar(subAsset);
}

export function isPlayableImportedAvatar(subAsset: AssetSubAsset): boolean {
  if (subAsset.kind !== "avatar") return false;
  if (subAsset.configuredRigKind === "humanoid") return isConfiguredHumanoidAvatar(subAsset);
  return subAsset.configuredRigKind === "generic"
    && Array.isArray(subAsset.bones)
    && subAsset.bones.length > 0;
}

function threeRuntimeBonePath(value: string): string {
  return value.split("/").map((segment) => (
    segment.replace(/\s/g, "_").replace(/[\[\].:/]/g, "") || "Bone"
  )).join("/");
}

/** Copy sources must be complete authored Humanoid Avatars, not merely detected skeletons. */
export function reusableHumanoidAvatarOptions(
  models: readonly LibraryAsset[],
  excludedFilename?: string,
): ImportedCharacterAssetOption[] {
  return subAssetOptions(
    models.map((model) => ({
      ...model,
      subAssets: model.filename === excludedFilename
        ? []
        : (model.subAssets ?? []).filter(isReusableHumanoidAvatar),
    })),
    "avatar",
  );
}

/** Configured Generic and valid Humanoid Avatars assignable to gameplay Animators. */
export function playableImportedAvatarOptions(
  models: readonly LibraryAsset[],
  modelGuid?: string,
): ImportedCharacterAssetOption[] {
  const normalizedGuid = modelGuid?.toLowerCase();
  return subAssetOptions(
    models.flatMap((model) => {
      if (normalizedGuid && model.guid?.toLowerCase() !== normalizedGuid) return [];
      return [{
        ...model,
        subAssets: (model.subAssets ?? []).filter(isPlayableImportedAvatar),
      }];
    }),
    "avatar",
  );
}

export function importedAnimationClipOptions(models: readonly LibraryAsset[]): ImportedCharacterAssetOption[] {
  return subAssetOptions(models.map((model) => ({
    ...model,
    subAssets: (model.subAssets ?? []).filter((subAsset) => (
      subAsset.kind !== "clip" || subAsset.importEnabled !== false
    )),
  })), "clip");
}

export function resolveImportedCharacterSubAsset(
  models: readonly LibraryAsset[],
  reference: AssetRef,
): Readonly<{ asset: LibraryAsset; subAsset: AssetSubAsset }> | undefined {
  const guid = reference.guid.toLowerCase();
  const localId = reference.localId ?? "main";
  const asset = models.find((candidate) => candidate.guid?.toLowerCase() === guid);
  const subAsset = asset?.subAssets?.find((candidate) => candidate.localId === localId);
  return asset && subAsset ? { asset, subAsset } : undefined;
}

/** Resolves the Avatar's exact importer-published Skeleton identity, with a legacy fallback. */
export function importedAvatarSkeletonReference(
  asset: LibraryAsset,
  avatarReference: AssetRef,
): AssetRef | undefined {
  const resolved = resolveImportedCharacterSubAsset([asset], avatarReference);
  if (resolved?.subAsset.kind !== "avatar") return undefined;
  const rawLocalId = resolved.subAsset.skeletonLocalId;
  if (rawLocalId === undefined) return {
    guid: avatarReference.guid.toLowerCase(),
    localId: `${avatarReference.localId ?? "main"}:skeleton`,
  };
  if (typeof rawLocalId !== "string" || !rawLocalId.trim()) return undefined;
  const localId = rawLocalId.trim();
  const skeleton = asset.subAssets?.find((candidate) => (
    candidate.localId === localId && candidate.kind === "skeleton"
  ));
  return skeleton ? { guid: avatarReference.guid.toLowerCase(), localId } : undefined;
}

export function characterAssetOptionKey(reference: AssetRef | undefined): string {
  return reference ? JSON.stringify([reference.guid.toLowerCase(), reference.localId ?? "main"]) : "";
}

export function characterAssetOptionReference(
  value: string,
  options: readonly ImportedCharacterAssetOption[],
): AssetRef | undefined {
  return options.find((option) => characterAssetOptionKey(option.ref) === value)?.ref;
}
