import { DEFAULT_CLOUD_SETTINGS } from "../../../rendering/authoring/world-editor-model";
import type { EnvironmentSettings } from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";

type SkySettings = EnvironmentSettings["sky"];
type Props = {
  sky: SkySettings;
  setSky: (patch: Partial<SkySettings>) => void;
};

type CloudSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  ariaLabel: string;
  onChange: (value: number) => void;
};

function CloudSlider(props: CloudSliderProps) {
  return (
    <InspectorRow label={props.label}>
      <InspectorSlider
        value={props.value}
        min={props.min} max={props.max} step={props.step} decimals={props.decimals}
        ariaLabel={props.ariaLabel}
        onChange={props.onChange}
      />
    </InspectorRow>
  );
}

export function SkyCloudControls({ sky, setSky }: Props) {
  return (
    <>
      <div className="rail-subheading first">Cloud Cover</div>
      <InspectorRow label="Defaults">
        <button
          type="button"
          className="ghost-button"
          onClick={() => setSky(DEFAULT_CLOUD_SETTINGS)}
          title="Reset clouds to default values"
        >
          <EditorIcon name="reset" size="compact" /> Reset clouds
        </button>
      </InspectorRow>
      <CloudSlider label="Coverage" value={sky.cloudsCoverage} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud coverage" onChange={(cloudsCoverage) => setSky({ cloudsCoverage })} />
      <CloudSlider label="Density" value={sky.cloudsDensity} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud density" onChange={(cloudsDensity) => setSky({ cloudsDensity })} />
      <CloudSlider label="Depth" value={sky.cloudsDepth} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud vertical depth" onChange={(cloudsDepth) => setSky({ cloudsDepth })} />
      <CloudSlider label="Weather" value={sky.cloudsWeather} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud weather variation" onChange={(cloudsWeather) => setSky({ cloudsWeather })} />
      <CloudSlider label="Tops" value={sky.cloudsTopVariation} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud top variation" onChange={(cloudsTopVariation) => setSky({ cloudsTopVariation })} />

      <div className="rail-subheading">Fractal Noise</div>
      <CloudSlider label="Scale" value={sky.cloudsScale} min={0.08} max={8} step={0.01} decimals={2} ariaLabel="Cloud scale" onChange={(cloudsScale) => setSky({ cloudsScale })} />
      <CloudSlider label="Complexity" value={sky.cloudsComplexity} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud noise complexity" onChange={(cloudsComplexity) => setSky({ cloudsComplexity })} />
      <CloudSlider label="Detail" value={sky.cloudsDetail} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud detail" onChange={(cloudsDetail) => setSky({ cloudsDetail })} />
      <CloudSlider label="Contrast" value={sky.cloudsContrast} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud noise contrast" onChange={(cloudsContrast) => setSky({ cloudsContrast })} />
      <CloudSlider label="Warp" value={sky.cloudsWarp} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud domain warp" onChange={(cloudsWarp) => setSky({ cloudsWarp })} />
      <CloudSlider label="Billow" value={sky.cloudsBillow} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud billow amount" onChange={(cloudsBillow) => setSky({ cloudsBillow })} />
      <CloudSlider label="Streaks" value={sky.cloudsStreaks} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud streak amount" onChange={(cloudsStreaks) => setSky({ cloudsStreaks })} />
      <CloudSlider label="Erosion" value={sky.cloudsErosion} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud edge erosion" onChange={(cloudsErosion) => setSky({ cloudsErosion })} />

      <div className="rail-subheading">Lighting</div>
      <CloudSlider label="Absorption" value={sky.cloudsAbsorption} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud absorption" onChange={(cloudsAbsorption) => setSky({ cloudsAbsorption })} />
      <CloudSlider label="Scatter" value={sky.cloudsScattering} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud scattering" onChange={(cloudsScattering) => setSky({ cloudsScattering })} />
      <CloudSlider label="Self shadow" value={sky.cloudsSelfShadow} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud self shadow" onChange={(cloudsSelfShadow) => setSky({ cloudsSelfShadow })} />
      <CloudSlider label="Shadow strength" value={sky.cloudsShadowStrength} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud shadow strength" onChange={(cloudsShadowStrength) => setSky({ cloudsShadowStrength })} />
      <CloudSlider label="Shadow detail" value={sky.cloudsShadowDetail} min={0} max={2} step={0.01} decimals={2} ariaLabel="Cloud shadow detail" onChange={(cloudsShadowDetail) => setSky({ cloudsShadowDetail })} />
      <CloudSlider label="Speed" value={sky.cloudsSpeed} min={0} max={1} step={0.01} decimals={2} ariaLabel="Cloud speed" onChange={(cloudsSpeed) => setSky({ cloudsSpeed })} />
    </>
  );
}
