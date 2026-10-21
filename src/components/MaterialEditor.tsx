import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { EditorIcon } from "../ui/EditorIcon";
import { InspectorColor } from "./InspectorColor";
import { InspectorRow } from "./InspectorRow";
import { InspectorSlider } from "./InspectorSlider";
import { InspectorToggle } from "./InspectorToggle";
import type { Material } from "../types";
import type { LibraryAsset } from "../lib/api";
import { InspectorSection } from "./scene/InspectorSection";
import { PanelHeader } from "./scene/PanelHeader";
import { TextureSlotControl } from "./material-editor/TextureSlotControl";
import { DerivedMapTools } from "./material-editor/DerivedMapTools";
import { TEXTURE_SLOTS } from "./material-editor/types";
import "./material-editor/MaterialEditor.css";

type MaterialEditorProps = {
  material: Material;
  imageAssets: LibraryAsset[];
  update: (patch: Partial<Material>) => void;
  remove: () => void;
};

type ChannelId =
  | "color"
  | "reflection"
  | "coat"
  | "transparency"
  | "emission"
  | "normal"
  | "occlusion"
  | "alpha"
  | "settings";

const CHANNELS: Array<{ id: ChannelId; label: string; icon: ReactNode }> = [
  { id: "color", label: "Color", icon: <EditorIcon name="materialColor" size="compact" /> },
  { id: "reflection", label: "Reflection", icon: <EditorIcon name="materialReflection" size="compact" /> },
  { id: "coat", label: "Coat", icon: <EditorIcon name="materialCoat" size="compact" /> },
  { id: "transparency", label: "Transparency", icon: <EditorIcon name="materialTransparency" size="compact" /> },
  { id: "emission", label: "Emission", icon: <EditorIcon name="materialEmission" size="compact" /> },
  { id: "normal", label: "Normal", icon: <EditorIcon name="normalMap" size="compact" /> },
  { id: "occlusion", label: "Occlusion", icon: <EditorIcon name="materialOcclusion" size="compact" /> },
  { id: "alpha", label: "Alpha", icon: <EditorIcon name="materialAlpha" size="compact" /> },
  { id: "settings", label: "Settings", icon: <EditorIcon name="materialSettings" size="compact" /> },
];

function channelEnabled(material: Material, id: ChannelId): boolean {
  if (id === "color") return true;
  if (id === "reflection") return material.roughness < 1 || material.metalness > 0 || Boolean(material.roughnessTextureUrl || material.metalnessTextureUrl);
  if (id === "coat") return material.clearcoat > 0;
  if (id === "transparency") return material.opacity < 1 || material.transmission > 0;
  if (id === "emission") return material.emissiveIntensity > 0 || Boolean(material.emissiveTextureUrl);
  if (id === "normal") return Boolean(material.normalTextureUrl || material.bumpTextureUrl) || material.normalScale !== 1 || material.bumpScale !== 0.05;
  if (id === "occlusion") return Boolean(material.aoTextureUrl);
  if (id === "alpha") return Boolean(material.alphaTextureUrl) || material.opacity < 1;
  return true;
}

