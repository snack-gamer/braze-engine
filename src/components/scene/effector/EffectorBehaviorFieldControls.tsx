import {
  EFFECTOR_SHAPE_OPTIONS,
  EFFECTOR_TYPE_OPTIONS,
} from "../../../lib/effector";
import {
  cloneEffectorFalloffPreset,
  EFFECTOR_FALLOFF_PRESETS,
  effectorFalloffPresetId,
  effectorShapeFields,
  type EffectorVectorKey,
} from "../../../scene/authoring/effector-editor-operations";
import type { EffectorSettings, EffectorType } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { VectorField } from "../../VectorField";

type Props = {
  effector: EffectorSettings;
  patch: (partial: Partial<EffectorSettings>) => void;
  patchVector: (key: EffectorVectorKey, axis: number, value: number) => void;
  setType: (type: EffectorType) => void;
};

export function EffectorBehaviorFieldControls({ effector, patch, patchVector, setType }: Props) {
  const { hasHeight, hasRadius } = effectorShapeFields(effector.shape);
  const falloffPreset = effectorFalloffPresetId(effector.falloff);

  return (
    <>
      <InspectorGroup id="effector.behavior" title="Behavior">
        <InspectorRow label="Type" className="is-full">
          <select value={effector.type} onChange={(event) => setType(event.target.value as EffectorType)}>
            {EFFECTOR_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </InspectorRow>
      </InspectorGroup>

      <InspectorGroup id="effector.field" title="Field">
        <InspectorGrid>
          <InspectorRow label="Shape">
            <select value={effector.shape} onChange={(event) => patch({ shape: event.target.value as EffectorSettings["shape"] })}>
              {EFFECTOR_SHAPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </InspectorRow>
          {hasRadius && (
            <InspectorRow label={effector.shape === "cone" ? "Base Radius" : "Radius"}>
              <InspectorNumberInput value={effector.radius} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Radius" onChange={(radius) => patch({ radius })} />
            </InspectorRow>
          )}
          {hasHeight && (
            <InspectorRow label="Height">
              <InspectorNumberInput value={effector.height} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Height" onChange={(height) => patch({ height })} />
            </InspectorRow>
          )}
          {effector.shape === "torus" && (
            <>
              <InspectorRow label="Major Radius">
                <InspectorNumberInput value={effector.torusMajorRadius} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Major radius" onChange={(torusMajorRadius) => patch({ torusMajorRadius })} />
              </InspectorRow>
              <InspectorRow label="Tube Radius">
                <InspectorNumberInput value={effector.torusMinorRadius} min={0} step={0.05} decimals={2} unit="m" ariaLabel="Tube radius" onChange={(torusMinorRadius) => patch({ torusMinorRadius })} />
              </InspectorRow>
            </>
          )}
          {effector.shape === "plane" && (
            <>
              <InspectorRow label="Plane Size">
                <InspectorNumberInput value={effector.planeSize[0]} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Plane width" onChange={(width) => patch({ planeSize: [width, effector.planeSize[1]] })} />
                <InspectorNumberInput value={effector.planeSize[1]} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Plane depth" onChange={(depth) => patch({ planeSize: [effector.planeSize[0], depth] })} />
              </InspectorRow>
              <InspectorRow label="Thickness">
                <InspectorNumberInput value={effector.planeThickness} min={0} step={0.05} decimals={2} unit="m" ariaLabel="Thickness" onChange={(planeThickness) => patch({ planeThickness })} />
              </InspectorRow>
            </>
          )}
          {effector.shape !== "infinite" && (
            <InspectorRow label="Falloff">
              <select
                value={falloffPreset}
                onChange={(event) => {
                  const falloff = cloneEffectorFalloffPreset(event.target.value);
                  if (falloff) patch({ falloff });
                }}
              >
                {EFFECTOR_FALLOFF_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
                {falloffPreset === "custom" && <option value="custom">Custom</option>}
              </select>
            </InspectorRow>
          )}
          <InspectorRow label="Strength">
            <InspectorNumberInput value={effector.strength} min={-2} max={2} step={0.05} decimals={2} ariaLabel="Strength" onChange={(strength) => patch({ strength })} />
          </InspectorRow>
          {effector.shape === "box" && (
            <InspectorRow label="Size" variant="vec">
              <VectorField values={effector.boxSize} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Box size" onChange={(axis, value) => patchVector("boxSize", axis, value)} />
            </InspectorRow>
          )}
        </InspectorGrid>
      </InspectorGroup>
    </>
  );
}
