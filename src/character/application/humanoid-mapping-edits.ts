import type { HumanBoneMapping, HumanoidBoneName } from "../domain/humanoid-avatar";
import type { BoneId } from "../domain/skeleton";

/** Assigns one source bone to one Humanoid role, moving it from any previous role. */
export function assignHumanoidBone(
  mapping: HumanBoneMapping,
  role: HumanoidBoneName,
  boneId: BoneId,
): HumanBoneMapping {
  const next = { ...mapping };
  for (const [candidate, assignedBoneId] of Object.entries(next) as Array<[HumanoidBoneName, BoneId | undefined]>) {
    if (candidate !== role && assignedBoneId === boneId) delete next[candidate];
  }
  next[role] = boneId;
  return next;
}

export function clearHumanoidBone(
  mapping: HumanBoneMapping,
  role: HumanoidBoneName,
): HumanBoneMapping {
  const next = { ...mapping };
  delete next[role];
  return next;
}
