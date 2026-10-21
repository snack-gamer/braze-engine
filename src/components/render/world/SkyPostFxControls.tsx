import type { EnvironmentSettings } from "../../../types";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";

type Props = {
  sky: EnvironmentSettings["sky"];
  setSky: (patch: Partial<EnvironmentSettings["sky"]>) => void;
};

export function SkyPostFxControls({ sky, setSky }: Props) {
  return (
    <>
      <div className="rail-subheading first">Godrays</div>
      <InspectorRow label="Intensity">
        <InspectorSlider
          value={sky.godraysIntensity}
          min={0} max={3} step={0.01} decimals={2}
          ariaLabel="Godrays intensity"
          onChange={(value) => setSky({ godraysIntensity: value })}
        />
      </InspectorRow>
      <InspectorRow label="Spread">
        <InspectorSlider
          value={sky.godraysSpread}
          min={0.05} max={1} step={0.01} decimals={2}
          ariaLabel="Godrays spread"
          onChange={(value) => setSky({ godraysSpread: value })}
        />
      </InspectorRow>
      <InspectorRow label="Decay">
        <InspectorSlider
          value={sky.godraysDecay}
          min={0} max={1} step={0.01} decimals={2}
          ariaLabel="Godrays decay"
          onChange={(value) => setSky({ godraysDecay: value })}
        />
      </InspectorRow>
    </>
  );
}
