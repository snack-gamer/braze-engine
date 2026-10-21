import type { EffectorVectorKey } from "../../../scene/authoring/effector-editor-operations";
import type { EffectorSettings } from "../../../types";
import { InspectorGrid } from "../../InspectorGrid";
import { InspectorGroup } from "../../InspectorGroup";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorToggle } from "../../InspectorToggle";
import { VectorField } from "../../VectorField";

type Props = {
  effector: EffectorSettings;
  patch: (partial: Partial<EffectorSettings>) => void;
  patchVector: (key: EffectorVectorKey, axis: number, value: number) => void;
};

export function ShaderEffectorControls({ effector, patch, patchVector }: Props) {
  if (effector.type !== "shader") return null;

  return (
    <InspectorGroup id="effector.noise" title="Noise">
      <InspectorGrid>
        <InspectorRow label="Noise Type">
          <select value={effector.shaderNoiseType} onChange={(event) => patch({ shaderNoiseType: event.target.value as EffectorSettings["shaderNoiseType"] })}>
            <option value="soft">Soft</option>
            <option value="fractal">Fractal</option>
            <option value="turbulence">Turbulence</option>
            <option value="ridged">Ridged</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Seed">
          <InspectorNumberInput value={effector.seed} step={1} decimals={0} ariaLabel="Seed" onChange={(seed) => patch({ seed })} />
        </InspectorRow>
        <InspectorRow label="Space">
          <select value={effector.shaderNoiseSpace} onChange={(event) => patch({ shaderNoiseSpace: event.target.value as EffectorSettings["shaderNoiseSpace"] })}>
            <option value="effector">Effector</option>
            <option value="object">Object</option>
            <option value="world">World</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Global Scale">
          <InspectorNumberInput value={effector.globalScale} min={0.001} step={0.1} decimals={2} ariaLabel="Global scale" onChange={(globalScale) => patch({ globalScale })} />
        </InspectorRow>
        <InspectorRow label="Relative" variant="vec">
          <VectorField values={effector.relativeScale} step={0.05} decimals={2} ariaLabel="Relative scale" onChange={(axis, value) => patchVector("relativeScale", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Offset" variant="vec">
          <VectorField values={effector.coordinateOffset} step={0.1} decimals={2} ariaLabel="Coordinate offset" onChange={(axis, value) => patchVector("coordinateOffset", axis, value)} />
        </InspectorRow>
        {effector.shaderNoiseType !== "soft" && (
          <>
            <InspectorRow label="Octaves">
              <InspectorNumberInput value={effector.octaves} min={1} max={8} step={1} decimals={0} ariaLabel="Octaves" onChange={(octaves) => patch({ octaves })} />
            </InspectorRow>
            <InspectorRow label="Roughness">
              <InspectorNumberInput value={effector.roughness} min={0} max={1} step={0.05} decimals={2} ariaLabel="Roughness" onChange={(roughness) => patch({ roughness })} />
            </InspectorRow>
            <InspectorRow label="Lacunarity">
              <InspectorNumberInput value={effector.lacunarity} min={1.01} max={4} step={0.05} decimals={2} ariaLabel="Lacunarity" onChange={(lacunarity) => patch({ lacunarity })} />
            </InspectorRow>
          </>
        )}
        <InspectorRow label="Evolution">
          <InspectorNumberInput value={effector.evolutionSpeed} step={0.05} decimals={2} ariaLabel="Evolution speed" onChange={(evolutionSpeed) => patch({ evolutionSpeed })} />
        </InspectorRow>
        <InspectorRow label="Movement" variant="vec">
          <VectorField values={effector.movement} step={0.05} decimals={2} ariaLabel="Movement" onChange={(axis, value) => patchVector("movement", axis, value)} />
        </InspectorRow>
        <InspectorRow label="Move Speed">
          <InspectorNumberInput value={effector.movementSpeed} step={0.05} decimals={2} ariaLabel="Movement speed" onChange={(movementSpeed) => patch({ movementSpeed })} />
        </InspectorRow>
        <InspectorRow label="Low Clip">
          <InspectorNumberInput value={effector.lowClip} min={0} max={1} step={0.01} decimals={2} ariaLabel="Low clip" onChange={(lowClip) => patch({ lowClip })} />
        </InspectorRow>
        <InspectorRow label="High Clip">
          <InspectorNumberInput value={effector.highClip} min={0} max={1} step={0.01} decimals={2} ariaLabel="High clip" onChange={(highClip) => patch({ highClip })} />
        </InspectorRow>
        <InspectorRow label="Brightness">
          <InspectorNumberInput value={effector.brightness} min={-1} max={1} step={0.01} decimals={2} ariaLabel="Brightness" onChange={(brightness) => patch({ brightness })} />
        </InspectorRow>
        <InspectorRow label="Contrast">
          <InspectorNumberInput value={effector.contrast} min={-1} max={1} step={0.01} decimals={2} ariaLabel="Contrast" onChange={(contrast) => patch({ contrast })} />
        </InspectorRow>
        <InspectorRow label="Absolute">
          <InspectorToggle checked={effector.absolute} onChange={(absolute) => patch({ absolute })} ariaLabel="Absolute" />
        </InspectorRow>
        <InspectorRow label="Invert">
          <InspectorToggle checked={effector.invert} onChange={(invert) => patch({ invert })} ariaLabel="Invert" />
        </InspectorRow>
      </InspectorGrid>
    </InspectorGroup>
  );
}
