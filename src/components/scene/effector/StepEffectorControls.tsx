import type { EffectorSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorToggle } from "../../InspectorToggle";

type Props = {
  effector: EffectorSettings;
  patch: (partial: Partial<EffectorSettings>) => void;
};

export function StepEffectorControls({ effector, patch }: Props) {
  if (effector.type !== "step") return null;

  return (
    <InspectorGroup id="effector.step" title="Step">
      <InspectorGrid>
        <InspectorRow label="Order">
          <select value={effector.stepOrdering} onChange={(event) => patch({ stepOrdering: event.target.value as EffectorSettings["stepOrdering"] })}>
            <option value="index">Index</option>
            <option value="objectX">Object X</option>
            <option value="objectY">Object Y</option>
            <option value="objectZ">Object Z</option>
            <option value="radial">Radial</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Input Range">
          <InspectorNumberInput value={effector.stepInputRange[0]} step={0.05} decimals={2} ariaLabel="Input min" onChange={(minimum) => patch({ stepInputRange: [minimum, effector.stepInputRange[1]] })} />
          <InspectorNumberInput value={effector.stepInputRange[1]} step={0.05} decimals={2} ariaLabel="Input max" onChange={(maximum) => patch({ stepInputRange: [effector.stepInputRange[0], maximum] })} />
        </InspectorRow>
        <InspectorRow label="Offset">
          <InspectorNumberInput value={effector.stepOffset} step={0.05} decimals={2} ariaLabel="Offset" onChange={(stepOffset) => patch({ stepOffset })} />
        </InspectorRow>
        <InspectorRow label="Bands">
          <InspectorNumberInput value={effector.stepQuantize} min={0} max={64} step={1} decimals={0} ariaLabel="Bands" onChange={(stepQuantize) => patch({ stepQuantize })} />
        </InspectorRow>
        <InspectorRow label="Loop">
          <InspectorToggle checked={effector.stepLoop} onChange={(stepLoop) => patch({ stepLoop })} ariaLabel="Loop" />
        </InspectorRow>
        <InspectorRow label="Reverse">
          <InspectorToggle checked={effector.stepReverse} onChange={(stepReverse) => patch({ stepReverse })} ariaLabel="Reverse" />
        </InspectorRow>
      </InspectorGrid>
    </InspectorGroup>
  );
}
