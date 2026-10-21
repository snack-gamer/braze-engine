import type { AssetKind } from "../../hooks/useAssetFolders";
import {
  CHARACTER_ASSET_DRAG_TYPE,
  readCharacterAssetDrag,
} from "../../character/components/character-asset-drag-data";

// One pending reparent. The drop handler turns a DragEvent into an array of
// these so single-item and multi-selection drags collapse to the same path.
export type AssetMove = { kind: AssetKind; id: string };

export const SELECTION_TYPE = "application/x-tgan-selection";
export const MATERIAL_TYPE = "application/x-tgan-material";
const ASSET_TYPE = "application/x-tgan-asset";
const HDRI_TYPE = "application/x-tgan-hdri";
export const HIERARCHY_ROW_TYPE = "application/x-tgan-row";
export const HIERARCHY_ROWS_TYPE = "application/x-tgan-rows";

const ALL_TYPES = [SELECTION_TYPE, MATERIAL_TYPE, ASSET_TYPE, HDRI_TYPE, CHARACTER_ASSET_DRAG_TYPE, HIERARCHY_ROW_TYPE, HIERARCHY_ROWS_TYPE] as const;

export function hasAssetDragPayload(dataTransfer: DataTransfer): boolean {
  const types = dataTransfer.types;
  for (const type of ALL_TYPES) {
    if (types.includes(type)) return true;
  }
  return false;
}

export function hasExternalFiles(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes("Files");
}

// Multi-selection payload wins if present. Single-item types are kept for
// drops on targets outside the asset browser (viewport, hierarchy rows).
export function extractAssetMoves(dataTransfer: DataTransfer): AssetMove[] {
  const types = dataTransfer.types;

  if (types.includes(SELECTION_TYPE)) {
    try {
      const raw = JSON.parse(dataTransfer.getData(SELECTION_TYPE)) as Array<{
        kind: string;
        id: string;
      }>;
      return raw.filter(
        (it): it is AssetMove =>
          it.kind === "material"
          || it.kind === "model"
          || it.kind === "image"
          || it.kind === "prefab"
          || it.kind === "hdri"
          || it.kind === "avatarMask"
          || it.kind === "inputActionMap" || it.kind === "font",
      );
    } catch {
      return [];
    }
  }

  if (types.includes(MATERIAL_TYPE)) {
    const id = dataTransfer.getData(MATERIAL_TYPE);
    return id ? [{ kind: "material", id }] : [];
  }

  if (types.includes(ASSET_TYPE)) {
    try {
      const p = JSON.parse(dataTransfer.getData(ASSET_TYPE)) as {
        filename?: string;
        kind?: string;
      };
      if (!p.filename) return [];
      if (p.kind !== undefined && p.kind !== "model" && p.kind !== "image" && p.kind !== "prefab" && p.kind !== "inputActionMap" && p.kind !== "font") return [];
      return [{ kind: p.kind === "font" ? "font" : p.kind === "image" ? "image" : p.kind === "prefab" ? "prefab" : p.kind === "inputActionMap" ? "inputActionMap" : "model", id: p.filename }];
    } catch {
      return [];
    }
  }

  if (types.includes(HDRI_TYPE)) {
    try {
      const p = JSON.parse(dataTransfer.getData(HDRI_TYPE)) as { filename?: string };
      return p.filename ? [{ kind: "hdri", id: p.filename }] : [];
    } catch {
      return [];
    }
  }

  const characterAsset = readCharacterAssetDrag(dataTransfer);
  if (characterAsset) return [{ kind: characterAsset.kind, id: characterAsset.id }];

  return [];
}

export function extractHierarchyRows(dataTransfer: DataTransfer): string[] {
  const types = dataTransfer.types;
  if (types.includes(HIERARCHY_ROWS_TYPE)) {
    try {
      const parsed = JSON.parse(dataTransfer.getData(HIERARCHY_ROWS_TYPE));
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string");
      }
    } catch {
      return [];
    }
  }
  if (types.includes(HIERARCHY_ROW_TYPE)) {
    const id = dataTransfer.getData(HIERARCHY_ROW_TYPE);
    return id ? [id] : [];
  }
  return [];
}
