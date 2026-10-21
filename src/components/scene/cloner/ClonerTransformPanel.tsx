import type { ClonerVectorKey } from "../../../scene/authoring/cloner-editor-operations";
import type { ClonerSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { VectorField } from "../../VectorField";

const MIN_SCALE = 0.001;

type Props = {
  cloner: ClonerSettings;
  patchCloner: (patch: Partial<ClonerSettings>) => void;
  patchVector: (key: ClonerVectorKey, axis: number, value: number) => void;
};

export function ClonerTransformPanel({ cloner, patchCloner, patchVector }: Props) {
  return (
    <div className="cloner-panel">
      <InspectorGroup id="cloner.cloneTransform" title="Per-Clone Transform">
        <InspectorRow label="Position" variant="vec">
          <VectorField values={cloner.clonePosition} step={0.05} decimals={2} unit="m" ariaLabel="Position" onChange={(axis, value) => patchVector("clonePosition", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Rotation" variant="vec">
          <VectorField values={cloner.cloneRotation} step={1} decimals={1} unit="deg" ariaLabel="Rotation" onChange={(axis, value) => patchVector("cloneRotation", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Scale" variant="vec">
          <VectorField values={cloner.cloneScale} min={MIN_SCALE} step={0.01} decimals={2} ariaLabel="Scale" onChange={(axis, value) => patchVector("cloneScale", axis, value)} />
        </InspectorRow>
      </InspectorGroup>
      <InspectorGroup id="cloner.alignment" title="Alignment">
        <InspectorGrid>
          <InspectorRow label="Align">
            <select value={cloner.alignment} onChange={(event) => patchCloner({ alignment: event.target.value as ClonerSettings["alignment"] })}>
              <option value="default">Default</option>
              <option value="none">None</option>
              <option value="path">Path</option>
              <option value="outward">Outward</option>
              <option value="inward">Inward</option>
            </select>
          </InspectorRow>
          <InspectorRow label="Axis">
            <select value={cloner.alignmentAxis} onChange={(event) => patchCloner({ alignmentAxis: event.target.value as ClonerSettings["alignmentAxis"] })}>
              <option value="+x">+X</option><option value="-x">-X</option>
              <option value="+y">+Y</option><option value="-y">-Y</option>
              <option value="+z">+Z</option><option value="-z">-Z</option>
            </select>
          </InspectorRow>
          <InspectorRow label="Up">
            <select value={cloner.alignmentUp} onChange={(event) => patchCloner({ alignmentUp: event.target.value as ClonerSettings["alignmentUp"] })}>
              <option value="auto">Automatic</option><option value="x">X</option>
              <option value="y">Y</option><option value="z">Z</option>
            </select>
          </InspectorRow>
          <InspectorRow label="Uniform">
            <InspectorNumberInput value={cloner.uniformScale} min={-1} max={1} step={0.01} decimals={2} ariaLabel="Uniform scale" onChange={(uniformScale) => patchCloner({ uniformScale })} />
          </InspectorRow>
        </InspectorGrid>
      </InspectorGroup>
    </div>
  );
}
