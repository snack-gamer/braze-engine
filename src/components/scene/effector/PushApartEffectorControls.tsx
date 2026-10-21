import type { EffectorSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";

type Props = {
  effector: EffectorSettings;
  patch: (partial: Partial<EffectorSettings>) => void;
};

export function PushApartEffectorControls({ effector, patch }: Props) {
  if (effector.type !== "pushApart") return null;

  return (
    <InspectorGroup id="effector.separation" title="Separation">
      <InspectorGrid>
        <InspectorRow label="Direction">
          <select value={effector.pushDirection} onChange={(event) => patch({ pushDirection: event.target.value as EffectorSettings["pushDirection"] })}>
            <option value="all">All</option>
            <option value="x">Along X</option>
            <option value="y">Along Y</option>
            <option value="z">Along Z</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Radius">
          <InspectorNumberInput value={effector.separationRadius} min={0} step={0.05} decimals={2} unit="m" ariaLabel="Separation radius" onChange={(separationRadius) => patch({ separationRadius })} />
        </InspectorRow>
        <InspectorRow label="Iterations">
          <InspectorNumberInput value={effector.iterations} min={1} max={32} step={1} decimals={0} ariaLabel="Iterations" onChange={(iterations) => patch({ iterations })} />
        </InspectorRow>
      </InspectorGrid>
    </InspectorGroup>
  );
}
