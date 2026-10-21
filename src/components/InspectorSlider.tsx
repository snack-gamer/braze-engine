import { useId, type CSSProperties } from "react";
import { TransactionalRangeInput } from "../history/TransactionalRangeInput";
import { InspectorNumberInput } from "./InspectorNumberInput";

type InspectorSliderProps = {
  // Optional. Omit when the slider sits inside <InspectorRow label="...">
  // — the row already renders the label. Provide it only when the slider
  // is used standalone (legacy callers) and needs its own inline label.
  label?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  rangeMin?: number;
  rangeMax?: number;
  rangeStep?: number;
  onChange: (value: number) => void;
  decimals?: number;
  unit?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function InspectorSlider({
  label,
  value,
  min,
  max,
  step,
  rangeMin,
  rangeMax,
  rangeStep,
  onChange,
  decimals = 2,
  unit,
  ariaLabel,
  disabled = false,
}: InspectorSliderProps) {
  const id = useId();
  const effectiveRangeMin = rangeMin ?? min;
  const effectiveRangeMax = rangeMax ?? max;
  const effectiveRangeStep = rangeStep ?? step;
  const inputValue = clamp(value, min, max);
  const rangeValue = clamp(inputValue, effectiveRangeMin, effectiveRangeMax);
  const fill = effectiveRangeMax === effectiveRangeMin
    ? 0
    : ((rangeValue - effectiveRangeMin) / (effectiveRangeMax - effectiveRangeMin)) * 100;
  const sliderStyle = { "--slider-fill": `${fill}%` } as CSSProperties;

  const parseValue = (raw: string): number | null => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return clamp(parsed, effectiveRangeMin, effectiveRangeMax);
  };

  const updateRange = (raw: string) => {
    if (disabled) return;
    const next = parseValue(raw);
    if (next !== null && Math.abs(next - inputValue) > Number.EPSILON) {
      onChange(next);
    }
  };

  const effectiveAriaLabel = ariaLabel ?? label;
  const showLabel = label !== undefined;

  return (
    <div className={`inspector-slider ${showLabel ? "" : "inspector-slider--bare"}`}>
      {showLabel && (
        <span className="inspector-slider__top">
          <label className="inspector-slider__label" htmlFor={id}>
            {label}
          </label>
        </span>
      )}
      <div className="inspector-slider__control">
        <span className="inspector-slider__slider" style={sliderStyle}>
          <span className="inspector-slider__track" aria-hidden="true">
            <span className="inspector-slider__fill" />
          </span>
          <TransactionalRangeInput
            id={id}
            className="inspector-slider__range"
            min={effectiveRangeMin}
            max={effectiveRangeMax}
            step={effectiveRangeStep}
            value={rangeValue}
            aria-label={effectiveAriaLabel}
            disabled={disabled}
            onInput={(event) => updateRange(event.currentTarget.value)}
          />
        </span>
        <InspectorNumberInput
          value={inputValue}
          min={min}
          max={max}
          step={step}
          decimals={decimals}
          unit={unit}
          ariaLabel={effectiveAriaLabel}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
