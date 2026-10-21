import { EditorIcon } from "../../../ui/EditorIcon";
import { InspectorToggle } from "../../InspectorToggle";
import { SceneComponentIdentity } from "../SceneComponentPresentation";

type AnimationPlayerEditorProps = {
  enabled: boolean;
  update: (enabled: boolean) => void;
  remove: () => void;
};

export function AnimationPlayerEditor({ enabled, update, remove }: AnimationPlayerEditorProps) {
  return (
    <div className="component-card">
      <div className="component-card__head">
        <span>
          <SceneComponentIdentity componentId="animationPlayer" />
        </span>
        <button
          className="icon-button danger"
          type="button"
          title="Remove component"
          onClick={remove}
        >
          <EditorIcon name="delete" size="control" />
        </button>
      </div>
      <InspectorToggle
        checked={enabled}
        label={(
          <>
            <strong>Enable timeline</strong>
            <span>This object and its children appear in Normal animation.</span>
          </>
        )}
        onChange={update}
      />
    </div>
  );
}
