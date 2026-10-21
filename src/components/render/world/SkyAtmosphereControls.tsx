import type { EnvironmentSettings } from "../../../types";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";

type Props = {
  sky: EnvironmentSettings["sky"];
  setSky: (patch: Partial<EnvironmentSettings["sky"]>) => void;
};

export function SkyAtmosphereControls({ sky, setSky }: Props) {
  return (
    <>
      <div className="rail-subheading first">Sky</div>
      <InspectorRow label="Exposure">
        <InspectorSlider
          value={sky.exposure}
          min={0} max={4} step={0.01} decimals={2}
          ariaLabel="Sky exposure"
          onChange={(value) => setSky({ exposure: value })}
        />
      </InspectorRow>
      <InspectorRow label="Turbidity">
        <InspectorSlider
          value={sky.turbidity}
          min={0} max={5} step={0.05} decimals={2}
          ariaLabel="Turbidity"
          onChange={(value) => setSky({ turbidity: value })}
        />
      </InspectorRow>
      <InspectorRow label="Horizon">
        <InspectorSlider
          value={sky.horizonBlend}
          min={0} max={1} step={0.01} decimals={2}
          ariaLabel="Horizon blend"
          onChange={(value) => setSky({ horizonBlend: value })}
        />
      </InspectorRow>
      <div className="rail-subheading">Ground</div>
      <InspectorRow label="Bounce">
        <InspectorSlider
          value={sky.groundLight}
          min={0} max={1} step={0.01} decimals={2}
          ariaLabel="Ground light"
          onChange={(value) => setSky({ groundLight: value })}
        />
      </InspectorRow>
      <div className="rail-subheading">Scattering</div>
      <InspectorRow label="Intensity">
        <InspectorSlider
          value={sky.scatteringIntensity}
          min={0} max={2} step={0.01} decimals={2}
          ariaLabel="Scattering intensity"
          onChange={(value) => setSky({ scatteringIntensity: value })}
        />
      </InspectorRow>
      <InspectorRow label="Distance">
        <InspectorSlider
          value={sky.scatteringDistance}
          min={1} max={200} step={1} decimals={0} unit="u"
          ariaLabel="Scattering distance"
          onChange={(value) => setSky({ scatteringDistance: value })}
        />
      </InspectorRow>
    </>
  );
}
