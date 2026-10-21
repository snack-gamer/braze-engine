import { InspectorColor } from "../InspectorColor";
import { InspectorRow } from "../InspectorRow";
import { InspectorSlider } from "../InspectorSlider";
import type { SceneObject } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { WATER_PRESETS, resolveWaterSettings } from "../../water/settings";
import type { WaterPreset, WaterQuality, WaterReflectionResolution, WaterSettings } from "../../water/types";
import { useInspectorSectionOpen } from "./InspectorSection";
import { SceneComponentIdentity } from "./SceneComponentPresentation";

const SURFACE_DETAILS: { label: string; value: WaterReflectionResolution }[] = [
  { label: "Low", value: 256 },
  { label: "Medium", value: 512 },
  { label: "High", value: 1024 },
];
const PRESETS: WaterPreset[] = ["calm", "ocean", "storm"];
const QUALITY_OPTIONS: { label: string; value: WaterQuality }[] = [
  { label: "Auto", value: "auto" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

type WaterSectionProps = {
  object: SceneObject;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

export function WaterComponentEditor({ object, updateObject }: WaterSectionProps) {
  const water = resolveWaterSettings(object.water);
  const [open, setOpen] = useInspectorSectionOpen("component.waterSurface", false);
  const oceanSize = Math.max(8, object.scale[0] * 24);
  const patch = (value: Partial<WaterSettings>) => {
    updateObject(object.id, { water: { ...water, ...value } });
  };
  const patchSize = (size: number) => {
    const scale = size / 24;
    updateObject(object.id, { scale: [scale, 1, scale] });
  };

  return (
    <div className="component-card water-component-card">
      <div className="component-card__head">
        <button
          className="icon-button motion-pulse-disclosure"
          type="button"
          title={open ? "Collapse Water Surface" : "Expand Water Surface"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <EditorIcon name={open ? "disclosureOpen" : "disclosureClosed"} size="control" />
        </button>
        <span className="component-card__title">
          <SceneComponentIdentity
            componentId="waterSurface"
            details={<small>Gerstner swell + chop</small>}
          />
        </span>
        <button
          className="icon-button danger"
          type="button"
          title="Remove component"
          onClick={() => updateObject(object.id, { water: undefined })}
        >
          <EditorIcon name="delete" size="control" />
        </button>
      </div>

      {open && (
        <div className="water-component-body">
          <InspectorRow label="Preset">
            <select
              value={water.preset}
              onChange={(event) => updateObject(object.id, { water: WATER_PRESETS[event.target.value as WaterPreset] })}
            >
              {PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </InspectorRow>

          <InspectorRow label="Ocean size">
            <InspectorSlider
              value={oceanSize}
              min={8}
              max={240}
              step={1}
              decimals={0}
              unit="u"
              ariaLabel="Ocean size"
              onChange={patchSize}
            />
          </InspectorRow>

          <div className="rail-subheading">Performance</div>
          <InspectorRow label="Quality">
            <select value={water.quality} onChange={(event) => patch({ quality: event.target.value as WaterQuality })}>
              {QUALITY_OPTIONS.map((quality) => (
                <option key={quality.value} value={quality.value}>
                  {quality.label}
                </option>
              ))}
            </select>
          </InspectorRow>
          <InspectorRow label="Mesh budget">
            <select
              value={water.reflectionResolution}
              onChange={(event) =>
                patch({ reflectionResolution: Number(event.target.value) as WaterReflectionResolution })
              }
            >
              {SURFACE_DETAILS.map((detail) => (
                <option key={detail.value} value={detail.value}>
                  {detail.label}
                </option>
              ))}
            </select>
          </InspectorRow>

          <div className="rail-subheading">Color</div>
          <InspectorRow label="Surface">
            <InspectorColor value={water.waterColor} ariaLabel="Surface color" onChange={(value) => patch({ waterColor: value })} />
          </InspectorRow>
          <InspectorRow label="Deep">
            <InspectorColor value={water.deepColor} ariaLabel="Deep color" onChange={(value) => patch({ deepColor: value })} />
          </InspectorRow>
          <InspectorRow label="Opacity">
            <InspectorSlider
              value={water.opacity * 100}
              min={20} max={100} step={1} decimals={0} unit="%" ariaLabel="Opacity"
              onChange={(value) => patch({ opacity: value / 100 })}
            />
          </InspectorRow>
          <InspectorRow label="Depth tint">
            <InspectorSlider
              value={water.depthBlend * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Depth tint"
              onChange={(value) => patch({ depthBlend: value / 100 })}
            />
          </InspectorRow>

          <div className="rail-subheading">Swell</div>
          <InspectorRow label="Height">
            <InspectorSlider
              value={water.waveHeight}
              min={0} max={5} step={0.05} decimals={2} unit="m" ariaLabel="Swell height"
              onChange={(value) => patch({ waveHeight: value })}
            />
          </InspectorRow>
          <InspectorRow label="Detail">
            <InspectorSlider
              value={water.waveScale}
              min={0.1} max={2} step={0.01} decimals={2} ariaLabel="Swell detail"
              onChange={(value) => patch({ waveScale: value })}
            />
          </InspectorRow>
          <InspectorRow label="Choppiness">
            <InspectorSlider
              value={(water.distortion / 18) * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Choppiness"
              onChange={(value) => patch({ distortion: (value / 100) * 18 })}
            />
          </InspectorRow>
          <InspectorRow label="Speed">
            <InspectorSlider
              value={water.waveSpeed}
              min={0} max={2} step={0.01} decimals={2} ariaLabel="Wave speed"
              onChange={(value) => patch({ waveSpeed: value })}
            />
          </InspectorRow>

          <div className="rail-subheading">Chop</div>
          <InspectorRow label="Strength">
            <InspectorSlider
              value={(water.chopStrength / 1.5) * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Chop strength"
              onChange={(value) => patch({ chopStrength: (value / 100) * 1.5 })}
            />
          </InspectorRow>
          <InspectorRow label="Height">
            <InspectorSlider
              value={water.chopHeight}
              min={0} max={3} step={0.05} decimals={2} ariaLabel="Chop height"
              onChange={(value) => patch({ chopHeight: value })}
            />
          </InspectorRow>
          <InspectorRow label="Frequency">
            <InspectorSlider
              value={water.chopScale}
              min={0.2} max={3} step={0.05} decimals={2} ariaLabel="Chop frequency"
              onChange={(value) => patch({ chopScale: value })}
            />
          </InspectorRow>

          <div className="rail-subheading">Surface</div>
          <InspectorRow label="Wind">
            <InspectorSlider
              value={water.windDirection}
              min={0} max={359} step={1} decimals={0} unit="°" ariaLabel="Wind direction"
              onChange={(value) => patch({ windDirection: value })}
            />
          </InspectorRow>
          <InspectorRow label="Ripples">
            <InspectorSlider
              value={water.rippleStrength * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Ripple strength"
              onChange={(value) => patch({ rippleStrength: value / 100 })}
            />
          </InspectorRow>
          <InspectorRow label="Gloss">
            <InspectorSlider
              value={(1 - water.roughness) * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Gloss"
              onChange={(value) => patch({ roughness: 1 - value / 100 })}
            />
          </InspectorRow>
          <InspectorRow label="Highlight">
            <InspectorSlider
              value={water.highlightSize * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Highlight size"
              onChange={(value) => patch({ highlightSize: value / 100 })}
            />
          </InspectorRow>
          <InspectorRow label="Sun">
            <InspectorSlider
              value={water.sunStrength}
              min={0} max={2} step={0.01} decimals={2} ariaLabel="Sun strength"
              onChange={(value) => patch({ sunStrength: value })}
            />
          </InspectorRow>
          <InspectorRow label="Wetness">
            <InspectorSlider
              value={(water.wetness / 1.5) * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Wetness"
              onChange={(value) => patch({ wetness: (value / 100) * 1.5 })}
            />
          </InspectorRow>

          <div className="rail-subheading">Peak foam</div>
          <InspectorRow label="Amount">
            <InspectorSlider
              value={water.peakFoam * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Peak foam amount"
              onChange={(value) => patch({ peakFoam: value / 100 })}
            />
          </InspectorRow>
          <InspectorRow label="Blend">
            <InspectorSlider
              value={water.peakFoamBlend * 100}
              min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Peak foam blend"
              onChange={(value) => patch({ peakFoamBlend: value / 100 })}
            />
          </InspectorRow>
          <InspectorRow label="Color">
            <InspectorColor
              value={water.peakFoamColor}
              ariaLabel="Peak foam color"
              onChange={(value) => patch({ peakFoamColor: value })}
            />
          </InspectorRow>
        </div>
      )}
    </div>
  );
}
