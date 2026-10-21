import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorRow } from "../InspectorRow";
import { InspectorSlider } from "../InspectorSlider";
import { InspectorToggle } from "../InspectorToggle";
import { InspectorSection } from "../scene/InspectorSection";
import type { ToneMapping } from "../../types";
import type { EnvSetterProps } from "./section-props";

const TONE_MAPPING_OPTIONS: Array<{ value: ToneMapping; label: string }> = [
  { value: "aces", label: "ACES Filmic" },
  { value: "filmic", label: "AgX" },
  { value: "neutral", label: "Neutral" },
  { value: "reinhard", label: "Reinhard" },
  { value: "linear", label: "Linear (raw)" },
];

export function ToneMappingSection({ environment, setEnvironment }: EnvSetterProps) {
  return (
    <InspectorSection id="render.toneMapping" title="Tone mapping" icon={<EditorIcon name="toneMapping" size="control" />} meta="Image response">
      <InspectorRow label="Mode">
        <select
          value={environment.toneMapping}
          onChange={(event) =>
            setEnvironment((env) => ({ ...env, toneMapping: event.target.value as ToneMapping }))
          }
        >
          {TONE_MAPPING_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </InspectorRow>
      <InspectorRow label="Exposure">
        <InspectorSlider
          value={environment.exposureEv}
          min={-2}
          max={2}
          step={0.05}
          decimals={2}
          unit=" EV"
          ariaLabel="Exposure"
          onChange={(value) => setEnvironment((env) => ({ ...env, exposureEv: value }))}
        />
      </InspectorRow>

      <InspectorSection
        id="render.toneMapping.bloom"
        title="Bloom"
        className="inspector-section--nested"
        actions={
          <InspectorToggle
            checked={environment.bloom}
            ariaLabel="Bloom enabled"
            onChange={(bloom) => setEnvironment((env) => ({ ...env, bloom }))}
          />
        }
      >
        <InspectorRow label="Intensity">
          <InspectorSlider
            value={environment.bloomIntensity}
            min={0}
            max={2}
            step={0.01}
            decimals={2}
            ariaLabel="Bloom intensity"
            onChange={(value) => setEnvironment((env) => ({ ...env, bloomIntensity: value }))}
          />
        </InspectorRow>

        <InspectorRow label="Threshold">
          <InspectorSlider
            value={environment.bloomThreshold}
            min={0}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="Bloom threshold"
            onChange={(value) => setEnvironment((env) => ({ ...env, bloomThreshold: value }))}
          />
        </InspectorRow>

        <InspectorRow label="Smoothing">
          <InspectorSlider
            value={environment.bloomSmoothing}
            min={0}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="Bloom smoothing"
            onChange={(value) => setEnvironment((env) => ({ ...env, bloomSmoothing: value }))}
          />
        </InspectorRow>

        <InspectorRow label="Radius">
          <InspectorSlider
            value={environment.bloomRadius}
            min={0}
            max={1}
            step={0.01}
            decimals={2}
            ariaLabel="Bloom radius"
            onChange={(value) => setEnvironment((env) => ({ ...env, bloomRadius: value }))}
          />
        </InspectorRow>
      </InspectorSection>
    </InspectorSection>
  );
}
