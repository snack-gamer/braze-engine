import { defaultEnvironment } from "../../../constants";
import type { ScreenSpaceReflectionSettings } from "../../../types";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";
import { InspectorToggle } from "../../InspectorToggle";
import { InspectorSection } from "../../scene/InspectorSection";
import type { EnvSetterProps } from "../section-props";

export function ScreenSpaceReflectionsGroup({ environment, setEnvironment }: EnvSetterProps) {
  const ssr = environment.ssr ?? defaultEnvironment.ssr;
  const setSsr = (patch: Partial<ScreenSpaceReflectionSettings>) =>
    setEnvironment((env) => ({ ...env, ssr: { ...env.ssr, ...patch } }));

  return (
    <InspectorSection
      id="render.gi.ssr"
      title="Screen-Space Reflections"
      className="inspector-section--nested"
      actions={
        <InspectorToggle
          checked={ssr.enabled}
          ariaLabel="Screen-space reflections enabled"
          onChange={(enabled) => setSsr({ enabled })}
        />
      }
    >
      <InspectorRow label="Opacity">
        <InspectorSlider
          value={ssr.opacity}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          ariaLabel="SSR blend opacity"
          onChange={(value) => setSsr({ opacity: value })}
        />
      </InspectorRow>

      <InspectorRow label="Max Distance">
        <InspectorSlider
          value={ssr.maxDistance}
          min={0.1}
          max={50}
          step={0.1}
          decimals={1}
          ariaLabel="SSR ray max distance"
          onChange={(value) => setSsr({ maxDistance: value })}
        />
      </InspectorRow>

      <InspectorRow label="Thickness">
        <InspectorSlider
          value={ssr.thickness}
          min={0.01}
          max={2}
          step={0.01}
          decimals={2}
          ariaLabel="SSR hit thickness"
          onChange={(value) => setSsr({ thickness: value })}
        />
      </InspectorRow>

      <InspectorRow label="Quality">
        <InspectorSlider
          value={ssr.quality}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          ariaLabel="SSR march quality"
          onChange={(value) => setSsr({ quality: value })}
        />
      </InspectorRow>

      <InspectorRow label="Blur Quality">
        <InspectorSlider
          value={ssr.blurQuality}
          min={1}
          max={3}
          step={1}
          decimals={0}
          ariaLabel="SSR blur quality"
          onChange={(value) => setSsr({ blurQuality: Math.round(value) })}
        />
      </InspectorRow>
    </InspectorSection>
  );
}
