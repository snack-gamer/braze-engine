import type { AssetSubAsset, LibraryAsset } from "../../lib/api";
import { boneId, type BoneId } from "../domain/skeleton";

export type ImportedRigBoneSummary = Readonly<{
  id: BoneId;
  name: string;
  path: string;
  parentId: BoneId | null;
}>;

export type ImportedRigSummary = Readonly<{
  localId: string;
  name: string;
  skeletonSignature?: string;
  rootBoneId?: BoneId;
  bones: readonly ImportedRigBoneSummary[];
  skinCount: number;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBone(value: unknown): ImportedRigBoneSummary | null {
  const source = record(value);
  const id = stringValue(source?.localId ?? source?.id);
  const name = stringValue(source?.name);
  if (!id || !name) return null;
  const path = stringValue(source?.path) ?? name;
  const parent = source?.parentLocalId ?? source?.parentId;
  return {
    id: boneId(id),
    name,
    path,
    parentId: stringValue(parent) ? boneId(stringValue(parent)!) : null,
  };
}

function parseRig(entry: AssetSubAsset): ImportedRigSummary | null {
  if (entry.kind !== "avatar" && entry.kind !== "skeleton") return null;
  const source = entry as AssetSubAsset & Record<string, unknown>;
  const root = record(source.skeletonRoot);
  const rootBoneId = stringValue(root?.localId ?? source.rootBoneId);
  return {
    localId: entry.localId,
    name: entry.name,
    skeletonSignature: stringValue(source.skeletonSignature ?? source.compatibilitySignature),
    ...(rootBoneId ? { rootBoneId: boneId(rootBoneId) } : {}),
    bones: (Array.isArray(source.bones) ? source.bones : []).map(parseBone)
      .filter((bone): bone is ImportedRigBoneSummary => Boolean(bone)),
    skinCount: Array.isArray(source.skins) ? source.skins.length : 0,
  };
}

/** Reads optional server-derived rig facts without making them persistence authority. */
export function importedRigSummaries(
  asset: Pick<LibraryAsset, "subAssets">,
): readonly ImportedRigSummary[] {
  return (asset.subAssets ?? []).map(parseRig)
    .filter((summary): summary is ImportedRigSummary => Boolean(summary));
}

export function primaryImportedRigSummary(
  asset: Pick<LibraryAsset, "subAssets">,
): ImportedRigSummary | null {
  return [...importedRigSummaries(asset)].sort((left, right) => (
    right.bones.length - left.bones.length
    || right.skinCount - left.skinCount
    || left.localId.localeCompare(right.localId)
  ))[0] ?? null;
}
