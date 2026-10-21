import type { LibraryAsset } from "../../../lib/api";
import type { DisplacerModifier, ObjectModifier } from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { EditorCheckbox } from "../../../ui/controls";
import { DisplacerOutputEditors } from "./DisplacerOutputEditors";
import { DisplacerSourceEditor } from "./DisplacerSourceEditor";
import { SceneComponentIdentity } from "../SceneComponentPresentation";

type DisplacerEditorProps = {
  modifier: DisplacerModifier;
  imageAssets: LibraryAsset[];
  patchModifier: (modifier: ObjectModifier) => void;
  removeModifier: (modifierId: string) => void;
};

export function DisplacerEditor({
  modifier,
  imageAssets,
  patchModifier,
  removeModifier,
}: DisplacerEditorProps) {
  const patch = (value: Partial<DisplacerModifier>) => patchModifier({ ...modifier, ...value });
  return (
    <div className="modifier-editor-card displacer-card">
      <div className="modifier-editor-header">
        <span>
          <SceneComponentIdentity
            componentId="modifier:displacer"
            label={modifier.name || undefined}
          />
        </span>
        <div className="rail-actions">
          <label className="material-toggle">
            <EditorCheckbox
              checked={modifier.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            <span>{modifier.enabled ? "On" : "Off"}</span>
          </label>
          <button
            className="icon-button danger"
            type="button"
            title="Remove component"
            onClick={() => removeModifier(modifier.id)}
          >
            <EditorIcon name="delete" size="control" />
          </button>
        </div>
      </div>
      <DisplacerSourceEditor modifier={modifier} imageAssets={imageAssets} patch={patch} />
      <DisplacerOutputEditors modifier={modifier} patch={patch} />
    </div>
  );
}
