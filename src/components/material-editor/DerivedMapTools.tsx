import { useMemo, useState } from "react";
import type { LibraryAsset } from "../../lib/api";
import type { Material } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorSlider } from "../InspectorSlider";
import { generateDerivedMap } from "./derived-maps";

type DerivedMapToolsProps = {
  material: Material;
  imageAssets: LibraryAsset[];
  update: (patch: Partial<Material>) => void;
};

type SourceOption = {
  id: string;
  label: string;
  url: string;
};

export function DerivedMapTools({ material, imageAssets, update }: DerivedMapToolsProps) {
  const [sourceId, setSourceId] = useState("base");
  const [normalStrength, setNormalStrength] = useState(3);
  const [busy, setBusy] = useState<"normal" | "bump" | null>(null);
  const [error, setError] = useState("");
  const sources = useMemo<SourceOption[]>(() => {
    const out: SourceOption[] = [];
    if (material.baseColorTextureUrl) {
      out.push({ id: "base", label: `Base color: ${material.baseColorTextureName ?? "Texture"}`, url: material.baseColorTextureUrl });
    }
    for (const asset of imageAssets) {
      out.push({ id: asset.filename, label: asset.name || asset.filename, url: asset.url });
    }
    return out;
  }, [imageAssets, material.baseColorTextureName, material.baseColorTextureUrl]);
  const source = sources.find((item) => item.id === sourceId) ?? sources[0] ?? null;

  const generate = async (kind: "normal" | "bump") => {
    if (!source) return;
    setBusy(kind);
    setError("");
    try {
      const dataUrl = await generateDerivedMap({
        url: source.url,
        kind,
        strength: normalStrength,
      });
      if (kind === "normal") {
        update({
          normalTextureUrl: dataUrl,
          normalTextureName: `Generated normal from ${source.label}`,
          normalTextureFilename: undefined,
          normalTextureFlipY: false,
        });
      } else {
        update({
          bumpTextureUrl: dataUrl,
          bumpTextureName: `Generated bump from ${source.label}`,
          bumpTextureFilename: undefined,
          bumpTextureFlipY: false,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="brdf-derived-tools">
      <div className="brdf-derived-tools__head">
        <EditorIcon name="normalMap" size="control" />
        <strong>Derive from color image</strong>
      </div>
      <label className="field brdf-derived-tools__source">
        <span>Source</span>
        <select value={source?.id ?? ""} onChange={(event) => setSourceId(event.target.value)} disabled={sources.length === 0}>
          {sources.length === 0 && <option value="">No image textures</option>}
          {sources.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <InspectorSlider
        label="Normal detail"
        value={normalStrength}
        min={0.25}
        max={8}
        step={0.25}
        onChange={setNormalStrength}
      />
      <div className="brdf-derived-tools__actions">
        <button type="button" className="ghost-button" disabled={!source || busy !== null} onClick={() => void generate("normal")}>
          <EditorIcon name="normalMap" size="control" /> {busy === "normal" ? "Generating" : "Normal Map"}
        </button>
        <button type="button" className="ghost-button" disabled={!source || busy !== null} onClick={() => void generate("bump")}>
          <EditorIcon name="bumpMap" size="control" /> {busy === "bump" ? "Generating" : "Bump Map"}
        </button>
      </div>
      {error && <div className="brdf-derived-tools__error">{error}</div>}
    </div>
  );
}