export function MaterialEditor({ material, imageAssets, update, remove }: MaterialEditorProps) {
  const [activeChannel, setActiveChannel] = useState<ChannelId>("color");
  const activeChannelConfig = CHANNELS.find((channel) => channel.id === activeChannel) ?? CHANNELS[0];
  const previewStyle = useMemo(
    () => ({
      "--material-preview-color": material.color,
      "--material-preview-image": material.baseColorTextureUrl ? `url("${material.baseColorTextureUrl}")` : "none",
    }) as CSSProperties,
    [material.baseColorTextureUrl, material.color],
  );

  const textureSlot = (slot: (typeof TEXTURE_SLOTS)[string]) => (
    <TextureSlotControl material={material} imageAssets={imageAssets} slot={slot} update={update} />
  );

  const renderChannel = () => {
    if (activeChannel === "color") {
      return (
        <div className="brdf-channel-panel">
          <MaterialColorRow
            label="Base color"
            value={material.color}
            onChange={(value) => update({ color: value })}
          />
          {textureSlot(TEXTURE_SLOTS.base)}
        </div>
      );
    }
    if (activeChannel === "reflection") {
      return (
        <div className="brdf-channel-panel">
          <InspectorRow label="Roughness">
            <InspectorSlider value={material.roughness} min={0} max={1} step={0.01} ariaLabel="Roughness" onChange={(roughness) => update({ roughness })} />
          </InspectorRow>
          <InspectorRow label="Metalness">
            <InspectorSlider value={material.metalness} min={0} max={1} step={0.01} ariaLabel="Metalness" onChange={(metalness) => update({ metalness })} />
          </InspectorRow>
          <InspectorRow label="Specular">
            <InspectorSlider value={material.specularIntensity} min={0} max={1} step={0.01} ariaLabel="Specular" onChange={(specularIntensity) => update({ specularIntensity })} />
          </InspectorRow>
          <InspectorRow label="Environment">
            <InspectorSlider value={material.envMapIntensity} min={0} max={4} step={0.05} ariaLabel="Environment" onChange={(envMapIntensity) => update({ envMapIntensity })} />
          </InspectorRow>
          {textureSlot(TEXTURE_SLOTS.roughness)}
          {textureSlot(TEXTURE_SLOTS.metalness)}
        </div>
      );
    }
    if (activeChannel === "coat") {
      return (
        <div className="brdf-channel-panel">
          <InspectorRow label="Clearcoat">
            <InspectorSlider value={material.clearcoat} min={0} max={1} step={0.01} ariaLabel="Clearcoat" onChange={(clearcoat) => update({ clearcoat })} />
          </InspectorRow>
          <InspectorRow label="Coat rough">
            <InspectorSlider value={material.clearcoatRoughness} min={0} max={1} step={0.01} ariaLabel="Coat roughness" onChange={(clearcoatRoughness) => update({ clearcoatRoughness })} />
          </InspectorRow>
          <InspectorRow label="Sheen">
            <InspectorSlider value={material.sheen} min={0} max={1} step={0.01} ariaLabel="Sheen" onChange={(sheen) => update({ sheen })} />
          </InspectorRow>
          <InspectorRow label="Sheen rough">
            <InspectorSlider value={material.sheenRoughness} min={0} max={1} step={0.01} ariaLabel="Sheen roughness" onChange={(sheenRoughness) => update({ sheenRoughness })} />
          </InspectorRow>
          <MaterialColorRow label="Sheen color" value={material.sheenColor} onChange={(sheenColor) => update({ sheenColor })} />
        </div>
      );
    }
    if (activeChannel === "transparency") {
      return (
        <div className="brdf-channel-panel">
          <InspectorRow label="Opacity">
            <InspectorSlider value={material.opacity * 100} min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Opacity" onChange={(value) => update({ opacity: value / 100 })} />
          </InspectorRow>
          <InspectorRow label="Transmission">
            <InspectorSlider value={material.transmission * 100} min={0} max={100} step={1} decimals={0} unit="%" ariaLabel="Transmission" onChange={(value) => update({ transmission: value / 100 })} />
          </InspectorRow>
          <InspectorRow label="Thickness">
            <InspectorSlider value={material.thickness} min={0} max={10} step={0.05} ariaLabel="Thickness" onChange={(thickness) => update({ thickness })} />
          </InspectorRow>
          <InspectorRow label="IOR">
            <InspectorSlider value={material.ior} min={1} max={2.33} step={0.01} ariaLabel="IOR" onChange={(ior) => update({ ior })} />
          </InspectorRow>
        </div>
      );
    }
    if (activeChannel === "emission") {
      return (
        <div className="brdf-channel-panel">
          <MaterialColorRow label="Emission" value={material.emissive} onChange={(emissive) => update({ emissive })} />
          <InspectorRow label="Intensity">
            <InspectorSlider value={material.emissiveIntensity} min={0} max={20} step={0.05} ariaLabel="Emission intensity" onChange={(emissiveIntensity) => update({ emissiveIntensity })} />
          </InspectorRow>
          {textureSlot(TEXTURE_SLOTS.emissive)}
        </div>
      );
    }
    if (activeChannel === "normal") {
      return (
        <div className="brdf-channel-panel">
          <InspectorRow label="Strength">
            <InspectorSlider value={material.normalScale} min={-2} max={2} step={0.01} ariaLabel="Normal strength" onChange={(normalScale) => update({ normalScale })} />
          </InspectorRow>
          <InspectorRow label="Bump">
            <InspectorSlider value={material.bumpScale} min={-0.5} max={0.5} step={0.005} ariaLabel="Bump" onChange={(bumpScale) => update({ bumpScale })} />
          </InspectorRow>
          {textureSlot(TEXTURE_SLOTS.normal)}
          {textureSlot(TEXTURE_SLOTS.bump)}
          <DerivedMapTools material={material} imageAssets={imageAssets} update={update} />
        </div>
      );
    }
    if (activeChannel === "occlusion") {
      return (
        <div className="brdf-channel-panel">
          <InspectorRow label="Strength">
            <InspectorSlider value={material.aoIntensity} min={0} max={4} step={0.05} ariaLabel="AO strength" onChange={(aoIntensity) => update({ aoIntensity })} />
          </InspectorRow>
          {textureSlot(TEXTURE_SLOTS.ao)}
        </div>
      );
    }
    if (activeChannel === "alpha") {
      return (
        <div className="brdf-channel-panel">
          <InspectorRow label="Cutoff">
            <InspectorSlider value={material.alphaCutoff} min={0} max={1} step={0.01} ariaLabel="Alpha cutoff" onChange={(alphaCutoff) => update({ alphaCutoff })} />
          </InspectorRow>
          {textureSlot(TEXTURE_SLOTS.alpha)}
        </div>
      );
    }
    return (
      <div className="brdf-channel-panel">
        <InspectorRow label="Side">
          <select
            value={material.side}
            onChange={(event) => update({ side: event.target.value as Material["side"] })}
          >
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="double">Double</option>
          </select>
        </InspectorRow>
        <InspectorRow label="Wireframe">
          <InspectorToggle
            checked={material.wireframe}
            ariaLabel="Wireframe"
            onChange={(checked) => update({ wireframe: checked })}
          />
        </InspectorRow>
      </div>
    );
  };

  return (
    <div className="rail-scroll">
      <PanelHeader
        title="Material"
        tone="mesh"
        icon={<EditorIcon name="material" size="control" />}
        actions={(
          <button
            type="button"
            className="icon-button danger"
            onClick={() => {
              if (window.confirm(`Delete "${material.name}"?`)) remove();
            }}
            title="Delete material"
          >
            <EditorIcon name="delete" size="control" />
          </button>
        )}
      />
      <InspectorSection
        id="library.material"
        title="Surface"
        defaultOpen
      >
        <div className="brdf-editor">
          <div className="brdf-header">
            <div className="brdf-preview" style={previewStyle} aria-hidden="true">
              <div className="brdf-preview__sphere" />
            </div>

            <div className="brdf-header__body">
              <label className="field brdf-name">
                <span>Name</span>
                <input value={material.name} onChange={(event) => update({ name: event.target.value })} />
              </label>
              <div className="brdf-header__meta">
                <span>{material.side}</span>
                <span>{material.opacity < 1 ? "Transparent" : "Opaque"}</span>
                <span>{material.baseColorTextureUrl ? "Textured" : "Solid"}</span>
              </div>
            </div>
          </div>

          <div className="brdf-workbench">
            <div className="brdf-channel-list" role="tablist" aria-label="Material channels">
              {CHANNELS.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className={activeChannel === channel.id ? "active" : ""}
                  onClick={() => setActiveChannel(channel.id)}
                  role="tab"
                  aria-selected={activeChannel === channel.id}
                >
                  <span className={channelEnabled(material, channel.id) ? "brdf-channel-dot enabled" : "brdf-channel-dot"} />
                  {channel.icon}
                  <strong>{channel.label}</strong>
                </button>
              ))}
            </div>
            <div className="brdf-channel-surface">
              <div className="brdf-channel-title">
                {activeChannelConfig.icon}
                <strong>{activeChannelConfig.label}</strong>
              </div>
              {renderChannel()}
            </div>
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}

function MaterialColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <InspectorRow label={label}>
      <InspectorColor value={value} ariaLabel={label} onChange={onChange} />
    </InspectorRow>
  );
}
