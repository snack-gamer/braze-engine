import type { FocusedLibraryAsset } from "../../components/AssetBrowser/AssetBrowser";
import type { InspectorTarget, Material, SceneObject } from "../../types";

export type EditorSelectionStatus = Readonly<{
  label: string;
  detail: string;
}>;

type EditorSelectionStatusInput = {
  focusedAsset: FocusedLibraryAsset;
  selectedMaterial: Material | null;
  inspectorTarget: InspectorTarget;
  activeObject: SceneObject | null;
  prefabName?: string;
  editingCollider: boolean;
  selectedModifierPin: boolean;
};

function readableKind(kind: string): string {
  return kind
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

/** Resolves the one user-facing selection context shared by all editor panes. */
export function resolveEditorSelectionStatus(input: EditorSelectionStatusInput): EditorSelectionStatus {
  if (input.inspectorTarget === "physics") return { label: "Physics Settings", detail: "Project settings" };
  if (input.inspectorTarget === "environment") return { label: "Render Settings", detail: "Scene environment" };
  if (input.selectedMaterial) return { label: input.selectedMaterial.name, detail: "Material" };
  if (input.focusedAsset) {
    const subAsset = input.focusedAsset.localId
      ? input.focusedAsset.asset.subAssets?.find((item) => item.localId === input.focusedAsset?.localId)
      : undefined;
    return subAsset
      ? { label: subAsset.name, detail: `${readableKind(subAsset.kind)} · ${input.focusedAsset.asset.name}` }
      : { label: input.focusedAsset.asset.name, detail: readableKind(input.focusedAsset.kind) };
  }
  if (!input.activeObject) return { label: "No selection", detail: "Scene" };
  if (input.editingCollider) return { label: input.activeObject.name, detail: "Collider edit" };
  if (input.selectedModifierPin) return { label: input.activeObject.name, detail: "Modifier pin" };
  const objectKind = readableKind(input.activeObject.primitive);
  return input.prefabName
    ? { label: input.activeObject.name, detail: `${objectKind} · ${input.prefabName} Prefab` }
    : { label: input.activeObject.name, detail: `${objectKind} · Scene object` };
}
