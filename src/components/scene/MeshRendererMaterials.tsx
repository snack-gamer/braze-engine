import type { CSSProperties } from "react";
import type { Material } from "../../types";
import { assetDisplayName } from "../../lib/format";
import { EditorIcon } from "../../ui/EditorIcon";
import { MATERIAL_TYPE } from "../AssetBrowser/drag";
import { MeshRendererFoldout } from "./MeshRendererFoldout";

export type MeshRendererMaterialSlot = {
  key: string;
  sourceName?: string;
  materialId?: string;
};

type MeshRendererMaterialsProps = {
  materials: Material[];
  slots: MeshRendererMaterialSlot[];
  onAssign: (slotKey: string, materialId: string) => void;
};

export function MeshRendererMaterials({
  materials,
  slots,
  onAssign,
}: MeshRendererMaterialsProps) {
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
                onAssign(slot.key, event.dataTransfer.getData(MATERIAL_TYPE));
              }}
            >
              <span className="mesh-renderer-material-row__handle" aria-hidden="true">
                <EditorIcon name="dragHandle" size="compact" />
              </span>
              <span className="mesh-renderer-material-row__label">{label}</span>
              <button
                type="button"
                className={`mesh-renderer-material-field ${material ? "" : "is-empty"}`}
                disabled={!material}
                title={material ? `Reveal ${displayName} in Project` : "Drop a material here"}
                aria-label={material ? `Reveal ${displayName} in Project` : `No material assigned to ${label}`}
                onClick={() => material && window.dispatchEvent(new CustomEvent(
                  "tgan:focus-material",
                  { detail: { id: material.id } },
                ))}
              >
                <span
                  className="mesh-renderer-material-field__swatch"
                  style={material ? { "--material-color": material.color } as CSSProperties : undefined}
                  aria-hidden="true"
                />
                <span className="mesh-renderer-material-field__name">{displayName}</span>
                <span className="mesh-renderer-material-field__reveal" aria-hidden="true">
                  <EditorIcon name="reveal" size="control" />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </MeshRendererFoldout>
  );
}
