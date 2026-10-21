import type { LibraryAsset } from "../../lib/asset-api";
import {
  createDefaultAnimatorComponent,
  type AnimatorComponent,
} from "../domain/animator-component";
import { REQUIRED_HUMANOID_BONES } from "../domain/humanoid-avatar";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isConfiguredPlayableAvatar(value: unknown): value is Readonly<{
  kind: "avatar";
  localId: string;
}> {
  const avatar = record(value);
  if (avatar?.kind !== "avatar" || typeof avatar.localId !== "string" || !avatar.localId.trim()) {
    return false;
  }
  const bones = Array.isArray(avatar.bones) ? avatar.bones : [];
  if (avatar.configuredRigKind === "generic") return bones.length > 0;
  if (avatar.configuredRigKind !== "humanoid") return false;
  const mapping = record(avatar.humanBoneMapping);
  return bones.length > 0 && REQUIRED_HUMANOID_BONES.every((name) => (
    typeof mapping?.[name] === "string" && String(mapping[name]).trim().length > 0
  ));
}

function hasUsableImportStatus(asset: Pick<LibraryAsset, "status">): boolean {
  return asset.status === "ready" || asset.status === "dirty";
}

/** Creates the non-playing scene default for one unambiguous configured model rig. */
export function defaultAnimatorForImportedModel(
  asset: Pick<LibraryAsset, "guid" | "kind" | "name" | "status" | "subAssets">,
): AnimatorComponent | undefined {
  if (asset.kind !== "model" || !asset.guid || !hasUsableImportStatus(asset)) return undefined;
  const avatars = (asset.subAssets ?? []).filter(isConfiguredPlayableAvatar);
  if (avatars.length !== 1) return undefined;
  return {
    ...createDefaultAnimatorComponent(
      asset.guid,
      `${asset.name} Controller`,
    ),
    avatarRef: { guid: asset.guid.toLowerCase(), localId: avatars[0]!.localId },
  };
}
