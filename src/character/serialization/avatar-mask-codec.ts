import {
  HUMANOID_BODY_PARTS,
  type AvatarMaskAsset,
  type AvatarMaskTransform,
  type HumanoidBodyPart,
} from "../domain/avatar-mask";
import { boneId } from "../domain/skeleton";
import {
  acceptDocumentVersion,
  documentRecord,
  optionalString,
  parseAssetRef,
  preservedDocumentFields,
  record,
  requiredString,
  serializeAssetRef,
} from "./character-codec-values";

export const AVATAR_MASK_ASSET_FORMAT = "braze/avatar-mask-v1";

const AVATAR_MASK_FIELDS = [
  "version", "id", "name", "revision", "sourceRef", "source_ref",
  "humanoidBodyParts", "humanoid_body_parts", "transforms",
] as const;

function decodeTransforms(value: unknown): AvatarMaskTransform[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AvatarMaskTransform[] => {
    const input = record(item);
    const path = optionalString(input?.path);
    if (!input || !path) return [];
    const id = optionalString(input.boneId ?? input.bone_id);
    return [{ path, active: input.active !== false, ...(id ? { boneId: boneId(id) } : {}) }];
  });
}

export function decodeAvatarMaskAsset(value: unknown): AvatarMaskAsset {
  const input = documentRecord(value, "avatarMask");
  acceptDocumentVersion(input, AVATAR_MASK_ASSET_FORMAT, ["braze/avatar-mask-v0"]);
  const rawParts = record(input.humanoidBodyParts ?? input.humanoid_body_parts) ?? {};
  const humanoidBodyParts: Partial<Record<HumanoidBodyPart, boolean>> = {};
  for (const part of HUMANOID_BODY_PARTS) {
    if (typeof rawParts[part] === "boolean") humanoidBodyParts[part] = rawParts[part];
  }
  const sourceRef = parseAssetRef(input.sourceRef ?? input.source_ref, "sourceRef");
  const extensions = preservedDocumentFields(input, AVATAR_MASK_FIELDS);
  return {
    version: 1,
    id: requiredString(input.id, "id"),
    name: requiredString(input.name, "name"),
    ...(optionalString(input.revision) ? { revision: optionalString(input.revision)! } : {}),
    ...(sourceRef ? { sourceRef } : {}),
    humanoidBodyParts,
    transforms: decodeTransforms(input.transforms),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
}

export function encodeAvatarMaskAsset(value: AvatarMaskAsset) {
  return {
    ...(value.extensions ?? {}),
    version: AVATAR_MASK_ASSET_FORMAT,
    id: value.id,
    name: value.name,
    ...(value.revision ? { revision: value.revision } : {}),
    ...(value.sourceRef ? { sourceRef: serializeAssetRef(value.sourceRef) } : {}),
    humanoidBodyParts: { ...value.humanoidBodyParts },
    transforms: value.transforms.map((transform) => ({ ...transform })),
  };
}
