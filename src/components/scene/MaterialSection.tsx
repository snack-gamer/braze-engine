import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorObjectField } from "../InspectorObjectField";
import { InspectorRow } from "../InspectorRow";
import type { Material, PrimitiveKind, SceneObject } from "../../types";
import { assetDisplayName, primitiveLabel } from "../../lib/format";
import { isComponentRemoved, removeComponentPatch } from "../../lib/components";
import { SceneComponentSection } from "./SceneComponentPresentation";
import {
  MeshRendererMaterials,
  type MeshRendererMaterialSlot,
} from "./MeshRendererMaterials";
import { MeshRendererSettings } from "./MeshRendererSettings";

const MATERIAL_PRIMITIVES = new Set<PrimitiveKind>([
  "cube",
  "sphere",
  "plane",
  "fbx",
  "usdz",
  "usd",
  "gltf",
]);

type MaterialSectionProps = {
  object: SceneObject;
  materialLibrary: Material[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function hasMaterialControls(primitive: PrimitiveKind): boolean {
  return MATERIAL_PRIMITIVES.has(primitive);
}

function assetFilenameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.href);
    const prefix = "/3d-models/";
    if (!parsed.pathname.startsWith(prefix)) return undefined;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export function MaterialSection(props: MaterialSectionProps) {
  const { object, materialLibrary, updateObject } = props;
  const assetFilename = assetFilenameFromUrl(object.assetUrl);
  // Show a friendly mesh name — the imported asset's basename, or the
  // primitive type ("Cube") — never the internal import path.
  const meshName = object.assetName ? assetDisplayName(object.assetName) : primitiveLabel(object.primitive);
  const generatedSlots = assetFilename
    ? materialLibrary.filter((material) => material.sourceAssetFilename === assetFilename && material.sourceMaterialSlotKey)
    : [];
  const importedSlotMap = new Map<string, { slotKey: string; sourceName?: string; materialId?: string }>();
  const useGeneratedSlotDefaults = object.importedMaterialBindings === undefined;
  for (const material of generatedSlots) {
    importedSlotMap.set(material.sourceMaterialSlotKey!, {
      slotKey: material.sourceMaterialSlotKey!,
      sourceName: material.sourceMaterialName || material.name,
      materialId: useGeneratedSlotDefaults ? material.id : undefined,
    });
  }
  for (const binding of object.importedMaterialBindings ?? []) {
    importedSlotMap.set(binding.slotKey, {
      slotKey: binding.slotKey,
      sourceName: binding.sourceName ?? importedSlotMap.get(binding.slotKey)?.sourceName,
      materialId: binding.materialId,
    });
  }
  const importedSlots: MeshRendererMaterialSlot[] = Array.from(importedSlotMap.values()).map((slot) => ({
    key: slot.slotKey,
    sourceName: slot.sourceName,
    materialId: slot.materialId,
  }));
  const hasImportedSlots = importedSlots.length > 0;
  const materialSlots: MeshRendererMaterialSlot[] = hasImportedSlots
    ? importedSlots
    : [{ key: "__whole__", materialId: object.materialId }];

  const patchRenderer = (patchValue: NonNullable<SceneObject["meshRenderer"]>) => {
    updateObject(object.id, {
      meshRenderer: { ...object.meshRenderer, ...patchValue },
    });
  };

  const assignWholeObjectMaterial = (materialId: string) => {
    updateObject(object.id, { materialId: materialId || undefined });
  };

  const assignImportedSlot = (slotKey: string, materialId: string) => {
    const existing = object.importedMaterialBindings ?? [];
    const sourceName = importedSlotMap.get(slotKey)?.sourceName;
    const next = materialId
      ? [
          ...existing.filter((binding) => binding.slotKey !== slotKey),
          { slotKey, materialId, sourceName },
        ]
      : existing.filter((binding) => binding.slotKey !== slotKey);
    updateObject(object.id, { importedMaterialBindings: next, materialId: undefined });
  };

  const assignMaterial = (slotKey: string, materialId: string) => {
    if (slotKey === "__whole__") assignWholeObjectMaterial(materialId);
    else assignImportedSlot(slotKey, materialId);
  };

  const showFilter = !isComponentRemoved(object, "meshFilter");
  const showRenderer = !isComponentRemoved(object, "meshRenderer");

  return (
    <>
      {showFilter && (
      <SceneComponentSection
        componentId="meshFilter"
        id="object.meshFilter"
        className="mesh-filter-section"
        defaultOpen
        onRemove={() => updateObject(object.id, removeComponentPatch(object, "meshFilter"))}
      >
        <InspectorRow label="Mesh">
          <InspectorObjectField
            name={meshName}
            icon={<EditorIcon name="object" size="control" />}
            title={meshName}
          />
        </InspectorRow>
      </SceneComponentSection>
      )}

      {showRenderer && (
      <SceneComponentSection
        componentId="meshRenderer"
        id="object.meshRenderer"
        className="mesh-renderer-section"
        defaultOpen
        enable={{
          checked: object.meshRenderer?.enabled !== false,
          onChange: (checked) => patchRenderer({ enabled: checked }),
          ariaLabel: "Enable Mesh Renderer",
        }}
        onRemove={() => updateObject(object.id, removeComponentPatch(object, "meshRenderer"))}
      >
        <MeshRendererMaterials
          materials={materialLibrary}
          slots={materialSlots}
          onAssign={assignMaterial}
        />
        <MeshRendererSettings
          castShadows={object.meshRenderer?.castShadows !== false}
          receiveShadows={object.meshRenderer?.receiveShadows !== false}
          includeInRender={object.renderVisible !== false}
          onCastShadowsChange={(castShadows) => patchRenderer({ castShadows })}
          onReceiveShadowsChange={(receiveShadows) => patchRenderer({ receiveShadows })}
          onIncludeInRenderChange={(renderVisible) => updateObject(object.id, { renderVisible })}
        />
      </SceneComponentSection>
      )}
    </>
  );
}
