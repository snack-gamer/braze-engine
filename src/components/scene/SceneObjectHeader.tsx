import type { SceneObject } from "../../types";
import { objectKindTone } from "../../scene/presentation/object-kind-presentation";
import { EditorIcon } from "../../ui/EditorIcon";
import { primitiveIconNames } from "../../ui/icons";
import { PanelHeader } from "./PanelHeader";
import { EditorCheckbox } from "../../ui/controls/EditorCheckbox";

/** Object identity and editor visibility use the same controls for every kind. */
export function SceneObjectHeader({ object, updateObject }: {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
}) {
  return <PanelHeader
    title={object.name || "(unnamed)"}
    nameField={{ id: object.id, value: object.name, onChange: (name) => updateObject(object.id, { name }) }}
    tone={objectKindTone(object.primitive)}
    icon={<EditorIcon name={primitiveIconNames[object.primitive]} size="control" />}
    leading={<EditorCheckbox checked={object.visible} aria-label="Visible in editor" title="Visible in editor"
      onChange={(event) => updateObject(object.id, { visible: event.target.checked })} />}
    actions={<>
      <button className={`icon-button ${object.locked ? "active" : ""}`} type="button"
        aria-label={object.locked ? "Unlock object" : "Lock object"}
        title={object.locked ? "Unlock object" : "Lock object"}
        onClick={() => updateObject(object.id, { locked: !object.locked })}>
        <EditorIcon name={object.locked ? "locked" : "unlocked"} size="compact" />
      </button>
    </>}
  />;
}
