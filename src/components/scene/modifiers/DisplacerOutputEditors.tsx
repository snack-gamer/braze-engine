import type { DisplacerModifier } from "../../../types";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";
import { InspectorToggle } from "../../InspectorToggle";
import { DisplacerGroup } from "./DisplacerGroup";

type DisplacerOutputEditorsProps = {
  modifier: DisplacerModifier;
  patch: (value: Partial<DisplacerModifier>) => void;
};

export function DisplacerOutputEditors({ modifier, patch }: DisplacerOutputEditorsProps) {
  return (
    <>
      <DisplacerGroup title="Geometry" meta="bounded" tone="geometry">
        <InspectorRow label="Strength" muted={!modifier.enabled}>
          <InspectorSlider
            value={modifier.strength}
            min={-10} max={10} step={0.001}
            rangeMin={-0.25} rangeMax={0.25} rangeStep={0.001}
            decimals={3} unit="m" ariaLabel="Displacer strength"
            disabled={!modifier.enabled}
            onChange={(value) => patch({ strength: value })}
          />
        </InspectorRow>
        <InspectorRow label="Midlevel" muted={!modifier.enabled}>
          <InspectorSlider
            value={modifier.midlevel}
            min={0} max={1} step={0.001}
            decimals={3} ariaLabel="Displacer midlevel"
            disabled={!modifier.enabled}
            onChange={(value) => patch({ midlevel: value })}
          />
        </InspectorRow>
        <InspectorRow label="Clamp" muted={!modifier.enabled}>
          <InspectorSlider
            value={modifier.heightClamp}
            min={0.001} max={20} step={0.001}
            rangeMin={0.001} rangeMax={0.5} rangeStep={0.001}
            decimals={3} unit="m" ariaLabel="Displacer clamp"
            disabled={!modifier.enabled}
            onChange={(value) => patch({ heightClamp: value })}
          />
        </InspectorRow>
        <InspectorRow label="Direction" muted={!modifier.enabled}>
          <select
            value={modifier.direction}
            disabled={!modifier.enabled}
            onChange={(event) => patch({ direction: event.target.value as DisplacerModifier["direction"] })}
          >
            <option value="normal">Normal</option>
            <option value="y">Y Axis</option>
          </select>
        </InspectorRow>
      </DisplacerGroup>

      <DisplacerGroup
        title="Surface Detail"
        meta="fake bump"
        tone="surface"
        action={(
          <InspectorToggle
            checked={modifier.bumpEnabled}
            disabled={!modifier.enabled}
            ariaLabel="Displacer bump"
            onChange={(checked) => patch({ bumpEnabled: checked })}
          />
        )}
      >
        <InspectorRow label="Bump" muted={!modifier.enabled || !modifier.bumpEnabled}>
          <InspectorSlider
            value={modifier.bumpStrength}
            min={0} max={2} step={0.001}
            rangeMin={0} rangeMax={0.25} rangeStep={0.001}
            decimals={3} ariaLabel="Bump strength"
            disabled={!modifier.enabled || !modifier.bumpEnabled}
            onChange={(value) => patch({ bumpStrength: value })}
          />
        </InspectorRow>
      </DisplacerGroup>

      <DisplacerGroup
        title="Camera Range"
        meta="work gate"
        tone="camera"
        action={(
          <InspectorToggle
            checked={modifier.cameraFade}
            disabled={!modifier.enabled}
            ariaLabel="Camera range"
            onChange={(checked) => patch({ cameraFade: checked })}
          />
        )}
      >
        <InspectorRow label="Start" muted={!modifier.enabled || !modifier.cameraFade}>
          <InspectorSlider
            value={modifier.cameraNear}
            min={0} max={500} step={0.1}
            rangeMin={0} rangeMax={50} rangeStep={0.1}
            decimals={1} unit="m" ariaLabel="Displacer camera fade start"
            disabled={!modifier.enabled || !modifier.cameraFade}
            onChange={(value) => patch({ cameraNear: value })}
          />
        </InspectorRow>
        <InspectorRow label="Limit" muted={!modifier.enabled || !modifier.cameraFade}>
          <InspectorSlider
            value={modifier.cameraFar}
            min={0.5} max={1000} step={0.1}
            rangeMin={1} rangeMax={80} rangeStep={0.1}
            decimals={1} unit="m" ariaLabel="Displacer work radius"
            disabled={!modifier.enabled || !modifier.cameraFade}
            onChange={(value) => patch({ cameraFar: value })}
          />
        </InspectorRow>
      </DisplacerGroup>
    </>
  );
}
