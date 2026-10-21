import type { PrefabOverrideKey, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";

const OVERRIDE_LABELS: Record<PrefabOverrideKey, string> = {
  name: "Name",
  tags: "Tags",
  color: "Color",
  visibility: "Visibility",
  lock: "Lock",
  transform: "Transform",
  hierarchy: "Hierarchy",
  asset: "Asset",
  botProfile: "Bot color",
  materialId: "Material",
  importedMaterialBindings: "Imported materials",
  meshRenderer: "Mesh renderer",
  water: "Water",
  cloner: "Cloner",
  particle: "Particles",
  camera: "Camera",
  directionalLight: "Directional light",
  modifiers: "Components",
  components: "Components",
  display: "Display",
  rowStyle: "Row tint",
};

type PrefabInstanceCardProps = {
  object: SceneObject;
};

export function PrefabInstanceCard({ object }: PrefabInstanceCardProps) {
  const link = object.prefabLink;
  if (!link) return null;
  const overrides = link.overrides ?? [];
  return (
    <div className={`info-card prefab-instance-card ${overrides.length > 0 ? "has-overrides" : ""}`}>
      <div className="prefab-instance-card__title">
        <span>
          <EditorIcon name="assetPrefab" size="control" /> Linked prefab
        </span>
        <strong>{overrides.length}</strong>
      </div>
      <div className="prefab-instance-card__name">{link.prefabName}</div>
      <div className="prefab-instance-card__meta">
        <EditorIcon name="prefabLink" size="compact" />
        <span>{link.prefabFilename}</span>
      </div>
      {overrides.length > 0 ? (
        <div className="prefab-override-list" aria-label="Prefab overrides">
          {overrides.map((key) => (
            <span key={key} className="prefab-override-chip">
              {OVERRIDE_LABELS[key] ?? key}
            </span>
          ))}
        </div>
      ) : (
        <span className="prefab-instance-card__clean">Inheriting all prefab properties</span>
      )}
    </div>
  );
}
