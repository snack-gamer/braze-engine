import { useState, type CSSProperties } from "react";
import { InspectorObjectField } from "../InspectorObjectField";
import { MaterialPicker } from "../../mesh-renderer/components/MaterialPicker";
import type { Material } from "../../types";
import { assetDisplayName } from "../../lib/format";
import { MATERIAL_TYPE } from "../AssetBrowser/drag";
import { MeshRendererFoldout } from "./MeshRendererFoldout";

import type { RendererMaterialSlot } from "../../mesh-renderer/application/renderer-material-slots";

type MeshRendererMaterialsProps = {
  materials: Material[];
  slots: RendererMaterialSlot[];
  onAssign: (slotKey: string, materialId: string) => void;
};

export function MeshRendererMaterials({
  materials,
  slots,
  onAssign,
}: MeshRendererMaterialsProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const materialById = new Map(materials.map((material) => [material.id, material]));

  return (
    <MeshRendererFoldout
      id="object.meshRenderer.materials"
      title="Materials"
      meta={<output aria-label="Material count">{slots.length}</output>}
    >
      <div className="mesh-renderer-materials" role="list" aria-label="Renderer materials">
        {slots.map((slot, index) => {
          const label = `Element ${index}`;
          const material = slot.materialId ? materialById.get(slot.materialId) : undefined;
          const displayName = assetDisplayName(material?.name ?? slot.sourceName) || "None (Material)";
          return (
            <div
              key={slot.key}
              className="mesh-renderer-material-row"
              role="listitem"
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(MATERIAL_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "link";
              }}
              onDrop={(event) => {
                if (!event.dataTransfer.types.includes(MATERIAL_TYPE)) return;
                event.preventDefault();
                const id = event.dataTransfer.getData(MATERIAL_TYPE);
                if (materialById.has(id)) onAssign(slot.key, id);
              }}
            >
              <span className="mesh-renderer-material-row__label">{label}</span>
              <InspectorObjectField name={slot.materialId && !material ? "Missing (Material)" : displayName}
                placeholder="None (Material)" pickLabel={`Select material for ${label}`} onPick={() => setPicking(slot.key)}
                onClear={() => onAssign(slot.key, "")}
                title={slot.materialId && !material ? `Missing material: ${slot.materialId}` : displayName}
                icon={<span className="mesh-renderer-material-field__swatch" style={material ? { "--material-color": material.color } as CSSProperties : undefined} />}
                onReveal={material ? () => window.dispatchEvent(new CustomEvent("tgan:focus-material", { detail: { id: material.id } })) : undefined} />
            </div>
          );
        })}
      </div>
      {picking !== null && <MaterialPicker materials={materials}
        value={slots.find((slot) => slot.key === picking)?.materialId ?? null}
        onChoose={(id) => { onAssign(picking, id ?? ""); setPicking(null); }} onClose={() => setPicking(null)} />}
    </MeshRendererFoldout>
  );
}
