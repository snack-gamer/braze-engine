import type { EffectorSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSegmented } from "../../InspectorSegmented";
import { InspectorToggle } from "../../InspectorToggle";

type Props = {
  effector: EffectorSettings;
  patch: (partial: Partial<EffectorSettings>) => void;
};

export function RandomEffectorControls({ effector, patch }: Props) {
  if (effector.type !== "random") return null;

  return (
    <InspectorGroup
      id="effector.randomization"
      title="Randomization"
      note="Random gives every clone an independent stable value — change Seed for another variation. Synchronized shares one vector across transform channels; Indexed XYZ gives each axis its own value."
    >
      <InspectorGrid>
        <InspectorRow label="Mode">
          <select value={effector.randomMode} onChange={(event) => patch({ randomMode: event.target.value as EffectorSettings["randomMode"] })}>
            <option value="random">Random</option>
            <option value="gaussian">Gaussian</option>
            <option value="noise">Noise</option>
            <option value="turbulence">Turbulence</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Seed">
          <InspectorNumberInput value={effector.seed} step={1} decimals={0} ariaLabel="Seed" onChange={(seed) => patch({ seed })} />
        </InspectorRow>
        <InspectorRow label="Range">
          <InspectorNumberInput value={effector.outputRange[0]} step={0.05} decimals={2} ariaLabel="Range min" onChange={(minimum) => patch({ outputRange: [minimum, effector.outputRange[1]] })} />
          <InspectorNumberInput value={effector.outputRange[1]} step={0.05} decimals={2} ariaLabel="Range max" onChange={(maximum) => patch({ outputRange: [effector.outputRange[0], maximum] })} />
        </InspectorRow>
        <InspectorRow label="Synchronized">
          <InspectorToggle checked={effector.synchronized} onChange={(synchronized) => patch({ synchronized })} ariaLabel="Synchronized" />
        </InspectorRow>
        <InspectorRow label="Indexed XYZ">
          <InspectorToggle checked={effector.indexed} onChange={(indexed) => patch({ indexed })} ariaLabel="Indexed" />
        </InspectorRow>
      </InspectorGrid>

      {(effector.randomMode === "noise" || effector.randomMode === "turbulence") && (
        <InspectorGroup id="effector.noiseField" title="Noise Field">
          <InspectorGrid>
            <InspectorRow label="Noise Space">
              <InspectorSegmented
                options={[{ id: "object" as const, label: "Object" }, { id: "global" as const, label: "Global" }]}
                value={effector.noiseSpace}
                onChange={(noiseSpace) => patch({ noiseSpace })}
                ariaLabel="Noise space"
              />
            </InspectorRow>
            <InspectorRow label="Feature Size">
              <InspectorNumberInput value={effector.noiseSize} min={0.001} step={0.1} decimals={2} ariaLabel="Feature size" onChange={(noiseSize) => patch({ noiseSize })} />
            </InspectorRow>
            <InspectorRow label="Anim Speed">
              <InspectorNumberInput value={effector.animationSpeed} step={0.05} decimals={2} ariaLabel="Animation speed" onChange={(animationSpeed) => patch({ animationSpeed })} />
            </InspectorRow>
          </InspectorGrid>
        </InspectorGroup>
      )}
    </InspectorGroup>
  );
}
