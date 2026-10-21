import type { ClonerVectorKey } from "../../../scene/authoring/cloner-editor-operations";
import type { ClonerSettings, SceneObject } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorRow } from "../../InspectorRow";
import { InspectorToggle } from "../../InspectorToggle";
import { VectorField } from "../../VectorField";
import { ObjectDropField } from "../ObjectDropField";
import { ClonerRadialSettings } from "./ClonerRadialSettings";

type Props = {
  cloner: ClonerSettings;
  inputCandidates: SceneObject[];
  inputObject: SceneObject | null;
  patchCloner: (patch: Partial<ClonerSettings>) => void;
  patchVector: (key: ClonerVectorKey, axis: number, value: number) => void;
};

export function ClonerModeSettings(props: Props) {
  const { cloner, inputCandidates, inputObject, patchCloner, patchVector } = props;
  if (cloner.mode === "linear") {
    return (
      <InspectorGroup id="cloner.linear" title="Linear">
        <InspectorRow label="Step" variant="vec">
          <VectorField values={cloner.linearStep} step={0.05} decimals={2} ariaLabel="Step" onChange={(axis, value) => patchVector("linearStep", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Rotation" variant="vec">
          <VectorField values={cloner.linearRotation} step={1} decimals={1} unit="deg" ariaLabel="Rotation per clone" onChange={(axis, value) => patchVector("linearRotation", axis, value)} />
        </InspectorRow>
        <InspectorRow label="End Scale" variant="vec">
          <VectorField values={cloner.linearScale} step={0.01} decimals={2} ariaLabel="End scale" onChange={(axis, value) => patchVector("linearScale", axis, value)} />
        </InspectorRow>
      </InspectorGroup>
    );
  }
  if (cloner.mode === "radial") {
    return <ClonerRadialSettings cloner={cloner} patchCloner={patchCloner} patchVector={patchVector} />;
  }
  if (cloner.mode === "grid") {
    return (
      <InspectorGroup id="cloner.grid" title="Grid">
        <InspectorGrid>
          <InspectorRow label="Size" variant="vec">
            <VectorField values={cloner.gridSpacing} step={0.05} decimals={2} unit="m" ariaLabel="Grid spacing" onChange={(axis, value) => patchVector("gridSpacing", axis, value)} />
          </InspectorRow>
          <InspectorRow label="Center">
            <InspectorToggle checked={cloner.gridCenter} onChange={(gridCenter) => patchCloner({ gridCenter })} ariaLabel="Center grid" />
          </InspectorRow>
        </InspectorGrid>
      </InspectorGroup>
    );
  }
  if (cloner.mode === "random") {
    return (
      <InspectorGroup id="cloner.random" title="Random">
        <InspectorRow label="Size" variant="vec">
          <VectorField values={cloner.randomSize} step={0.1} decimals={2} unit="m" ariaLabel="Random size" onChange={(axis, value) => patchVector("randomSize", axis, value)} />
        </InspectorRow>
      </InspectorGroup>
    );
  }
  return (
    <InspectorGroup id="cloner.surface" title="Surface">
      <InspectorGrid>
        <InspectorRow label="Surface" className="is-full">
          <ObjectDropField
            objects={inputCandidates}
            value={cloner.inputObjectId}
            placeholder="Drop mesh"
            className="cloner-input-drop"
            onAssign={(inputObjectId) => patchCloner({ inputObjectId })}
          />
        </InspectorRow>
        <InspectorRow label="Align">
          <InspectorToggle checked={cloner.alignToSurface} onChange={(alignToSurface) => patchCloner({ alignToSurface })} ariaLabel="Align to surface" />
        </InspectorRow>
      </InspectorGrid>
      {!inputObject && <p className="empty-note cloner-state-note">No surface mesh assigned.</p>}
    </InspectorGroup>
  );
}
