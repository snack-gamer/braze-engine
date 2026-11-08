import { useProjectLayers } from "../../world/application/useProjectLayers";
import { cameraIncludesLayer } from "../domain/camera-settings";
import { InspectorMenuSelect } from "../../components/InspectorMenuSelect";
import { EditorIcon } from "../../ui/EditorIcon";

export function CameraCullingMask({ value, onChange }: { value: number; onChange: (mask: number) => void }) {
  const { catalog } = useProjectLayers();
  const count = catalog.names.reduce((total, _, index) => total + Number(cameraIncludesLayer(value, index)), 0);
  return <InspectorMenuSelect label="Camera culling mask"
    value={value === 0xffffffff ? "Everything" : value === 0 ? "Nothing" : `${count} layer${count === 1 ? "" : "s"}`}>
    <button type="button" className="inspector-select-menu__item" role="menuitemcheckbox" aria-checked={value === 0}
      onClick={() => onChange(0)}><EditorIcon name="check" size="control" /> Nothing</button>
    <button type="button" className="inspector-select-menu__item" role="menuitemcheckbox" aria-checked={value === 0xffffffff}
      onClick={() => onChange(0xffffffff)}><EditorIcon name="check" size="control" /> Everything</button>
    <div className="inspector-select-menu__divider" role="separator" />
    {catalog.names.map((name, index) => <button key={index} type="button" className="inspector-select-menu__item"
      role="menuitemcheckbox" aria-label={`Render layer ${index}: ${name || "Unnamed"}`} aria-checked={cameraIncludesLayer(value, index)}
      onClick={() => onChange((value ^ (1 << index)) >>> 0)}>
      <EditorIcon name="check" size="control" /><span>{index}: {name || "Unnamed"}</span>
    </button>)}
  </InspectorMenuSelect>;
}
