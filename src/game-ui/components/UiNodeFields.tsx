import { useImportedAssetCatalog } from "../../assets/application/ImportedAssetCatalogProvider";
import type { UiNode } from "../domain/ui-document";

export function UiNodeFields({ node, change }: { node: UiNode; change: (patch: Partial<UiNode>) => void }) {
  const assets = useImportedAssetCatalog();
  return <div className="ui-canvas-fields">
    <label>Text <input aria-label="UI text" value={node.text ?? ""} onChange={(event) => change({ text: event.target.value })} /></label>
    <label>Accessible label <input aria-label="UI accessible label" value={node.label ?? ""} onChange={(event) => change({ label: event.target.value })} /></label>
    {["button", "input", "toggle", "slider"].includes(node.kind) && <label>Action <input aria-label="UI action" value={node.action ?? ""} onChange={(event) => change({ action: event.target.value || undefined })} /></label>}
    <label>Visible <input aria-label="UI visible" type="checkbox" checked={node.visible !== false} onChange={(event) => change({ visible: event.target.checked })} /></label>
    <label>Disabled <input aria-label="UI disabled" type="checkbox" checked={node.disabled === true} onChange={(event) => change({ disabled: event.target.checked })} /></label>
    {node.kind === "toggle" && <label>Checked <input aria-label="UI checked" type="checkbox" checked={node.value === true} onChange={(event) => change({ value: event.target.checked })} /></label>}
    {node.kind === "input" && <label>Value <input aria-label="UI value" value={String(node.value ?? "")} onChange={(event) => change({ value: event.target.value })} /></label>}
    {["slider", "progress"].includes(node.kind) && <label>Value <input aria-label="UI value" type="number" min={node.min ?? 0} max={node.max ?? 1} step={node.step ?? 0.01} value={Number(node.value ?? 0)} onChange={(event) => change({ value: event.target.valueAsNumber })} /></label>}
    {node.kind === "image" && <label>Image asset<select aria-label="UI image asset" value={node.image?.guid ?? ""} onChange={(event) => change({ image: event.target.value ? { guid: event.target.value } : undefined })}>
      <option value="">Choose an imported image</option>
      {node.image && !assets.some((asset) => asset.guid === node.image!.guid) && <option value={node.image.guid}>Missing image · {node.image.guid}</option>}
      {assets.filter((asset) => asset.kind === "image" && asset.guid).map((asset) => <option key={asset.guid} value={asset.guid}>{asset.filename}</option>)}
    </select></label>}
  </div>;
}
