import type { LibraryAsset } from "../../../lib/api";
import { patchDisplacerUvAxis } from "../../../modifiers/authoring/displacer-texture";
import type { DisplacerModifier } from "../../../types";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";
import { DisplacerGroup } from "./DisplacerGroup";
import { DisplacerTextureSlot } from "./DisplacerTextureSlot";

type DisplacerSourceEditorProps = {
  modifier: DisplacerModifier;
  imageAssets: LibraryAsset[];
  patch: (value: Partial<DisplacerModifier>) => void;
};

export function DisplacerSourceEditor({
  modifier,
  imageAssets,
  patch,
}: DisplacerSourceEditorProps) {
  const showTextureControls = modifier.source !== "noise";
  const showNoiseControls = modifier.source !== "texture";
  return (
    <DisplacerGroup title="Source" meta={modifier.source} tone="source">
      <InspectorRow label="Name">
        <input type="text" value={modifier.name} onChange={(event) => patch({ name: event.target.value })} />
      </InspectorRow>
      <InspectorRow label="Mode" muted={!modifier.enabled}>
        <select
          value={modifier.source}
          disabled={!modifier.enabled}
          onChange={(event) => patch({ source: event.target.value as DisplacerModifier["source"] })}
        >
          <option value="noise">Noise</option>
          <option value="texture">Texture</option>
          <option value="blend">Blend</option>
        </select>
      </InspectorRow>

      {showTextureControls && (
        <>
          <DisplacerTextureSlot modifier={modifier} imageAssets={imageAssets} patch={patch} />
          <InspectorRow label="Channel" muted={!modifier.enabled}>
            <select
              value={modifier.textureChannel}
              disabled={!modifier.enabled}
              onChange={(event) => patch({
                textureChannel: event.target.value as DisplacerModifier["textureChannel"],
              })}
            >
              <option value="luminance">Luma</option>
              <option value="red">Red</option>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
              <option value="alpha">Alpha</option>
            </select>
          </InspectorRow>
          {modifier.source === "blend" && (
            <InspectorRow label="Texture" muted={!modifier.enabled}>
              <InspectorSlider
                value={modifier.textureInfluence}
                min={0} max={1} step={0.01} decimals={2}
                ariaLabel="Texture blend"
                disabled={!modifier.enabled}
                onChange={(value) => patch({ textureInfluence: value })}
              />
            </InspectorRow>
          )}
          <div className="displacer-axis-grid">
            <InspectorRow label="U Scale" muted={!modifier.enabled}>
              <InspectorNumberInput
                value={modifier.uvScale[0]}
                min={0.01} max={100} step={0.01} decimals={2}
                ariaLabel="Displacer U scale"
                disabled={!modifier.enabled}
                onChange={(value) => patch({ uvScale: patchDisplacerUvAxis(modifier.uvScale, 0, value) })}
              />
            </InspectorRow>
            <InspectorRow label="V Scale" muted={!modifier.enabled}>
              <InspectorNumberInput
                value={modifier.uvScale[1]}
                min={0.01} max={100} step={0.01} decimals={2}
                ariaLabel="Displacer V scale"
                disabled={!modifier.enabled}
                onChange={(value) => patch({ uvScale: patchDisplacerUvAxis(modifier.uvScale, 1, value) })}
              />
            </InspectorRow>
            <InspectorRow label="U Offset" muted={!modifier.enabled}>
              <InspectorNumberInput
                value={modifier.uvOffset[0]}
                min={-100} max={100} step={0.001} decimals={3}
                ariaLabel="Displacer U offset"
                disabled={!modifier.enabled}
                onChange={(value) => patch({ uvOffset: patchDisplacerUvAxis(modifier.uvOffset, 0, value) })}
              />
            </InspectorRow>
            <InspectorRow label="V Offset" muted={!modifier.enabled}>
              <InspectorNumberInput
                value={modifier.uvOffset[1]}
                min={-100} max={100} step={0.001} decimals={3}
                ariaLabel="Displacer V offset"
                disabled={!modifier.enabled}
                onChange={(value) => patch({ uvOffset: patchDisplacerUvAxis(modifier.uvOffset, 1, value) })}
              />
            </InspectorRow>
          </div>
        </>
      )}

      {showNoiseControls && (
        <div className="displacer-axis-grid">
          <InspectorRow label="Scale" muted={!modifier.enabled}>
            <InspectorSlider
              value={modifier.noiseScale}
              min={0.01} max={100} step={0.01}
              rangeMin={0.1} rangeMax={10} rangeStep={0.01}
              decimals={2} ariaLabel="Noise scale"
              disabled={!modifier.enabled}
              onChange={(value) => patch({ noiseScale: value })}
            />
          </InspectorRow>
          <InspectorRow label="Detail" muted={!modifier.enabled}>
            <InspectorSlider
              value={modifier.noiseDetail}
              min={0} max={1} step={0.005}
              decimals={3} ariaLabel="Noise detail"
              disabled={!modifier.enabled}
              onChange={(value) => patch({ noiseDetail: value })}
            />
          </InspectorRow>
          <InspectorRow label="Contrast" muted={!modifier.enabled}>
            <InspectorSlider
              value={modifier.noiseContrast}
              min={0.1} max={6} step={0.005}
              rangeMin={0.25} rangeMax={2.5} rangeStep={0.005}
              decimals={3} ariaLabel="Noise contrast"
              disabled={!modifier.enabled}
              onChange={(value) => patch({ noiseContrast: value })}
            />
          </InspectorRow>
          <InspectorRow label="Seed" muted={!modifier.enabled}>
            <InspectorNumberInput
              value={modifier.noiseSeed}
              min={-10000} max={10000} step={1} decimals={0}
              ariaLabel="Noise seed"
              disabled={!modifier.enabled}
              onChange={(value) => patch({ noiseSeed: value })}
            />
          </InspectorRow>
        </div>
      )}
    </DisplacerGroup>
  );
}
