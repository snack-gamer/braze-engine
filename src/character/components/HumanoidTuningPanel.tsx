import { memo } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { EditorControlGroup, EditorPropertyRow, EditorSlider, EditorToggle } from "../../ui";
import {
  DEFAULT_HUMANOID_POSE_TUNING,
  type HumanoidPoseTuning,
} from "../domain/humanoid-avatar";
import "./HumanoidTuningPanel.css";

type HumanoidTuningPanelProps = Readonly<{
  tuning: HumanoidPoseTuning;
  onChange: (tuning: HumanoidPoseTuning) => void;
  onResetPose: () => void;
}>;

export const HumanoidTuningPanel = memo(function HumanoidTuningPanel({
  tuning,
  onChange,
  onResetPose,
}: HumanoidTuningPanelProps) {
  const patch = (value: Partial<HumanoidPoseTuning>) => onChange({ ...tuning, ...value });
  const defaults = sameTuning(tuning, DEFAULT_HUMANOID_POSE_TUNING);
  return (
    <section className="avatar-configurator__card humanoid-tuning" aria-labelledby="humanoid-tuning-title">
      <header>
        <span>
          <strong id="humanoid-tuning-title">Muscles &amp; Settings</strong>
          <small>Retargeting</small>
        </span>
        <span className="humanoid-tuning__actions">
          <button type="button" className="ghost-button compact" onClick={onResetPose} title="Reset preview to the imported pose">
            <EditorIcon name="reset" size="compact" /> Pose
          </button>
          <button
            type="button"
            className="ghost-button compact"
            disabled={defaults}
            onClick={() => onChange({ ...DEFAULT_HUMANOID_POSE_TUNING })}
          >
            Defaults
          </button>
        </span>
      </header>
      <p className="humanoid-tuning__intro">
        Tune how retargeted animation adapts to this character. Values are stored with the imported Avatar and used by runtime retargeting.
      </p>
      <EditorControlGroup
        id="avatar.tuning.stretch"
        title="Limb Stretch"
        note="Allows small bone-length differences between source and target characters. Lower values preserve this model's proportions."
      >
        <EditorPropertyRow label="Arm Stretch">
          <EditorSlider
            value={tuning.armStretch}
            min={0}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="Arm stretch"
            onChange={(armStretch) => patch({ armStretch })}
          />
        </EditorPropertyRow>
        <EditorPropertyRow label="Leg Stretch">
          <EditorSlider
            value={tuning.legStretch}
            min={0}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="Leg stretch"
            onChange={(legStretch) => patch({ legStretch })}
          />
        </EditorPropertyRow>
      </EditorControlGroup>
      <EditorControlGroup
        id="avatar.tuning.twist"
        title="Twist Distribution"
        note="Controls how much twist is carried by each limb segment during Humanoid retargeting."
      >
        <EditorPropertyRow label="Upper Arm">
          <EditorSlider value={tuning.upperArmTwist} min={0} max={1} step={0.01} decimals={2} ariaLabel="Upper arm twist" onChange={(upperArmTwist) => patch({ upperArmTwist })} />
        </EditorPropertyRow>
        <EditorPropertyRow label="Lower Arm">
          <EditorSlider value={tuning.lowerArmTwist} min={0} max={1} step={0.01} decimals={2} ariaLabel="Lower arm twist" onChange={(lowerArmTwist) => patch({ lowerArmTwist })} />
        </EditorPropertyRow>
        <EditorPropertyRow label="Upper Leg">
          <EditorSlider value={tuning.upperLegTwist} min={0} max={1} step={0.01} decimals={2} ariaLabel="Upper leg twist" onChange={(upperLegTwist) => patch({ upperLegTwist })} />
        </EditorPropertyRow>
        <EditorPropertyRow label="Lower Leg">
          <EditorSlider value={tuning.lowerLegTwist} min={0} max={1} step={0.01} decimals={2} ariaLabel="Lower leg twist" onChange={(lowerLegTwist) => patch({ lowerLegTwist })} />
        </EditorPropertyRow>
      </EditorControlGroup>
      <EditorControlGroup
        id="avatar.tuning.motion"
        title="Motion"
        note="Feet spacing offsets the retargeted stance. Translation DoF permits mapped bones to receive translation as well as rotation."
      >
        <EditorPropertyRow label="Feet Spacing">
          <EditorSlider
            value={tuning.feetSpacing}
            min={-1}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="Feet spacing"
            onChange={(feetSpacing) => patch({ feetSpacing })}
          />
        </EditorPropertyRow>
        <EditorPropertyRow label="Translation DoF">
          <EditorToggle
            checked={tuning.hasTranslationDof}
            ariaLabel="Translation degrees of freedom"
            onChange={(hasTranslationDof) => patch({ hasTranslationDof })}
          />
        </EditorPropertyRow>
      </EditorControlGroup>
    </section>
  );
});

function sameTuning(left: HumanoidPoseTuning, right: HumanoidPoseTuning): boolean {
  return Object.keys(left).every((key) => (
    left[key as keyof HumanoidPoseTuning] === right[key as keyof HumanoidPoseTuning]
  ));
}
