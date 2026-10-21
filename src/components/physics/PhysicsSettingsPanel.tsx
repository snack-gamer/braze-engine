import {
  DEFAULT_PHYSICS_WORLD_SETTINGS,
  normalizePhysicsWorldSettings,
} from "../../physics/domain/world-settings";
import type { PhysicsWorldSettings, Vec3 } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorNumberInput } from "../InspectorNumberInput";
import { InspectorRow } from "../InspectorRow";
import { VectorField } from "../VectorField";
import { InspectorSection } from "../scene/InspectorSection";
import { PanelHeader } from "../scene/PanelHeader";

type PhysicsSettingsPanelProps = {
  worldSettings: PhysicsWorldSettings;
  updateWorldSettings: (patch: Partial<PhysicsWorldSettings>) => void;
};

function patchVector(values: Vec3, axis: number, value: number): Vec3 {
  const next = [...values] as Vec3;
  next[axis] = Number.isFinite(value) ? value : values[axis];
  return next;
}

/** Scene-wide settings rendered by the same Inspector drawer used by every other selection. */
export function PhysicsSettingsPanel({ worldSettings, updateWorldSettings }: PhysicsSettingsPanelProps) {
  const world = normalizePhysicsWorldSettings(worldSettings);

  return (
    <form className="rail-scroll" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
      <PanelHeader
        title="Physics Settings"
        tone="physics"
        icon={<EditorIcon name="physicsSettings" size="control" />}
        actions={(
          <button
            type="button"
            className="link-button"
            title="Reset physics settings"
            onClick={() => updateWorldSettings(normalizePhysicsWorldSettings(DEFAULT_PHYSICS_WORLD_SETTINGS))}
          >
            <EditorIcon name="reset" size="compact" /> Reset
          </button>
        )}
      />

      <InspectorSection id="physics.world" title="World" icon={<EditorIcon name="physicsSettings" size="control" />} defaultOpen>
        <InspectorRow label="Gravity" variant="vec">
          <VectorField
            values={world.gravity}
            step={0.01}
            decimals={3}
            ariaLabel="Physics gravity"
            onChange={(axis, value) => updateWorldSettings({
              gravity: patchVector(world.gravity, axis, value),
            })}
          />
        </InspectorRow>
      </InspectorSection>

      <InspectorSection id="physics.simulation" title="Simulation" icon={<EditorIcon name="physicsSimulation" size="control" />} defaultOpen>
        <InspectorRow label="Fixed Timestep">
          <InspectorNumberInput
            value={world.fixedTimestep}
            min={0.001}
            max={1}
            step={0.001}
            decimals={4}
            unit="s"
            ariaLabel="Physics fixed timestep"
            onChange={(fixedTimestep) => updateWorldSettings({ fixedTimestep })}
          />
        </InspectorRow>
        <InspectorRow label="Max Substeps">
          <InspectorNumberInput
            value={world.maxSubsteps}
            min={1}
            max={64}
            step={1}
            decimals={0}
            ariaLabel="Physics maximum substeps"
            onChange={(maxSubsteps) => updateWorldSettings({ maxSubsteps })}
          />
        </InspectorRow>
      </InspectorSection>

    </form>
  );
}
