import type { Vec3 } from "../types";
import { useScrub } from "../hooks/useScrub";
import { InspectorNumberInput } from "./InspectorNumberInput";

const AXES = ["X", "Y", "Z"] as const;

type VectorFieldProps = {
  values: Vec3;
  onChange: (axis: number, value: number) => void;
  step: number;
  decimals: number;
  min?: number;
  unit?: string;
  ariaLabel: string;
  animatedAxes?: boolean[];
  showAxisLetters?: boolean;
  disabled?: boolean;
};

type AxisCellProps = {
  index: number;
  value: number;
  onChange: (axis: number, value: number) => void;
  step: number;
  decimals: number;
  min?: number;
  unit?: string;
  ariaLabel: string;
  showAxisLetters: boolean;
  animated: boolean;
  disabled: boolean;
};

function AxisCell({
  index,
  value,
  onChange,
  step,
  decimals,
  min,
  unit,
  ariaLabel,
  showAxisLetters,
  animated,
  disabled,
}: AxisCellProps) {
  const handleChange = (next: number) => {
    if (!disabled) onChange(index, next);
  };
  const { isScrubbing, scrubProps } = useScrub({
    value,
    onChange: handleChange,
    step,
    min,
    decimals,
  });
  const axis = AXES[index];
  return (
    <label
      data-axis={axis.toLowerCase()}
      className={`inspector-vec__cell${animated ? " is-animated" : ""}${showAxisLetters ? "" : " no-letter"}${disabled ? " is-disabled" : ""}`}
    >
      {showAxisLetters && (
        <span
          className={`inspector-vec__letter ${isScrubbing ? "is-scrubbing" : ""}`}
          title={`Drag to scrub ${axis}`}
          {...(disabled ? {} : scrubProps)}
        >
          {axis}
        </span>
      )}
      {animated && (
        <span className="inspector-vec__badge" title="Animated value">
          &lt;&gt;
        </span>
      )}
      <InspectorNumberInput
        min={min}
        step={step}
        decimals={decimals}
        unit={unit}
        value={value}
        ariaLabel={`${ariaLabel} ${axis}`}
        disabled={disabled}
        onChange={handleChange}
      />
    </label>
  );
}

export function VectorField({
  values,
  onChange,
  step,
  decimals,
  min,
  unit,
  ariaLabel,
  animatedAxes,
  showAxisLetters = true,
  disabled = false,
}: VectorFieldProps) {
  return (
    <div className="inspector-vec">
      {values.map((value, index) => (
        <AxisCell
          key={AXES[index]}
          index={index}
          value={value}
          onChange={onChange}
          step={step}
          decimals={decimals}
          min={min}
          unit={unit}
          ariaLabel={ariaLabel}
          showAxisLetters={showAxisLetters}
          animated={!!animatedAxes?.[index]}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
