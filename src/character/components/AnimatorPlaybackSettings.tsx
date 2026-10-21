import { InspectorRow } from "../../components/InspectorRow";
import { InspectorToggle } from "../../components/InspectorToggle";
import type { AnimatorComponent, RootMotionPolicy } from "../domain/animator-component";

type AnimatorPlaybackSettingsProps = Readonly<{
  component: AnimatorComponent;
  update: (component: AnimatorComponent) => void;
}>;

type SelectRowProps = Readonly<{
  label: string;
  ariaLabel: string;
  value: string;
  options: readonly (readonly [value: string, label: string])[];
  onChange: (value: string) => void;
}>;

const UPDATE_MODES = [
  ["normal", "Normal"],
  ["unscaledTime", "Unscaled Time (1× Clock)"],
  ["fixedStep", "Fixed Step"],
] as const;
const CULLING_MODES = [
  ["basedOnRenderVisibility", "Based on Visibility"],
  ["alwaysAnimate", "Always Animate"],
] as const;
const ROOT_MOTION_MODES = [
  ["disabled", "Disabled"],
  ["applyToObject", "Apply to Object"],
  ["extractOnly", "Extract Only"],
] as const;
const ROOT_MOTION_SOURCES = [
  ["clip", "Clip Metadata"],
  ["rootBone", "Motion Root Bone"],
  ["hips", "Humanoid Hips"],
] as const;
const ROOT_MOTION_ROTATIONS = [
  ["none", "None"],
  ["yaw", "Yaw"],
  ["full", "Full Rotation"],
] as const;

function SelectRow({ label, ariaLabel, value, options, onChange }: SelectRowProps) {
  return (
    <InspectorRow label={label}>
      <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </InspectorRow>
  );
}

/** Inspector controls for controller cadence, culling, and root-motion policy. */
export function AnimatorPlaybackSettings({ component, update }: AnimatorPlaybackSettingsProps) {
  const patch = (next: Partial<AnimatorComponent>) => update({ ...component, ...next });
  const patchRootMotion = (next: Partial<RootMotionPolicy>) => patch({
    rootMotion: { ...component.rootMotion, ...next },
  });
  const patchTranslationAxis = (axis: "x" | "y" | "z") => patchRootMotion({
    translationAxes: {
      ...component.rootMotion.translationAxes,
      [axis]: !component.rootMotion.translationAxes[axis],
    },
  });
  const rootMotionActive = component.rootMotion.mode !== "disabled";
  return (
    <>
      <SelectRow
        label="Update Mode"
        ariaLabel="Animator update mode"
        value={component.updateMode}
        options={UPDATE_MODES}
        onChange={(updateMode) => patch({ updateMode: updateMode as AnimatorComponent["updateMode"] })}
      />
      <SelectRow
        label="Culling"
        ariaLabel="Animator culling mode"
        value={component.cullingMode}
        options={CULLING_MODES}
        onChange={(cullingMode) => patch({ cullingMode: cullingMode as AnimatorComponent["cullingMode"] })}
      />
      <SelectRow
        label="Root Motion"
        ariaLabel="Root motion policy"
        value={component.rootMotion.mode}
        options={ROOT_MOTION_MODES}
        onChange={(mode) => patchRootMotion({ mode: mode as RootMotionPolicy["mode"] })}
      />
      {rootMotionActive && (
        <div className="animator-root-motion-settings">
          <SelectRow
            label="Motion Source"
            ariaLabel="Root motion source"
            value={component.rootMotion.source}
            options={ROOT_MOTION_SOURCES}
            onChange={(source) => patchRootMotion({ source: source as RootMotionPolicy["source"] })}
          />
          <InspectorRow label="Translation">
            <div className="animator-axis-controls" role="group" aria-label="Root motion translation axes">
              {(["x", "y", "z"] as const).map((axis) => (
                <button
                  key={axis}
                  type="button"
                  aria-pressed={component.rootMotion.translationAxes[axis]}
                  onClick={() => patchTranslationAxis(axis)}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>
          </InspectorRow>
          <SelectRow
            label="Rotation"
            ariaLabel="Root motion rotation"
            value={component.rootMotion.rotation}
            options={ROOT_MOTION_ROTATIONS}
            onChange={(rotation) => patchRootMotion({ rotation: rotation as RootMotionPolicy["rotation"] })}
          />
          <InspectorRow label="Bake into Pose">
            <InspectorToggle
              checked={component.rootMotion.bakeIntoPose}
              ariaLabel="Bake extracted root motion into pose"
              onChange={(bakeIntoPose) => patchRootMotion({ bakeIntoPose })}
            />
          </InspectorRow>
        </div>
      )}
    </>
  );
}
