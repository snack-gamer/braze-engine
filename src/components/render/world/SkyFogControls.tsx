import type { EnvironmentSettings } from "../../../types";
import { InspectorColor } from "../../InspectorColor";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";

type Props = {
  sky: EnvironmentSettings["sky"];
  setSky: (patch: Partial<EnvironmentSettings["sky"]>) => void;
};

export function SkyFogControls({ sky, setSky }: Props) {
  return (
    <>
      <div className="rail-subheading first">Scene Fog</div>
      <InspectorRow label="Density">
        <InspectorSlider
          value={sky.fogDensity}
          min={0} max={0.2} step={0.001} decimals={3}
          ariaLabel="Fog density"
          onChange={(value) => setSky({ fogDensity: value })}
        />
      </InspectorRow>
      <div className="rail-subheading">Sky Coverage</div>
      <InspectorRow label="Coverage">
        <InspectorSlider
          value={sky.fogSkyCoverage}
          min={0} max={2} step={0.01} decimals={2}
          ariaLabel="Sky fog coverage"
          onChange={(value) => setSky({ fogSkyCoverage: value })}
        />
      </InspectorRow>
      <InspectorRow label="Height">
        <InspectorSlider
          value={sky.fogSkyHeight}
          min={0} max={1} step={0.01} decimals={2}
          ariaLabel="Sky fog height"
          onChange={(value) => setSky({ fogSkyHeight: value })}
        />
      </InspectorRow>
      <InspectorRow label="Softness">
        <InspectorSlider
          value={sky.fogSkySoftness}
          min={0} max={1} step={0.01} decimals={2}
          ariaLabel="Sky fog softness"
          onChange={(value) => setSky({ fogSkySoftness: value })}
        />
      </InspectorRow>
      <div className="rail-subheading">Color</div>
      <InspectorRow label="Color">
        <InspectorColor
          value={sky.fogColor}
          ariaLabel="Fog color"
          onChange={(value) => setSky({ fogColor: value })}
        />
      </InspectorRow>
      <InspectorRow label="Tint">
        <InspectorSlider
          value={sky.fogTintInfluence}
          min={0} max={1} step={0.01} decimals={2}
          ariaLabel="Fog color tint influence"
          onChange={(value) => setSky({ fogTintInfluence: value })}
        />
      </InspectorRow>
    </>
  );
}
