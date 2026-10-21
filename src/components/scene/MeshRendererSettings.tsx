import { InspectorRow } from "../InspectorRow";
import { EditorCheckbox } from "../../ui/controls/EditorCheckbox";
import { MeshRendererFoldout } from "./MeshRendererFoldout";

type MeshRendererSettingsProps = {
  castShadows: boolean;
  receiveShadows: boolean;
  includeInRender: boolean;
  onCastShadowsChange: (enabled: boolean) => void;
  onReceiveShadowsChange: (enabled: boolean) => void;
  onIncludeInRenderChange: (enabled: boolean) => void;
};

export function MeshRendererSettings({
  castShadows,
  receiveShadows,
  includeInRender,
  onCastShadowsChange,
  onReceiveShadowsChange,
  onIncludeInRenderChange,
}: MeshRendererSettingsProps) {
  return (
    <div className="mesh-renderer-settings">
      <MeshRendererFoldout id="object.meshRenderer.lighting" title="Lighting">
        <InspectorRow label="Cast Shadows">
          <select
            aria-label="Cast Shadows"
            value={castShadows ? "on" : "off"}
            onChange={(event) => onCastShadowsChange(event.target.value === "on")}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Receive Shadows">
          <EditorCheckbox
            checked={receiveShadows}
            aria-label="Receive Shadows"
            onChange={(event) => onReceiveShadowsChange(event.currentTarget.checked)}
          />
        </InspectorRow>
      </MeshRendererFoldout>
      <MeshRendererFoldout id="object.meshRenderer.additional" title="Additional Settings">
        <InspectorRow label="Include in Render">
          <EditorCheckbox
            checked={includeInRender}
            aria-label="Include in Render"
            onChange={(event) => onIncludeInRenderChange(event.currentTarget.checked)}
          />
        </InspectorRow>
      </MeshRendererFoldout>
    </div>
  );
}
