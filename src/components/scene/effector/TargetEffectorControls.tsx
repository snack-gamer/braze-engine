import { EFFECTOR_AIM_AXIS_OPTIONS } from "../../../lib/effector";
import type { EffectorVectorKey } from "../../../scene/authoring/effector-editor-operations";
import type { EffectorSettings, SceneObject } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorToggle } from "../../InspectorToggle";
import { VectorField } from "../../VectorField";
import { ObjectDropField } from "../ObjectDropField";

type Props = {
  effector: EffectorSettings;
  targetCandidates: SceneObject[];
  patch: (partial: Partial<EffectorSettings>) => void;
  patchVector: (key: EffectorVectorKey, axis: number, value: number) => void;
};

export function TargetEffectorControls({ effector, targetCandidates, patch, patchVector }: Props) {
  if (effector.type !== "target") return null;

  return (
    <InspectorGroup id="effector.aim" title="Aim">
      <InspectorGrid>
        <InspectorRow label="Target" className="is-full">
          <ObjectDropField
            objects={targetCandidates}
            value={effector.targetObjectId}
            placeholder="Drop object (empty = effector)"
            className="cloner-input-drop"
            onAssign={(targetObjectId) => patch({ targetObjectId })}
          />
        </InspectorRow>
        <InspectorRow label="Aim Axis">
          <select value={effector.aimAxis} onChange={(event) => patch({ aimAxis: event.target.value as EffectorSettings["aimAxis"] })}>
            {EFFECTOR_AIM_AXIS_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </InspectorRow>
        <InspectorRow label="Use Pitch">
          <InspectorToggle checked={effector.usePitch} onChange={(usePitch) => patch({ usePitch })} ariaLabel="Use pitch" />
        </InspectorRow>
        <InspectorRow label="Up Vector">
          <select value={effector.upMode} onChange={(event) => patch({ upMode: event.target.value as EffectorSettings["upMode"] })}>
            <option value="world">World</option>
            <option value="effector">Effector</option>
            <option value="target">Target</option>
            <option value="custom">Custom</option>
          </select>
        </InspectorRow>
        {effector.upMode === "custom" && (
          <InspectorRow label="Custom Up" variant="vec">
            <VectorField values={effector.customUp} step={0.05} decimals={2} ariaLabel="Custom up" onChange={(axis, value) => patchVector("customUp", axis, value)} />
          </InspectorRow>
        )}
        <InspectorRow label="Repel">
          <InspectorToggle checked={effector.repel} onChange={(repel) => patch({ repel })} ariaLabel="Repel" />
        </InspectorRow>
      </InspectorGrid>

      {effector.repel && (
        <InspectorGroup id="effector.repel" title="Repel">
          <InspectorGrid>
            <InspectorRow label="Min Distance">
              <InspectorNumberInput value={effector.repelDistance} min={0} step={0.1} decimals={2} unit="m" ariaLabel="Repel distance" onChange={(repelDistance) => patch({ repelDistance })} />
            </InspectorRow>
            <InspectorRow label="Repel Strength">
              <InspectorNumberInput value={effector.repelStrength} min={0} step={0.05} decimals={2} ariaLabel="Repel strength" onChange={(repelStrength) => patch({ repelStrength })} />
            </InspectorRow>
          </InspectorGrid>
        </InspectorGroup>
      )}
    </InspectorGroup>
  );
}
