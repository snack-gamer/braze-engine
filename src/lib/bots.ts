import type { SceneObject, Vec3 } from "../types";

export const BOT_ASSET_URL = "/3d-models/app-avatar-bots/bot.fbx";
export const BOT_ASSET_NAME = "bot.fbx";
export const BOT_ASSET_NOTE = "built-in avatar bot · 3d-models/app-avatar-bots/bot.fbx";
export const BOT_ASSET_PREP_VERSION = "avatar-bot-prep-v3";
export const BOT_DEFAULT_POSITION_Y = 0;

export type BotColorProfile = {
  id: string;
  label: string;
  marker: string;
  color: string;
};

export const botColorProfiles = [
  { id: "bot-red", label: "Red", marker: "red", color: "#e53935" },
  { id: "bot-blue", label: "Blue", marker: "blue", color: "#1e88e5" },
  { id: "bot-green", label: "Green", marker: "green", color: "#43a047" },
  { id: "bot-yellow", label: "Yellow", marker: "yellow", color: "#fdd835" },
  { id: "bot-purple", label: "Purple", marker: "purple", color: "#8e24aa" },
  { id: "bot-cyan", label: "Cyan", marker: "cyan", color: "#00acc1" },
  { id: "bot-orange", label: "Orange", marker: "orange", color: "#fb8c00" },
  { id: "bot-pink", label: "Pink", marker: "pink", color: "#d81b60" },
  { id: "bot-teal", label: "Teal", marker: "teal", color: "#00897b" },
  { id: "bot-gray", label: "Gray", marker: "gray", color: "#90a4ae" },
] satisfies BotColorProfile[];

export function botProfileForId(id?: string | null): BotColorProfile | null {
  return botColorProfiles.find((profile) => profile.id === id) ?? null;
}

export function isAvatarBotAssetUrl(assetUrl?: string | null) {
  const lower = assetUrl?.toLowerCase() ?? "";
  return lower === BOT_ASSET_URL || lower.endsWith("/app-avatar-bots/bot.fbx");
}

export function isAvatarBotObject(object: Pick<SceneObject, "assetUrl" | "assetName" | "botProfileId" | "primitive">) {
  return (
    Boolean(object.botProfileId) ||
    isAvatarBotAssetUrl(object.assetUrl) ||
    (object.primitive === "fbx" && object.assetName === BOT_ASSET_NAME)
  );
}

export function usedBotProfileIds(objects: SceneObject[], exceptObjectId?: string): Set<string> {
  return new Set(
    objects
      .filter((object) => object.id !== exceptObjectId && isAvatarBotObject(object))
      .map((object) => object.botProfileId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}

export function nextAvailableBotProfile(objects: SceneObject[], exceptObjectId?: string): BotColorProfile | null {
  const used = usedBotProfileIds(objects, exceptObjectId);
  return botColorProfiles.find((profile) => !used.has(profile.id)) ?? null;
}

function isLegacyWorkaroundScale(scale: Vec3) {
  const uniform = scale.every((value) => Math.abs(value - scale[0]) < 0.0001);
  return uniform && scale[0] > 0 && scale[0] <= 0.421;
}

export function normalizeBotTransformBaseline(object: SceneObject): SceneObject {
  if (!isAvatarBotObject(object)) return object;
  const resetLegacyScale = isLegacyWorkaroundScale(object.scale);
  const resetLegacyY =
    Math.abs(object.position[1] - 0.8) < 0.0001 ||
    Math.abs(object.position[1] - 0.36) < 0.0001;
  if (!resetLegacyScale && !resetLegacyY) return object;
  return {
    ...object,
    position: resetLegacyY
      ? [object.position[0], BOT_DEFAULT_POSITION_Y, object.position[2]]
      : object.position,
    scale: resetLegacyScale ? [1, 1, 1] : object.scale,
  };
}

function shouldRenameBot(value: string | undefined, previousProfile: BotColorProfile | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return true;
  if (/^Bot( [A-Za-z]+)?( copy)?$/i.test(trimmed)) return true;
  return previousProfile ? trimmed === `Bot ${previousProfile.label}` : false;
}

export function botProfilePatch(profile: BotColorProfile, current?: SceneObject): Partial<SceneObject> {
  const previousProfile = botProfileForId(current?.botProfileId);
  const patch: Partial<SceneObject> = {
    botProfileId: profile.id,
    // SceneObject.color drives the mesh tint via makePhysicalMaterial(...).
    // This is the only mechanism that gives each bot its per-instance color
    // now that the per-object materialOverride feature was removed.
    color: profile.color,
    materialId: undefined,
  };
  if (shouldRenameBot(current?.name, previousProfile)) patch.name = `Bot ${profile.label}`;
  return patch;
}
