import { defaultDepthOfFieldComponent } from "../../constants";
import { autoDepthOfFieldValues } from "../../lib/depth-of-field";
import { cameraStateForObject, objectFocusBounds } from "../../lib/hierarchy";
import type { DepthOfFieldComponent, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorRow } from "../InspectorRow";
import { InspectorSlider } from "../InspectorSlider";
import { InspectorToggle } from "../InspectorToggle";
import { InspectorSection } from "./InspectorSection";
import { ObjectDropField } from "./ObjectDropField";
import { SceneComponentIdentity } from "./SceneComponentPresentation";

type Props = {
  cameraObject: SceneObject;
  objects: SceneObject[];
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function CameraDepthOfFieldSection({ cameraObject, objects, updateObject }: Props) {
  const depthOfField = cameraObject.depthOfField ?? defaultDepthOfFieldComponent;
  const hasDepthOfField = Boolean(cameraObject.depthOfField);

  const focusTargets = objects.filter((object) => object.id !== cameraObject.id && object.primitive !== "camera");
  const camera = cameraStateForObject(objects, cameraObject) ?? {
    position: cameraObject.position,
    target: cameraObject.camera?.target ?? [0, 0, 0],
    fov: cameraObject.camera?.fov ?? 52,
  };
  const patchDepthOfField = (patch: Partial<DepthOfFieldComponent>) => {
    updateObject(cameraObject.id, {
      depthOfField: { ...defaultDepthOfFieldComponent, ...depthOfField, ...patch },
    });
  };

  const autoValues = (nextDepthOfField: DepthOfFieldComponent) => {
    const targetFocus = nextDepthOfField.targetObjectId ? objectFocusBounds(objects, nextDepthOfField.targetObjectId) : null;
    return targetFocus ? autoDepthOfFieldValues(camera, targetFocus, nextDepthOfField) : {};
  };

  const patchAutoDepthOfField = (patch: Partial<DepthOfFieldComponent>) => {
    const nextDepthOfField = { ...defaultDepthOfFieldComponent, ...depthOfField, ...patch };
    patchDepthOfField({
      ...patch,
      ...autoValues(nextDepthOfField),
    });
  };

  const assignFocusTarget = (objectId: string) => {
    const target = focusTargets.find((object) => object.id === objectId);
    const targetFocus = target ? objectFocusBounds(objects, target.id) : null;
    const nextDepthOfField = { ...defaultDepthOfFieldComponent, ...depthOfField, mode: "auto" as const, targetObjectId: target?.id };
    patchDepthOfField({
      mode: "auto",
      targetObjectId: target?.id,
      ...(targetFocus ? autoDepthOfFieldValues(camera, targetFocus, nextDepthOfField) : {}),
    });
  };

  const setMode = (mode: DepthOfFieldComponent["mode"]) => {
    const targetFocus = depthOfField.targetObjectId ? objectFocusBounds(objects, depthOfField.targetObjectId) : null;
    const nextDepthOfField = { ...defaultDepthOfFieldComponent, ...depthOfField, mode };
    patchDepthOfField({
      mode,
      ...(targetFocus ? autoDepthOfFieldValues(camera, targetFocus, nextDepthOfField) : {}),
    });
  };

  if (!hasDepthOfField) return null;

  const blurOn = depthOfField.enabled !== false;

  return (
    <InspectorSection id="camera.components" title="Components" meta="1" defaultOpen>
      <div className="component-card">
        <div className="component-card__head">
          <span>
            <SceneComponentIdentity componentId="depthOfField" />
          </span>
          <button
            className="icon-button danger"
            type="button"
            title="Remove component"
            onClick={() => updateObject(cameraObject.id, { depthOfField: undefined })}
          >
            <EditorIcon name="delete" size="control" />
          </button>
        </div>
        <InspectorToggle
          checked={blurOn}
          label={(
            <>
              <strong>Enable blur</strong>
              <span>Use aperture blur for this camera.</span>
            </>
          )}
          onChange={(checked) => patchDepthOfField({ enabled: checked })}
        />
        <div
          className={`editor-segmented dof-mode-tabs ${blurOn ? "" : "is-muted"}`}
          role="tablist"
          aria-label="Depth of field mode"
        >
          <button
            type="button"
            className={depthOfField.mode === "manual" ? "active" : ""}
            role="tab"
            aria-selected={depthOfField.mode === "manual"}
            disabled={!blurOn}
            onClick={() => setMode("manual")}
          >
            Manual
          </button>
          <button
            type="button"
            className={depthOfField.mode === "auto" ? "active" : ""}
            role="tab"
            aria-selected={depthOfField.mode === "auto"}
            disabled={!blurOn}
            onClick={() => setMode("auto")}
          >
            Auto
          </button>
        </div>
        {depthOfField.mode === "manual" ? (
          <>
            <InspectorRow label="Focus dist" muted={!blurOn}>
              <InspectorSlider
                value={depthOfField.focusDistance}
                min={0.1}
                max={20}
                step={0.05}
                unit="u"
                disabled={!blurOn}
                ariaLabel="Focus distance"
                onChange={(value) => patchDepthOfField({ focusDistance: value })}
              />
            </InspectorRow>
            <InspectorRow label="f-stop" muted={!blurOn}>
              <InspectorSlider
                value={depthOfField.fStop}
                min={0.7}
                max={16}
                step={0.1}
                decimals={1}
                disabled={!blurOn}
                ariaLabel="f-stop"
                onChange={(value) => patchDepthOfField({ fStop: value })}
              />
            </InspectorRow>
          </>
        ) : (
          <>
            <InspectorRow label="Target" muted={!blurOn}>
              <ObjectDropField
                objects={focusTargets}
                value={depthOfField.targetObjectId}
                placeholder="Drop hierarchy object"
                className="dof-target-drop"
                onAssign={assignFocusTarget}
              />
            </InspectorRow>
            <InspectorRow label="Focus width" muted={!blurOn}>
              <InspectorSlider
                value={depthOfField.autoFocusWidth}
                min={0.25}
                max={3}
                step={0.05}
                decimals={2}
                unit="x"
                disabled={!blurOn}
                ariaLabel="Focus width"
                onChange={(value) => patchAutoDepthOfField({ autoFocusWidth: value })}
              />
            </InspectorRow>
            <InspectorRow label="Blur" muted={!blurOn}>
              <InspectorSlider
                value={depthOfField.autoBlurStrength}
                min={0.2}
                max={2.5}
                step={0.05}
                decimals={2}
                unit="x"
                disabled={!blurOn}
                ariaLabel="Blur strength"
                onChange={(value) => patchAutoDepthOfField({ autoBlurStrength: value })}
              />
            </InspectorRow>
          </>
        )}
      </div>
    </InspectorSection>
  );
}
