import { CameraLensControls, CameraEnvironmentControls } from "../../camera/components/CameraLensControls";
import { CameraCullingMask } from "../../camera/components/CameraCullingMask";
import { InspectorColor } from "../InspectorColor";
import { InspectorRow } from "../InspectorRow";
import { InspectorToggle } from "../InspectorToggle";
import { VectorField } from "../VectorField";
import { defaultCameraSettings } from "../../constants";
import type { CameraSettings, SceneObject, Vec3 } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { AddComponentButton } from "./AddComponentButton";
import { CameraDepthOfFieldSection } from "./CameraDepthOfFieldSection";
import { InspectorSection } from "./InspectorSection";
import { SceneObjectHeader } from "./SceneObjectHeader";
import { InspectorGroup } from "../InspectorGroup";
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
      <SceneObjectHeader object={cameraObject} updateObject={updateObject} />
      <EntityTagHeader object={cameraObject} objects={objects} onLayerChange={(layer) => updateObject(cameraObject.id, { layer })} onChange={(tags) => updateObject(cameraObject.id, { tags })} />
      <PrefabInstanceCard object={cameraObject} />

      <InspectorSection id="camera.transform" title="Transform" icon={<EditorIcon name="transformMove" size="control" />} defaultOpen>
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

      <InspectorSection id="camera.settings" title="Camera" icon={<EditorIcon name="objectCamera" size="control" />} defaultOpen
        onReset={() => patchSettings({ ...defaultCameraSettings, target: settings.target })}>
        <CameraLensControls settings={settings} onChange={patchSettings} />
        <InspectorGroup id="camera.rendering" title="Rendering">
          <InspectorRow label="Culling Mask"><CameraCullingMask value={settings.cullingMask ?? 0xffffffff} onChange={(cullingMask) => patchSettings({ cullingMask })} /></InspectorRow>
          <div className="inspector-actions">
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
                <EditorIcon name="status" size="status" filled /> Render camera
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
        </InspectorGroup>
        <CameraEnvironmentControls settings={settings} onChange={patchSettings} />
        <InspectorGroup id="camera.editor" title="Editor" defaultOpen={false}>
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

        </InspectorGroup>
      </InspectorSection>
      {hasDepthOfField && <CameraDepthOfFieldSection cameraObject={cameraObject} objects={objects} updateObject={updateObject} />}

      <BehaviorInspector object={cameraObject} objects={objects} updateObject={updateObject} />
      <AddComponentButton object={cameraObject} updateObject={updateObject} />
    </form>
  );
}
