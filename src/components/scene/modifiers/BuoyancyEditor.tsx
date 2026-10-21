import {
  patchBuoyancyPin,
  removeBuoyancyPin,
} from "../../../modifiers/authoring/buoyancy-pins";
import { createBuoyancyPin } from "../../../modifiers/registry";
import type {
  BuoyancyModifier,
  ModifierPinSelection,
  ObjectModifier,
  SceneObject,
} from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { EditorCheckbox } from "../../../ui/controls";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";
import { InspectorToggle } from "../../InspectorToggle";
import { BuoyancyPinEditor } from "./BuoyancyPinEditor";
import { SceneComponentIdentity } from "../SceneComponentPresentation";

type BuoyancyEditorProps = {
  modifier: BuoyancyModifier;
  objectId: string;
  selectedModifierPin: ModifierPinSelection | null;
  selectModifierPin: (selection: ModifierPinSelection | null) => void;
  waterObjects: SceneObject[];
  patchModifier: (modifier: ObjectModifier) => void;
  removeModifier: (modifierId: string) => void;
};

export function BuoyancyEditor({
  modifier,
  objectId,
  selectedModifierPin,
  selectModifierPin,
  waterObjects,
  patchModifier,
  removeModifier,
}: BuoyancyEditorProps) {
  const patch = (value: Partial<BuoyancyModifier>) => patchModifier({ ...modifier, ...value });
  const patchPin = (pinId: string, value: Partial<BuoyancyModifier["pins"][number]>) => {
    patch({ pins: patchBuoyancyPin(modifier.pins, pinId, value) });
  };
  const removePin = (pinId: string) => {
    if (
      selectedModifierPin?.objectId === objectId
      && selectedModifierPin.modifierId === modifier.id
      && selectedModifierPin.pinId === pinId
    ) {
      selectModifierPin(null);
    }
    patch({ pins: removeBuoyancyPin(modifier.pins, pinId) });
  };
  return (
    <div className="modifier-editor-card">
      <div className="modifier-editor-header">
        <span>
          <SceneComponentIdentity
            componentId="modifier:buoyancy"
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

      <InspectorRow label="Name">
        <input type="text" value={modifier.name} onChange={(event) => patch({ name: event.target.value })} />
      </InspectorRow>
      <InspectorRow label="Water">
        <select
          value={modifier.waterObjectId ?? ""}
          onChange={(event) => patch({ waterObjectId: event.target.value || undefined })}
        >
          <option value="">First visible water</option>
          {waterObjects.map((water) => (
            <option key={water.id} value={water.id}>{water.name || water.id}</option>
          ))}
        </select>
      </InspectorRow>

      <InspectorRow label="Waterline" muted={!modifier.enabled}>
        <InspectorSlider
          value={modifier.verticalOffset}
          min={-2} max={2} step={0.02} decimals={2} unit="m" ariaLabel="Waterline"
          disabled={!modifier.enabled}
          onChange={(value) => patch({ verticalOffset: value })}
        />
      </InspectorRow>
      <InspectorRow label="Damping" muted={!modifier.enabled}>
        <InspectorSlider
          value={modifier.damping}
          min={0} max={1} step={0.01} decimals={2} ariaLabel="Damping"
          disabled={!modifier.enabled}
          onChange={(value) => patch({ damping: value })}
        />
      </InspectorRow>
      <InspectorToggle
        checked={modifier.followTilt}
        disabled={!modifier.enabled}
        label={(
          <>
            <strong>Pitch / roll</strong>
            <span>Use pin height differences for object tilt</span>
          </>
        )}
        onChange={(checked) => patch({ followTilt: checked })}
      />
      <InspectorRow label="Tilt" muted={!modifier.enabled || !modifier.followTilt}>
        <InspectorSlider
          value={modifier.tiltStrength}
          min={0} max={1} step={0.01} decimals={2} ariaLabel="Tilt"
          disabled={!modifier.enabled || !modifier.followTilt}
          onChange={(value) => patch({ tiltStrength: value })}
        />
      </InspectorRow>
      <InspectorRow label="Max tilt" muted={!modifier.enabled || !modifier.followTilt}>
        <InspectorSlider
          value={modifier.maxTiltDeg}
          min={0} max={60} step={1} decimals={0} unit="°" ariaLabel="Max tilt"
          disabled={!modifier.enabled || !modifier.followTilt}
          onChange={(value) => patch({ maxTiltDeg: value })}
        />
      </InspectorRow>
      <InspectorToggle
        checked={modifier.showPinGizmos !== false}
        disabled={!modifier.enabled}
        label={(
          <>
            <strong>Show pin gizmos</strong>
            <span>Display buoyancy handles in the 3D viewport</span>
          </>
        )}
        onChange={(checked) => patch({ showPinGizmos: checked })}
      />
      <InspectorRow label="Gizmo scale" muted={!modifier.enabled || modifier.showPinGizmos === false}>
        <InspectorSlider
          value={modifier.pinGizmoScale ?? 1}
          min={0.25} max={3} step={0.05} decimals={2}
          ariaLabel="Gizmo scale"
          disabled={!modifier.enabled || modifier.showPinGizmos === false}
          onChange={(value) => patch({ pinGizmoScale: value })}
        />
      </InspectorRow>

      <div className="modifier-pins-heading">
        <span>Pins</span>
        <button
          className="ghost-button"
          type="button"
          onClick={() => patch({ pins: [...modifier.pins, createBuoyancyPin(modifier.pins.length)] })}
        >
          <EditorIcon name="add" size="control" /> Add
        </button>
      </div>
      <div className="modifier-pin-list">
        {modifier.pins.map((pin) => (
          <BuoyancyPinEditor
            key={pin.id}
            pin={pin}
            selected={
              selectedModifierPin?.objectId === objectId
              && selectedModifierPin.modifierId === modifier.id
              && selectedModifierPin.pinId === pin.id
            }
            selectPin={() => selectModifierPin({ objectId, modifierId: modifier.id, pinId: pin.id })}
            canRemove={modifier.pins.length > 1}
            patchPin={patchPin}
            removePin={removePin}
          />
        ))}
      </div>
    </div>
  );
}
