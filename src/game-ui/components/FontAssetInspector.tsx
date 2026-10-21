import type { LibraryAsset } from "../../lib/asset-api";
import { createUiCanvas } from "../domain/ui-document";
import { UiPreview } from "./UiPreview";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";

export default function FontAssetInspector({ asset, onReveal, onDelete, usageCount }: { asset: LibraryAsset; onReveal: () => void; onDelete: () => void; usageCount: number }) {
  const document = createUiCanvas();
  return <div className="rail-scroll"><h3><EditorIcon name={assetIconNames.font} /> {asset.name}</h3>
    <p>Font · {asset.filename}</p><p>{asset.guid} · {(asset.sizeBytes / 1024).toFixed(1)} KB</p>
    <UiPreview document={{ ...document, root: { ...document.root, style: { ...document.root.style, font: asset.guid ? { guid: asset.guid } : undefined }, children: [
      { id: "sample", kind: "text", text: "The quick brown fox\n0123456789 Aa Bb Cc", style: { color: "#ffffff", fontSize: 42 } },
    ] } }} onSelect={() => undefined} />
    <p>{usageCount} current scene references. Deleting keeps references for recovery; restore both the source and its .braze.meta file.</p>
    <button onClick={onReveal}>Reveal source</button><button onClick={() => { if (window.confirm(`Delete font ${asset.name}? ${usageCount} current scene references will become missing.`)) onDelete(); }}>Delete font</button>
  </div>;
}
