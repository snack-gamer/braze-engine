import type * as THREE from "three";
import type { CharacterDiagnostic } from "../../domain/diagnostics";
import { boneId, type BoneId, type SkeletonDefinition } from "../../domain/skeleton";
import { getThreeObjectPath } from "./three-object-path";

export type ThreeSkeletonEditorBinding = Readonly<{
  boneById: ReadonlyMap<BoneId, THREE.Bone>;
  idByBone: ReadonlyMap<THREE.Bone, BoneId>;
  diagnostics: readonly CharacterDiagnostic[];
}>;

/**
 * Resolves serialized BoneIds back to live editor bones for the same import
 * hierarchy. No binding is guessed by display name.
 */
export function bindExtractedThreeSkeleton(
  root: THREE.Object3D,
  definition: SkeletonDefinition,
): ThreeSkeletonEditorBinding {
  const expectedIds = new Set(definition.bones.map((bone) => bone.id));
  const boneById = new Map<BoneId, THREE.Bone>();
  const idByBone = new Map<THREE.Bone, BoneId>();
  const diagnostics: CharacterDiagnostic[] = [];

  root.traverse((object) => {
    const bone = object as THREE.Bone;
    if (!bone.isBone) return;
    const id = boneId(`bone:${getThreeObjectPath(root, bone)}`);
    if (!expectedIds.has(id)) return;
    if (boneById.has(id)) {
      diagnostics.push({
        code: "ambiguous-live-bone-id",
        severity: "error",
        message: `More than one live bone resolved to ${id}.`,
        boneId: id,
      });
      return;
    }
    boneById.set(id, bone);
    idByBone.set(bone, id);
  });

  for (const bone of definition.bones) {
    if (boneById.has(bone.id)) continue;
    diagnostics.push({
      code: "missing-live-bone",
      severity: "error",
      message: `The live import hierarchy no longer contains ${bone.path}.`,
      boneId: bone.id,
    });
  }
  return { boneById, idByBone, diagnostics };
}
