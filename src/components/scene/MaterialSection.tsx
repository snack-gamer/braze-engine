import { sourceMaterialSlots } from "../../mesh-renderer/adapters/source-material-slots";
import type { RendererMaterialSlot } from "../../mesh-renderer/application/renderer-material-slots";
import { rendererMaterialSlots } from "../../mesh-renderer/application/renderer-material-slots";
import { rendererPatch, resetRendererPatch } from "../../mesh-renderer/application/renderer-authoring";
import { useEffect, useState } from "react";
import { MeshFilterSection } from "../../mesh/components/MeshFilterSection";
import type { Material, PrimitiveKind, SceneObject } from "../../types";
import { isComponentRemoved, removeComponentPatch } from "../../lib/components";
import { SceneComponentSection } from "./SceneComponentPresentation";
import {
  MeshRendererMaterials,
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

export function MaterialSection(props: MaterialSectionProps) {
  const { object, materialLibrary, updateObject } = props;
  const [source, setSource] = useState<{ url?: string; slots: RendererMaterialSlot[] }>({ slots: [] });
  useEffect(() => {
    let active = true;
    void sourceMaterialSlots(object).then((slots) => { if (active) setSource({ url: object.assetUrl, slots }); });
    return () => { active = false; };
  }, [object.assetUrl, object.assetMeshBinding, object.assetMissing, object.primitive]);
  const materialSlots = rendererMaterialSlots(object, materialLibrary, !object.assetMeshBinding && source.url === object.assetUrl ? source.slots : []);
  const importedSlots = materialSlots.filter((slot) => slot.key !== "__whole__");

  const patchRenderer = (patchValue: NonNullable<SceneObject["meshRenderer"]>) => {
    updateObject(object.id, rendererPatch(object, patchValue));
  };

  const assignWholeObjectMaterial = (materialId: string) => {
    updateObject(object.id, rendererPatch(object, { materialId: materialId || null }));
  };

  const assignImportedSlot = (slotKey: string, materialId: string) => {
    const existing = importedSlots.filter((slot) => slot.materialId).map((slot) => ({ slotKey: slot.key, materialId: slot.materialId!, sourceName: slot.sourceName }));
    const sourceName = importedSlots.find((slot) => slot.key === slotKey)?.sourceName;
    const next = materialId
      ? [
          ...existing.filter((binding) => binding.slotKey !== slotKey),
          { slotKey, materialId, sourceName },
        ]
      : existing.filter((binding) => binding.slotKey !== slotKey);
    updateObject(object.id, rendererPatch(object, { materialBindings: next, materialId: null }));
  };

  const assignMaterial = (slotKey: string, materialId: string) => {
    if (slotKey === "__whole__") assignWholeObjectMaterial(materialId);
    else assignImportedSlot(slotKey, materialId);
  };

  const showFilter = !isComponentRemoved(object, "meshFilter");
  const showRenderer = !isComponentRemoved(object, "meshRenderer");

  return (
    <>
      {showFilter && <MeshFilterSection key={object.id} object={object} updateObject={updateObject} />}

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
        onReset={() => updateObject(object.id, resetRendererPatch(object))}
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
          onIncludeInRenderChange={(renderVisible) => updateObject(object.id, rendererPatch(object, { includeInRender: renderVisible }))}
        />
      </SceneComponentSection>
      )}
    </>
  );
}
