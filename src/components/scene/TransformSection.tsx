import { useState } from "react";
import { clampScaleValue, MIN_AUTHORED_SCALE } from "../../scene/domain/transform-values";
import type { SceneObject, Vec3 } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorRow } from "../InspectorRow";
import { VectorField } from "../VectorField";
import { InspectorSection } from "./InspectorSection";

export type AnimatedTransformChannels = Partial<Record<"position" | "rotation" | "scale", boolean[]>>;

function resetVec(kind: "position" | "rotation" | "scale"): Vec3 {
  return kind === "scale" ? [1, 1, 1] : [0, 0, 0];
}

type TransformSectionProps = {
  object: SceneObject;
  animatedChannels?: AnimatedTransformChannels;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function TransformSection({ object, animatedChannels, updateObject }: TransformSectionProps) {
  const [uniformScale, setUniformScale] = useState(true);
  const patchVec = (kind: "position" | "rotation" | "scale", axis: number, value: number) => {
    if (kind === "scale") {
      const nextValue = clampScaleValue(value);
      if (uniformScale) {
        const base = clampScaleValue(object.scale[axis]);
        const ratio = nextValue / base;
        updateObject(object.id, { scale: object.scale.map((item) => clampScaleValue(item * ratio)) as Vec3 });
      } else {
        const next = [...object.scale] as Vec3;
        next[axis] = nextValue;
        updateObject(object.id, { scale: next });
      }
      return;
    }
    const next = [...object[kind]] as Vec3;
    next[axis] = Number.isFinite(value) ? value : 0;
    updateObject(object.id, { [kind]: next });
  };

  const reset = (kind: "position" | "rotation" | "scale") => {
    updateObject(object.id, { [kind]: resetVec(kind) });
  };

  return (
    <InspectorSection
      className="tone-transform"
      id="object.transform"
      title="Transform"
      defaultOpen
      actions={(
        <button
          className={`icon-button ${uniformScale ? "active" : ""}`}
          type="button"
          onClick={() => setUniformScale((value) => !value)}
          title={uniformScale ? "Uniform scale on" : "Uniform scale off"}
        >
          <EditorIcon name="objectLink" size="control" />
        </button>
      )}
    >
      <TransformVecRow
        label="Position"
        values={object.position}
        animatedAxes={animatedChannels?.position}
        step={0.1}
        decimals={3}
        onChange={(axis, value) => patchVec("position", axis, value)}
        onReset={() => reset("position")}
      />
      <TransformVecRow
        label="Rotation"
        values={object.rotation}
        animatedAxes={animatedChannels?.rotation}
        step={1}
        decimals={2}
        unit="°"
        onChange={(axis, value) => patchVec("rotation", axis, value)}
        onReset={() => reset("rotation")}
      />
      <TransformVecRow
        label="Scale"
        values={object.scale.map(clampScaleValue) as Vec3}
        animatedAxes={animatedChannels?.scale}
        min={MIN_AUTHORED_SCALE}
        step={0.01}
        decimals={3}
        onChange={(axis, value) => patchVec("scale", axis, value)}
        onReset={() => reset("scale")}
      />
    </InspectorSection>
  );
}

type TransformVecRowProps = {
  label: string;
  values: Vec3;
  animatedAxes?: boolean[];
  min?: number;
  step: number;
  decimals: number;
  unit?: string;
  onChange: (axis: number, value: number) => void;
  onReset: () => void;
};

function TransformVecRow(props: TransformVecRowProps) {
  const { label, values, animatedAxes, min, step, decimals, unit, onChange, onReset } = props;
  const anyAnimated = animatedAxes ? animatedAxes.some(Boolean) : false;
  return (
    <InspectorRow
      variant="inline"
      label={label}
      keyState={anyAnimated ? "animated" : "none"}
      actions={(
        <button
          className="transform-row__reset"
          type="button"
          onClick={onReset}
          title={`Reset ${label.toLowerCase()}`}
          aria-label={`Reset ${label.toLowerCase()}`}
        >
          <EditorIcon name="reset" size="compact" />
        </button>
      )}
      className="transform-row"
    >
      <VectorField
        values={values}
        animatedAxes={animatedAxes}
        min={min}
        step={step}
        decimals={decimals}
        unit={unit}
        ariaLabel={label}
        onChange={onChange}
      />
    </InspectorRow>
  );
}
