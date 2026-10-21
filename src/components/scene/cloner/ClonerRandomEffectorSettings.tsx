import type { CSSProperties } from "react";
import { TransactionalRangeInput } from "../../../history/TransactionalRangeInput";
import type { ClonerVectorKey } from "../../../scene/authoring/cloner-editor-operations";
import type { ClonerSettings, Vec3 } from "../../../types";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { VectorField } from "../../VectorField";

type Props = {
  cloner: ClonerSettings;
  patchVector: (key: ClonerVectorKey, axis: number, value: number) => void;
  patchUniform: (key: "jitterPosition" | "jitterRotation" | "jitterScale", value: number) => void;
};

export function ClonerRandomEffectorSettings({ cloner, patchVector, patchUniform }: Props) {
  return (
    <InspectorGroup
      id="cloner.randomEffector"
      title="Random Effector"
      meta={`seed ${cloner.seed}`}
      note="A per-clone random offset applied on top of the distribution. Drag the amount to spread all three axes at once, or set X/Y/Z individually."
    >
      <ClonerEffectorRow
        label="Position" values={cloner.jitterPosition} step={0.05} decimals={2} unit="m"
        sliderMin={0} sliderMax={5}
        onAxis={(axis, value) => patchVector("jitterPosition", axis, value)}
        onUniform={(value) => patchUniform("jitterPosition", value)}
      />
      <ClonerEffectorRow
        label="Rotation" values={cloner.jitterRotation} step={1} decimals={1} unit="deg"
        sliderMin={0} sliderMax={180}
        onAxis={(axis, value) => patchVector("jitterRotation", axis, value)}
        onUniform={(value) => patchUniform("jitterRotation", value)}
      />
      <ClonerEffectorRow
        label="Scale" values={cloner.jitterScale} min={0} step={0.01} decimals={2}
        sliderMin={0} sliderMax={2}
        onAxis={(axis, value) => patchVector("jitterScale", axis, value)}
        onUniform={(value) => patchUniform("jitterScale", value)}
      />
    </InspectorGroup>
  );
}

type ClonerEffectorRowProps = {
  label: string;
  values: Vec3;
  min?: number;
  step: number;
  decimals: number;
  unit?: string;
  sliderMin: number;
  sliderMax: number;
  onAxis: (axis: number, value: number) => void;
  onUniform: (value: number) => void;
};

function ClonerEffectorRow(props: ClonerEffectorRowProps) {
  const { label, values, min, step, decimals, unit, sliderMin, sliderMax, onAxis, onUniform } = props;
  const amount = Math.max(values[0], values[1], values[2]);
  const sliderTop = Math.max(sliderMax, amount);
  const fill = sliderTop === sliderMin ? 0 : ((amount - sliderMin) / (sliderTop - sliderMin)) * 100;
  const sliderStyle = { ["--slider-fill" as string]: `${fill}%` } as CSSProperties;
  return (
    <div className="cloner-effector-row">
      <div className="cloner-effector-row__head">
        <span className="cloner-effector-row__label">{label}</span>
        <span className="inspector-slider__slider cloner-effector-row__slider" style={sliderStyle}>
          <span className="inspector-slider__track" aria-hidden="true">
            <span className="inspector-slider__fill" />
          </span>
          <TransactionalRangeInput
            className="cloner-effector-row__range inspector-slider__range"
            min={sliderMin} max={sliderTop} step={step} value={amount}
            aria-label={`${label} amount`}
            onInput={(event) => onUniform(Number(event.currentTarget.value))}
          />
        </span>
        <div className="cloner-effector-row__amount">
          <InspectorNumberInput
            value={amount} min={min ?? sliderMin} step={step} decimals={decimals} unit={unit}
            ariaLabel={`${label} amount`}
            onChange={onUniform}
          />
        </div>
      </div>
      <VectorField
        values={values} min={min} step={step} decimals={decimals} unit={unit}
        ariaLabel={`Random ${label}`}
        onChange={onAxis}
      />
    </div>
  );
}
