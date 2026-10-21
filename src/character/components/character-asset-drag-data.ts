export const CHARACTER_ASSET_DRAG_TYPE = "application/x-braze-character-asset";

export type CharacterAssetDragData = Readonly<{
  kind: "avatarMask";
  id: string;
}>;

export function writeCharacterAssetDrag(
  dataTransfer: DataTransfer,
  payload: CharacterAssetDragData,
): void {
  dataTransfer.setData(CHARACTER_ASSET_DRAG_TYPE, JSON.stringify(payload));
}

export function readCharacterAssetDrag(dataTransfer: DataTransfer): CharacterAssetDragData | null {
  if (!dataTransfer.types.includes(CHARACTER_ASSET_DRAG_TYPE)) return null;
  try {
    const value = JSON.parse(dataTransfer.getData(CHARACTER_ASSET_DRAG_TYPE)) as Record<string, unknown>;
    if (value.kind !== "avatarMask"
      || typeof value.id !== "string"
      || !value.id.trim()) return null;
    return { kind: value.kind, id: value.id };
  } catch {
    return null;
  }
}
