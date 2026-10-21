import type { EnvironmentSettings } from "../../../types";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";

type Props = {
  sky: EnvironmentSettings["sky"];
  setSky: (patch: Partial<EnvironmentSettings["sky"]>) => void;
};

export function SkyGalaxyControls({ sky, setSky }: Props) {
  return (
    <>
      <div className="rail-subheading first">Galaxy Controls</div>
      <InspectorRow label="Stars">
        <InspectorSlider
          value={sky.starsIntensity}
          min={0} max={3} step={0.01} decimals={2}
          ariaLabel="Star intensity"
          onChange={(value) => setSky({ starsIntensity: value })}
        />
      </InspectorRow>
      <InspectorRow label="Stars Size">
        <InspectorSlider
          value={sky.starsSize}
          min={0} max={2} step={0.01} decimals={2}
          ariaLabel="Star size"
          onChange={(value) => setSky({ starsSize: value })}
        />
      </InspectorRow>
      <InspectorRow label="Galaxy Band Opacity">
        <InspectorSlider
          value={sky.galaxyIntensity}
          min={0} max={3} step={0.01} decimals={2}
          ariaLabel="Galaxy intensity"
          onChange={(value) => setSky({ galaxyIntensity: value })}
        />
      </InspectorRow>
    </>
  );
}
