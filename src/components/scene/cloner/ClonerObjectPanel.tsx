import {
  CLONER_MODE_OPTIONS,
  CLONER_SOURCE_MODE_OPTIONS,
} from "../../../lib/cloner";
import type { ClonerVectorKey } from "../../../scene/authoring/cloner-editor-operations";
import type {
  ClonerMode,
  ClonerSettings,
  ClonerSourceMode,
  SceneObject,
} from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorToggle } from "../../InspectorToggle";
import { VectorField } from "../../VectorField";
import { ClonerModeSettings } from "./ClonerModeSettings";
import { ClonerRandomEffectorSettings } from "./ClonerRandomEffectorSettings";

type Props = {
  cloner: ClonerSettings;
  cloneCount: number;
  sourceCount: number;
  inputCandidates: SceneObject[];
  inputObject: SceneObject | null;
  patchCloner: (patch: Partial<ClonerSettings>) => void;
  patchVector: (key: ClonerVectorKey, axis: number, value: number, integer?: boolean) => void;
  patchUniform: (key: "jitterPosition" | "jitterRotation" | "jitterScale", value: number) => void;
};

export function ClonerObjectPanel(props: Props) {
  const { cloner, cloneCount, sourceCount, inputCandidates, inputObject, patchCloner } = props;
  return (
    <div className="cloner-panel">
      <InspectorGroup
        id="cloner.object"
        title="Object Properties"
        meta={`${cloneCount.toLocaleString()} clone${cloneCount === 1 ? "" : "s"}`}
      >
        <InspectorGrid>
          <InspectorRow label="Mode">
            <select value={cloner.mode} onChange={(event) => patchCloner({ mode: event.target.value as ClonerMode })}>
              {CLONER_MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </InspectorRow>
          <InspectorRow label="Clones">
            <select value={cloner.sourceMode} onChange={(event) => patchCloner({ sourceMode: event.target.value as ClonerSourceMode })}>
              {CLONER_SOURCE_MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </InspectorRow>
          <InspectorRow label="Sources">
            <InspectorToggle checked={cloner.showSources} onChange={(showSources) => patchCloner({ showSources })} ariaLabel="Source visibility" />
          </InspectorRow>
          {cloner.mode !== "grid" && (
            <InspectorRow label="Count">
              <InspectorNumberInput value={cloner.count} min={1} max={100000} step={1} decimals={0} ariaLabel="Count" onChange={(count) => patchCloner({ count })} />
            </InspectorRow>
          )}
          <InspectorRow label="Seed">
            <InspectorNumberInput value={cloner.seed} min={1} max={999999} step={1} decimals={0} ariaLabel="Seed" onChange={(seed) => patchCloner({ seed })} />
          </InspectorRow>
          {cloner.mode === "grid" && (
            <InspectorRow label="Count" variant="vec">
              <VectorField values={cloner.gridCount} step={1} decimals={0} ariaLabel="Grid count" onChange={(axis, value) => props.patchVector("gridCount", axis, value, true)} />
            </InspectorRow>
          )}
        </InspectorGrid>
      </InspectorGroup>

      <ClonerModeSettings
        cloner={cloner}
        inputCandidates={inputCandidates}
        inputObject={inputObject}
        patchCloner={patchCloner}
        patchVector={props.patchVector}
      />
      {sourceCount === 0 && (
        <p className="empty-note cloner-state-note">No child sources under this Cloner.</p>
      )}
      <ClonerRandomEffectorSettings
        cloner={cloner}
        patchVector={props.patchVector}
        patchUniform={props.patchUniform}
      />
    </div>
  );
}
