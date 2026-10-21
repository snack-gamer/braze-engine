import { DEFAULT_DIRECTIONAL_LIGHT_SETTINGS } from "../../lib/directional-light";
import type { DirectionalLightSettings, SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorColor } from "../InspectorColor";
import { InspectorRow } from "../InspectorRow";
import { InspectorSlider } from "../InspectorSlider";
import { InspectorToggle } from "../InspectorToggle";
import { InspectorSection } from "./InspectorSection";

type Props = {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function DirectionalLightSection({ object, updateObject }: Props) {
  const settings = object.directionalLight ?? DEFAULT_DIRECTIONAL_LIGHT_SETTINGS;
  const patch = (next: Partial<DirectionalLightSettings>) => {
    updateObject(object.id, { directionalLight: { ...settings, ...next } });
  };

  return (
    <InspectorSection
      className="tone-lighting"
      id="object.directional-light"
      title="Light"
      icon={<EditorIcon name="objectDirectionalLight" size="control" />}
      defaultOpen
      enable={{
        checked: settings.enabled !== false,
        onChange: (enabled) => patch({ enabled }),
        ariaLabel: "Enable Directional Light",
      }}
      onReset={() => updateObject(object.id, {
        directionalLight: { ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS },
      })}
    >
      <InspectorRow label="Type">
        <span className="inspector-readonly-value">Directional</span>
      </InspectorRow>
      <InspectorRow label="Color">
        <InspectorColor
          value={settings.color}
          ariaLabel="Light color"
          onChange={(color) => patch({ color })}
        />
      </InspectorRow>
      <InspectorRow label="Intensity">
        <InspectorSlider
          value={settings.intensity}
          min={0}
          max={20}
          rangeMax={5}
          step={0.05}
          decimals={2}
          ariaLabel="Light intensity"
          onChange={(intensity) => patch({ intensity })}
        />
      </InspectorRow>
      <InspectorRow label="Cast Shadows">
        <InspectorToggle
          checked={settings.castShadows}
          ariaLabel="Cast shadows"
          onChange={(castShadows) => patch({ castShadows })}
        />
      </InspectorRow>
      <p className="inspector-note">
        Rotation sets the sun direction. Position and scale do not affect a directional light.
      </p>
    </InspectorSection>
  );
}
