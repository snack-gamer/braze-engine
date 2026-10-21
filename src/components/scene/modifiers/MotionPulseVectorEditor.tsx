import { patchMotionPulseVectorAxis } from "../../../scene/authoring/motion-pulse-targets";
import type { MotionPulseAxisMode, Vec3 } from "../../../types";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";

type MotionPulseVectorEditorProps = {
  label: string;
  values: Vec3;
  axisMode: MotionPulseAxisMode;
  step: number;
  decimals: number;
  unit?: string;
  onChange: (values: Vec3) => void;
};

export function MotionPulseVectorEditor({
  label,
  values,
  axisMode,
  step,
  decimals,
  unit,
  onChange,
}: MotionPulseVectorEditorProps) {
  const labels = axisMode === "unified" ? ["All"] : ["X", "Y", "Z"];
  const axisValues = axisMode === "unified" ? [values[0]] : values;
  return (
    <div className="motion-pulse-vector">
      <div className="motion-pulse-vector__label">{label}</div>
      <div className={`motion-pulse-axis-grid ${axisMode === "unified" ? "unified" : ""}`}>
        {axisValues.map((value, axis) => (
          <InspectorRow key={labels[axis]} label={labels[axis]}>
            <InspectorNumberInput
              value={value}
              min={-20}
              max={20}
              step={step}
              decimals={decimals}
              unit={unit}
              ariaLabel={`${label} ${labels[axis]}`}
              onChange={(next) => onChange(patchMotionPulseVectorAxis(values, axis, next, axisMode))}
            />
          </InspectorRow>
        ))}
      </div>
    </div>
  );
}
