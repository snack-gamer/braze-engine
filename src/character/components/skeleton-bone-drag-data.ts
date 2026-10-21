import type { BoneId } from "../domain/skeleton";

export const SKELETON_BONE_DRAG_TYPE = "application/x-braze-skeleton-bone";

export function writeSkeletonBoneDrag(dataTransfer: DataTransfer, boneId: BoneId): void {
  dataTransfer.setData(SKELETON_BONE_DRAG_TYPE, boneId);
  dataTransfer.setData("text/plain", boneId);
  dataTransfer.effectAllowed = "copy";
}

export function hasSkeletonBoneDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(SKELETON_BONE_DRAG_TYPE);
}

export function readSkeletonBoneDrag(
  dataTransfer: DataTransfer,
  availableBones: ReadonlyMap<BoneId, unknown>,
): BoneId | null {
  const candidate = dataTransfer.getData(SKELETON_BONE_DRAG_TYPE) as BoneId;
  return candidate && availableBones.has(candidate) ? candidate : null;
}
