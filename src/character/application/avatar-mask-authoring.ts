import { HUMANOID_BODY_PARTS, type AvatarMaskAsset, type HumanoidBodyPart } from "../domain/avatar-mask";
import type { BoneId } from "../domain/skeleton";

export function setHumanoidBodyPartActive(
  mask: AvatarMaskAsset,
  part: HumanoidBodyPart,
  active: boolean,
): AvatarMaskAsset {
  if (!HUMANOID_BODY_PARTS.includes(part)) return mask;
  return {
    ...mask,
    humanoidBodyParts: { ...mask.humanoidBodyParts, [part]: active },
  };
}

export function addAvatarMaskTransform(
  mask: AvatarMaskAsset,
  path: string,
  options: { boneId?: BoneId; active?: boolean } = {},
): AvatarMaskAsset {
  const normalizedPath = path.trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedPath || mask.transforms.some((transform) => transform.path === normalizedPath)) return mask;
  return {
    ...mask,
    transforms: [...mask.transforms, {
      path: normalizedPath,
      active: options.active !== false,
      ...(options.boneId ? { boneId: options.boneId } : {}),
    }],
  };
}

export function patchAvatarMaskTransform(
  mask: AvatarMaskAsset,
  index: number,
  patch: { path?: string; active?: boolean; boneId?: BoneId },
): AvatarMaskAsset {
  if (index < 0 || index >= mask.transforms.length) return mask;
  const current = mask.transforms[index];
  const path = patch.path === undefined
    ? current.path
    : patch.path.trim().replace(/^\/+|\/+$/g, "");
  if (!path) return mask;
  if (mask.transforms.some((transform, candidateIndex) => candidateIndex !== index && transform.path === path)) {
    return mask;
  }
  return {
    ...mask,
    transforms: mask.transforms.map((transform, candidateIndex) => candidateIndex === index
      ? { ...transform, ...patch, path }
      : transform),
  };
}

export function removeAvatarMaskTransform(mask: AvatarMaskAsset, index: number): AvatarMaskAsset {
  if (index < 0 || index >= mask.transforms.length) return mask;
  return { ...mask, transforms: mask.transforms.filter((_transform, candidateIndex) => candidateIndex !== index) };
}
