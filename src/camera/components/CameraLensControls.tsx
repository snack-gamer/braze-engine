import type { CameraSettings } from "../../scene/domain/camera";
import { InspectorGroup } from "../../components/InspectorGroup";
import { InspectorRow } from "../../components/InspectorRow";
import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import { InspectorSlider } from "../../components/InspectorSlider";
import { InspectorColor } from "../../components/InspectorColor";
import { DEFAULT_CAMERA_SETTINGS } from "../domain/camera-settings";

type Props = { settings: CameraSettings; onChange: (patch: Partial<CameraSettings>) => void };
export function CameraLensControls({ settings, onChange }: Props) {
  const camera = { ...DEFAULT_CAMERA_SETTINGS, ...settings };
  return <InspectorGroup id="camera.projection" title="Projection">
    <InspectorRow label="Projection"><select className="editor-select" aria-label="Camera projection" value={camera.projection}
      onChange={(event) => onChange({ projection: event.currentTarget.value as CameraSettings["projection"] })}>
      <option value="perspective">Perspective</option><option value="orthographic">Orthographic</option>
    </select></InspectorRow>
    {camera.projection === "perspective" ? <>
      <InspectorRow label="FOV Axis"><select className="editor-select" aria-label="Field of View axis" value={camera.fovAxis}
        onChange={(event) => onChange({ fovAxis: event.currentTarget.value as CameraSettings["fovAxis"] })}>
        <option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>
      </select></InspectorRow>
      <InspectorRow label="Field of View"><InspectorSlider value={camera.fov} min={1} max={179} step={1} decimals={0} unit="°"
        ariaLabel="Field of View" onChange={(fov) => onChange({ fov })} /></InspectorRow>
    </> : <InspectorRow label="Size"><InspectorNumberInput value={camera.orthographicSize} min={0.001} max={1e6} step={0.1} decimals={3}
      ariaLabel="Orthographic size" onChange={(orthographicSize) => onChange({ orthographicSize: Math.max(0.001, orthographicSize) })} /></InspectorRow>}
    <InspectorRow label="Near Clip"><InspectorNumberInput value={camera.near} min={0.001} max={Math.min(1e6, camera.far - 0.001)} step={0.01} decimals={3}
      ariaLabel="Near clipping plane" onChange={(near) => onChange({ near: Math.min(1e6, camera.far - 0.001, Math.max(0.001, near)) })} /></InspectorRow>
    <InspectorRow label="Far Clip"><InspectorNumberInput value={camera.far} min={camera.near + 0.001} max={1e7} step={1} decimals={3}
      ariaLabel="Far clipping plane" onChange={(far) => onChange({ far: Math.min(1e7, Math.max(camera.near + 0.001, far)) })} /></InspectorRow>
  </InspectorGroup>;
}
export function CameraEnvironmentControls({ settings, onChange }: Props) {
  return <InspectorGroup id="camera.environment" title="Environment">
    <InspectorRow label="Background"><select className="editor-select" aria-label="Camera background" value={settings.background ?? "environment"}
      onChange={(event) => onChange({ background: event.currentTarget.value as CameraSettings["background"] })}>
      <option value="environment">Environment</option><option value="solid">Solid Color</option>
    </select></InspectorRow>
    {settings.background === "solid" && <InspectorRow label="Color"><InspectorColor value={settings.backgroundColor ?? DEFAULT_CAMERA_SETTINGS.backgroundColor}
      ariaLabel="Camera background color" onChange={(backgroundColor) => onChange({ backgroundColor })} /></InspectorRow>}
  </InspectorGroup>;
}
