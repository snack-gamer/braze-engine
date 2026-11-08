import { useOpenIdentitySettings } from "../application/ProjectIdentitySettingsContext";
import type { SceneObject } from "../../scene/domain/scene-object";
import { useProjectTags } from "../application/useProjectTags";
import "./entity-tags.css";
import { useProjectLayers } from "../application/useProjectLayers";

/** Tag is an intrinsic identity field in the object header, not a component card. */
export function EntityTagHeader({ object, onChange, onLayerChange }: Readonly<{
  object: SceneObject; objects: readonly SceneObject[]; onChange: (tags: readonly string[]) => void; onLayerChange: (layer: number) => void;
}>) {
  const project = useProjectTags(), layers = useProjectLayers(), openSettings = useOpenIdentitySettings();
  const assigned = object.tags?.[0] ?? "", missing = assigned && !project.catalog.names.includes(assigned);
  return <div className="entity-tag-header">
    <label><span>Tag</span><select className="editor-select" aria-label="Object tag" value={assigned} disabled={!project.ready || project.saving}
      onChange={(event) => { const value = event.currentTarget.value; if (value === "__add_tag__") openSettings("tags"); else onChange(value ? [value] : []); }}>
      <option value="">Untagged</option>
      {missing && <option value={assigned}>{assigned} (missing definition)</option>}
      {project.catalog.names.map((name) => <option key={name} value={name}>{name}</option>)}
      <option disabled>────────</option><option value="__add_tag__">Add Tag…</option>
    </select></label>
    <label className="entity-tag-header__layer"><span>Layer</span>
      <select className="editor-select" aria-label="Object layer" value={object.layer ?? 0} disabled={!layers.ready || layers.saving}
        onChange={(event) => { const value = event.currentTarget.value; if (value === "__add_layer__") openSettings("layers"); else onLayerChange(Number(value)); }}>
        {layers.catalog.names.map((name, index) => (name || index === (object.layer ?? 0)) && <option key={index} value={index}>{name || `Layer ${index} (unnamed)`}</option>)}
        <option disabled>────────</option><option value="__add_layer__">Add Layer…</option>
      </select>
    </label>
    {(project.error || layers.error) && <span role="alert">{project.error || layers.error}</span>}
  </div>;
}
