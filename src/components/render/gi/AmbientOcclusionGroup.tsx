import { defaultEnvironment } from "../../../constants";
import type { AmbientOcclusionSettings } from "../../../types";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";
import { InspectorToggle } from "../../InspectorToggle";
import { InspectorSection } from "../../scene/InspectorSection";
import type { EnvSetterProps } from "../section-props";

export function AmbientOcclusionGroup({ environment, setEnvironment }: EnvSetterProps) {
  const ao = environment.ao ?? defaultEnvironment.ao;
  const setAo = (patch: Partial<AmbientOcclusionSettings>) =>
    setEnvironment((env) => ({ ...env, ao: { ...env.ao, ...patch } }));

  return (
    <InspectorSection
      id="render.gi.ao"
      title="Ambient Occlusion"
      className="inspector-section--nested"
      actions={
        <InspectorToggle
          checked={ao.enabled}
          ariaLabel="Ambient occlusion enabled"
          onChange={(enabled) => setAo({ enabled })}
        />
      }
    >
      <InspectorRow label="Intensity">
        <InspectorSlider
          value={ao.intensity}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          ariaLabel="Ambient occlusion intensity"
          onChange={(value) => setAo({ intensity: value })}
        />
      </InspectorRow>

      <InspectorRow label="Radius">
        <InspectorSlider
          value={ao.radius}
          min={0.05}
          max={2}
          step={0.01}
          decimals={2}
          ariaLabel="Ambient occlusion radius"
          onChange={(value) => setAo({ radius: value })}
        />
      </InspectorRow>

      <InspectorRow label="Samples">
        <InspectorSlider
          value={ao.samples}
          min={4}
          max={32}
          step={1}
          decimals={0}
          ariaLabel="Ambient occlusion samples"
          onChange={(value) => setAo({ samples: Math.round(value) })}
        />
      </InspectorRow>

      <InspectorRow label="Thickness">
        <InspectorSlider
          value={ao.thickness}
          min={0.25}
          max={2}
          step={0.01}
          decimals={2}
          ariaLabel="Ambient occlusion thickness"
          onChange={(value) => setAo({ thickness: value })}
        />
      </InspectorRow>

      <InspectorRow label="Distance Falloff">
        <InspectorSlider
          value={ao.distanceFalloff}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          ariaLabel="Ambient occlusion distance falloff"
          onChange={(value) => setAo({ distanceFalloff: value })}
        />
      </InspectorRow>
    </InspectorSection>
  );
}
