import { normalizeCharacterMovement } from "../domain/character-movement";
import type { SceneObject } from "../../scene/domain/scene-object";
import { InspectorRow } from "../../components/InspectorRow";
import { InspectorToggle } from "../../components/InspectorToggle";
import { SceneComponentIdentity } from "../../components/scene/SceneComponentPresentation";
import { EditorIcon } from "../../ui/EditorIcon";
import {
  characterControllerBackingIssue,
  createCharacterControllerPatch,
} from "../application/character-controller-authoring";
import "./character-controller-editor.css";

type CharacterControllerEditorProps = Readonly<{
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
}>;

/** Edits motor ownership while Collider/Rigidbody sections retain shape/body ownership. */
export function CharacterControllerEditor({ object, updateObject }: CharacterControllerEditorProps) {
  const component = object.characterController;
  if (!component) return null;
  const movement = normalizeCharacterMovement(component.movement);
  const capsules = object.colliders?.filter((collider) => collider.shape === "capsule") ?? [];
  const issue = characterControllerBackingIssue(object);
  const update = (patch: Partial<typeof component>) => updateObject(object.id, {
    characterController: { ...component, ...patch },
  });

  return (
    <div className="component-card character-controller-card">
      <div className="component-card__head">
        <span><SceneComponentIdentity componentId="characterController" /></span>
        <button
          className="icon-button danger"
          type="button"
          title="Remove Character Controller (keeps its Rigidbody and Collider)"
          onClick={() => updateObject(object.id, { characterController: undefined })}
        >
          <EditorIcon name="delete" size="control" />
        </button>
      </div>
      {issue && (
        <div className="character-controller-card__warning" role="status">
          <EditorIcon name="warning" size="compact" />
          <span>{issue}</span>
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => updateObject(object.id, createCharacterControllerPatch(object))}
          >Repair</button>
        </div>
      )}
      <InspectorRow label="Enabled">
        <InspectorToggle
          checked={component.enabled}
          ariaLabel="Enable Character Controller"
          onChange={(enabled) => update({ enabled })}
        />
      </InspectorRow>
      <InspectorRow label="Capsule">
        <select
          aria-label="Character Controller Capsule Collider"
          value={component.capsuleColliderId}
          onChange={(event) => update({ capsuleColliderId: event.currentTarget.value })}
        >
          {!capsules.some((collider) => collider.id === component.capsuleColliderId) && (
            <option value={component.capsuleColliderId}>Missing Capsule</option>
          )}
          {capsules.map((collider, index) => (
            <option key={collider.id} value={collider.id}>Capsule Collider {index + 1}</option>
          ))}
        </select>
      </InspectorRow>
      {([ ["skinWidth", "Skin Width", 0.001, 0.2], ["stepHeight", "Step Height", 0, 2], ["groundSnap", "Ground Snap", 0, 2], ["maxSlopeDegrees", "Max Slope (degrees)", 0, 89] ] as const).map(([key, label, min, max]) => (
        <InspectorRow key={key} label={label}>
          <input type="number" aria-label={`Character ${label}`} min={min} max={max} step={key === "maxSlopeDegrees" ? 1 : 0.01}
            value={movement[key]} onChange={(event) => update({ movement: normalizeCharacterMovement({ ...movement, [key]: event.currentTarget.valueAsNumber }) })} />
        </InspectorRow>
      ))}
      <p className="character-controller-card__note">
        Animation root motion and gameplay movement share this kinematic motor. Movement collides with static geometry; gameplay supplies gravity and jump displacement. Shape and body settings remain in the linked Collider and Rigidbody cards.
      </p>
    </div>
  );
}
