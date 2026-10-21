import type { EffectorVectorKey } from "../../../scene/authoring/effector-editor-operations";
import type { EffectorSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSegmented } from "../../InspectorSegmented";
import { InspectorToggle } from "../../InspectorToggle";
import { VectorField } from "../../VectorField";

type Props = {
  effector: EffectorSettings;
  patch: (partial: Partial<EffectorSettings>) => void;
  patchVector: (key: EffectorVectorKey, axis: number, value: number) => void;
};

export function EffectorTransformControls({ effector, patch, patchVector }: Props) {
  if (effector.type === "target" || effector.type === "pushApart") return null;

  return (
    <InspectorGroup id="effector.transform" title="Transform">
      <InspectorGrid>
        <InspectorRow label="Space">
          <InspectorSegmented
            options={[{ id: "effector" as const, label: "Effector" }, { id: "world" as const, label: "World" }]}
            value={effector.transformSpace}
            onChange={(transformSpace) => patch({ transformSpace })}
            ariaLabel="Transform space"
          />
        </InspectorRow>
        <InspectorRow label="Position" enable={{ checked: effector.affectPosition, onChange: (affectPosition) => patch({ affectPosition }), ariaLabel: "Affect position" }}>
          <VectorField values={effector.positionAmount} step={0.05} decimals={2} unit="m" ariaLabel="Position amount" disabled={!effector.affectPosition} onChange={(axis, value) => patchVector("positionAmount", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Rotation" enable={{ checked: effector.affectRotation, onChange: (affectRotation) => patch({ affectRotation }), ariaLabel: "Affect rotation" }}>
          <VectorField values={effector.rotationAmount} step={1} decimals={1} unit="deg" ariaLabel="Rotation amount" disabled={!effector.affectRotation} onChange={(axis, value) => patchVector("rotationAmount", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Scale" enable={{ checked: effector.affectScale, onChange: (affectScale) => patch({ affectScale }), ariaLabel: "Affect scale" }}>
          <VectorField values={effector.scaleAmount} min={0} step={0.01} decimals={2} ariaLabel="Scale amount" disabled={!effector.affectScale} onChange={(axis, value) => patchVector("scaleAmount", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Uniform Scale">
          <InspectorToggle checked={effector.uniformScale} disabled={!effector.affectScale} onChange={(uniformScale) => patch({ uniformScale })} ariaLabel="Uniform scale" />
        </InspectorRow>
      </InspectorGrid>
    </InspectorGroup>
  );
}
