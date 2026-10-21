import {
  boneId,
  deriveSkeletonCompatibilitySignature,
  type BoneDefinition,
  type SkeletonDefinition,
} from "../domain/skeleton";
import {
  CharacterCodecError,
  acceptDocumentVersion,
  documentRecord,
  optionalString,
  parseAssetRef,
  parseMatrix4,
  parseTransform,
  preservedDocumentFields,
  requiredString,
  serializeAssetRef,
  serializeTransform,
  uniqueIds,
} from "./character-codec-values";

export const SKELETON_DEFINITION_FORMAT = "braze/skeleton-v1";

const SKELETON_FIELDS = [
  "version", "id", "name", "sourceRef", "source_ref",
  "rootBoneIds", "root_bone_ids", "bones",
  "compatibilitySignature", "compatibility_signature",
] as const;

function decodeBone(value: unknown, index: number): BoneDefinition {
  const input = documentRecord(value, `bones[${index}]`);
  const parent = optionalString(input.parentId ?? input.parent_id);
  return {
    id: boneId(requiredString(input.id, `bones[${index}].id`)),
    name: requiredString(input.name, `bones[${index}].name`),
    path: optionalString(input.path) ?? requiredString(input.name, `bones[${index}].name`),
    parentId: parent ? boneId(parent) : null,
    bindLocal: parseTransform(input.bindLocal ?? input.bind_local),
    inverseBindMatrix: parseMatrix4(input.inverseBindMatrix ?? input.inverse_bind_matrix),
  };
}

function validateTopology(bones: readonly BoneDefinition[]): void {
  uniqueIds(bones, "bones");
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  for (const bone of bones) {
    if (bone.parentId && !byId.has(bone.parentId)) {
      throw new CharacterCodecError(
        "invalid-topology",
        `bones.${bone.id}.parentId`,
        `unknown parent ${bone.parentId}`,
      );
    }
    const visited = new Set<string>();
    let cursor: BoneDefinition | undefined = bone;
    while (cursor) {
      if (visited.has(cursor.id)) {
        throw new CharacterCodecError("invalid-topology", `bones.${bone.id}`, "bone hierarchy contains a cycle");
      }
      visited.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
}

export function decodeSkeletonDefinition(value: unknown): SkeletonDefinition {
  const input = documentRecord(value, "skeleton");
  acceptDocumentVersion(input, SKELETON_DEFINITION_FORMAT, ["braze/skeleton-v0"]);
  const bones = (Array.isArray(input.bones) ? input.bones : []).map(decodeBone);
  if (bones.length === 0) {
    throw new CharacterCodecError("invalid-topology", "bones", "a skeleton requires at least one bone");
  }
  validateTopology(bones);
  const roots = bones.filter((bone) => bone.parentId === null).map((bone) => bone.id);
  if (roots.length === 0) throw new CharacterCodecError("invalid-topology", "bones", "no root bone found");
  const sourceRef = parseAssetRef(input.sourceRef ?? input.source_ref, "sourceRef");
  const extensions = preservedDocumentFields(input, SKELETON_FIELDS);
  return {
    version: 1,
    id: requiredString(input.id, "id"),
    name: requiredString(input.name, "name"),
    ...(sourceRef ? { sourceRef } : {}),
    rootBoneIds: roots,
    bones,
    compatibilitySignature: optionalString(input.compatibilitySignature ?? input.compatibility_signature)
      ?? deriveSkeletonCompatibilitySignature(bones),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
}

export function encodeSkeletonDefinition(value: SkeletonDefinition) {
  validateTopology(value.bones);
  return {
    ...(value.extensions ?? {}),
    version: SKELETON_DEFINITION_FORMAT,
    id: value.id,
    name: value.name,
    ...(value.sourceRef ? { sourceRef: serializeAssetRef(value.sourceRef) } : {}),
    rootBoneIds: [...value.rootBoneIds],
    bones: value.bones.map((bone) => ({
      id: bone.id,
      name: bone.name,
      path: bone.path,
      parentId: bone.parentId,
      bindLocal: serializeTransform(bone.bindLocal),
      inverseBindMatrix: [...bone.inverseBindMatrix],
    })),
    compatibilitySignature: value.compatibilitySignature,
  };
}
