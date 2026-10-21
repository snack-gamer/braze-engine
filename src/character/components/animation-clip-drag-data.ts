import type { AssetRef } from "../../assets/domain/asset-reference";

export const ANIMATION_CLIP_DRAG_TYPE = "application/x-braze-animation-clip";

export type AnimationClipDragData = Readonly<{
  clipRef: AssetRef;
  name: string;
}>;

export function writeAnimationClipDrag(
  dataTransfer: DataTransfer,
  payload: AnimationClipDragData,
): void {
  dataTransfer.setData(ANIMATION_CLIP_DRAG_TYPE, JSON.stringify(payload));
  dataTransfer.setData("text/plain", payload.name);
  dataTransfer.effectAllowed = "copy";
}

export function hasAnimationClipDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(ANIMATION_CLIP_DRAG_TYPE);
}

export function readAnimationClipDrag(dataTransfer: DataTransfer): AnimationClipDragData | null {
  if (!hasAnimationClipDrag(dataTransfer)) return null;
  try {
    const value = JSON.parse(dataTransfer.getData(ANIMATION_CLIP_DRAG_TYPE)) as Record<string, unknown>;
    const clipRef = record(value.clipRef);
    const guid = typeof clipRef?.guid === "string" ? clipRef.guid.trim().toLowerCase() : "";
    const localId = typeof clipRef?.localId === "string" ? clipRef.localId.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!/^[a-f0-9]{32}$/.test(guid) || !localId || !name) return null;
    return { clipRef: { guid, localId }, name };
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
