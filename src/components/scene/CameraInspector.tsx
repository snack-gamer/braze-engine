import { InspectorColor } from "../InspectorColor";
import { InspectorNumberInput } from "../InspectorNumberInput";
import { InspectorRow } from "../InspectorRow";
import { InspectorSlider } from "../InspectorSlider";
import { InspectorToggle } from "../InspectorToggle";
import { VectorField } from "../VectorField";
import { defaultCameraSettings } from "../../constants";
import type { CameraSettings, SceneObject, Vec3 } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { AddComponentButton } from "./AddComponentButton";
import { CameraDepthOfFieldSection } from "./CameraDepthOfFieldSection";
import { InspectorSection } from "./InspectorSection";
import { PanelHeader } from "./PanelHeader";
import { PrefabInstanceCard } from "./PrefabInstanceCard";
import type { AnimatedTransformChannels } from "./SceneInspector";
import { EntityTagHeader } from "../../world/components/EntityTagHeader";
import { BehaviorInspector } from "../../behaviors/components/BehaviorInspector";

type Props = {
  cameraObject: SceneObject;
  objects: SceneObject[];
  animatedTransformChannels?: AnimatedTransformChannels;
  isActive: boolean;
  setActiveCamera: (id: string) => void;
  lookThroughCamera: (id: string) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

const COORD_LABELS: Array<{ key: "position" | "target"; label: string }> = [
  { key: "position", label: "Position" },
  { key: "target", label: "Target" },
];

export function CameraInspector(props: Props) {
  const {
    cameraObject,
    objects,
    animatedTransformChannels,
    isActive,
    setActiveCamera,
    lookThroughCamera,
    updateObject,
  } = props;
  const settings = cameraObject.camera ?? defaultCameraSettings;
  const rowColor = cameraObject.rowColor ?? cameraObject.color;
  const hasDepthOfField = Boolean(cameraObject.depthOfField);

  const patchSettings = (patch: Partial<CameraSettings>) => {
    updateObject(cameraObject.id, { camera: { ...settings, ...patch } });
  };

  const patchVec = (key: "position" | "target", index: number, value: number) => {
    if (key === "position") {
      const next = cameraObject.position.slice() as Vec3;
      next[index] = value;
      updateObject(cameraObject.id, { position: next });
    } else {
      const next = settings.target.slice() as Vec3;
      next[index] = value;
      patchSettings({ target: next });
    }
  };

  return (
    <form className="rail-scroll" autoComplete="off" data-form-type="other" onSubmit={(event) => event.preventDefault()}>
      <PanelHeader
        title={cameraObject.name || "(unnamed)"}
        tone="rendering"
        icon={<EditorIcon name="objectCamera" size="control" />}
        actions={(
          <>
            <button
              className={`icon-button ${cameraObject.visible ? "" : "active"}`}
              type="button"
              onClick={() => updateObject(cameraObject.id, { visible: !cameraObject.visible })}
              title={cameraObject.visible ? "Hide" : "Show"}
            >
              <EditorIcon name={cameraObject.visible ? "visible" : "hidden"} size="control" />
            </button>
            <button
              className={`icon-button ${cameraObject.locked ? "active" : ""}`}
              type="button"
              onClick={() => updateObject(cameraObject.id, { locked: !cameraObject.locked })}
              title={cameraObject.locked ? "Unlock" : "Lock"}
            >
              <EditorIcon name={cameraObject.locked ? "locked" : "unlocked"} size="control" />
            </button>
          </>
        )}
      />
      <EntityTagHeader object={cameraObject} objects={objects} onChange={(tags) => updateObject(cameraObject.id, { tags })} />
      {/* Unity-style single inspector: Transform first, then the camera's
          own component sections stacked in one scroll. */}

      <InspectorSection id="camera.transform" title="Transform" defaultOpen>
        {COORD_LABELS.map(({ key, label }) => {
          const values = key === "position" ? cameraObject.position : settings.target;
          const animatedAxes = key === "position" ? animatedTransformChannels?.position : undefined;
          const anyAnimated = animatedAxes ? animatedAxes.some(Boolean) : false;
          return (
            <InspectorRow
              key={key}
              variant="vec"
              label={label}
              keyState={anyAnimated ? "animated" : "none"}
            >
              <VectorField
                values={values}
                animatedAxes={animatedAxes}
                step={0.1}
                decimals={2}
                ariaLabel={label}
                onChange={(axis, next) => patchVec(key, axis, next)}
              />
            </InspectorRow>
          );
        })}
      </InspectorSection>

      <InspectorSection id="camera.lens" title="Lens" icon={<EditorIcon name="focus" size="control" />} defaultOpen>
        <InspectorRow label="FOV">
          <InspectorSlider
            value={settings.fov}
            min={18}
            max={95}
            step={1}
            decimals={0}
            unit="°"
            ariaLabel="FOV"
            onChange={(value) => patchSettings({ fov: value })}
          />
        </InspectorRow>
        <InspectorRow label="Near">
          <InspectorNumberInput
            min={0.001}
            step={0.01}
            decimals={3}
            value={settings.near}
            ariaLabel="Near"
            onChange={(value) => patchSettings({ near: Math.max(0.001, value) })}
          />
        </InspectorRow>
        <InspectorRow label="Far">
          <InspectorNumberInput
            min={1}
            step={1}
            decimals={0}
            value={settings.far}
            ariaLabel="Far"
            onChange={(value) => patchSettings({ far: Math.max(1, value) })}
          />
        </InspectorRow>
      </InspectorSection>

      {hasDepthOfField && (
        <CameraDepthOfFieldSection cameraObject={cameraObject} objects={objects} updateObject={updateObject} />
      )}

      <InspectorSection id="camera.identity" title="Camera" icon={<EditorIcon name="object" size="control" />}>
        <InspectorRow label="Name">
          <input
            type="text"
            value={cameraObject.name}
            autoComplete="off"
            data-form-type="other"
            onChange={(event) => updateObject(cameraObject.id, { name: event.target.value })}
          />
        </InspectorRow>
        <InspectorRow
          label="Row tint"
          actions={(
            <InspectorToggle
              checked={Boolean(cameraObject.rowColorEnabled)}
              ariaLabel="Enable hierarchy row tint"
              onChange={(checked) =>
                updateObject(cameraObject.id, {
                  rowColorEnabled: checked,
                  rowColor: checked ? rowColor : cameraObject.rowColor,
                })
              }
            />
          )}
        >
          <InspectorColor
            value={rowColor}
            disabled={!cameraObject.rowColorEnabled}
            ariaLabel="Hierarchy row tint color"
            onChange={(color) =>
              updateObject(cameraObject.id, { rowColor: color, rowColorEnabled: true })
            }
          />
        </InspectorRow>

        <div className="camera-action-row">
          <button
            type="button"
            className="ghost-button"
            onClick={() => lookThroughCamera(cameraObject.id)}
            title="Snap the editor view to this camera"
          >
            <EditorIcon name="cameraView" size="control" /> Look through
          </button>
          {isActive ? (
            <span className="rail-meta active-pill" title="Final renders use this camera">
              ● Render camera
            </span>
          ) : (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setActiveCamera(cameraObject.id)}
              title="Make this the camera that final renders use"
            >
              Set as render camera
            </button>
          )}
        </div>
        <PrefabInstanceCard object={cameraObject} />
      </InspectorSection>

      <BehaviorInspector object={cameraObject} objects={objects} updateObject={updateObject} />
      <AddComponentButton object={cameraObject} updateObject={updateObject} />
    </form>
  );
}
