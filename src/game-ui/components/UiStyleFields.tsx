import type { UiStyle } from "../domain/ui-document";
import { useImportedAssetCatalog } from "../../assets/application/ImportedAssetCatalogProvider";

/** Empty fields remove an override, restoring inheritance or the base breakpoint. */
export function UiStyleFields({ value, change }: { value: UiStyle; change: (style: UiStyle) => void }) {
  const assets = useImportedAssetCatalog();
  const patch = (key: keyof UiStyle, item: unknown) => { const next = { ...value }; if (item === undefined) delete next[key]; else Object.assign(next, { [key]: item }); change(next); };
  const choices = { layout: ["column", "row", "grid", "overlay"], position: ["flow", "absolute"], align: ["start", "center", "end", "stretch"], justify: ["start", "center", "end", "space-between", "space-around"], overflow: ["visible", "hidden", "auto"], fit: ["contain", "cover", "fill"] };
  return <div className="ui-canvas-fields">
    {Object.entries(choices).map(([key, options]) => <label key={key}>{key}<select aria-label={`UI ${key}`} value={String(value[key as keyof UiStyle] ?? "")} onChange={(event) => patch(key as keyof UiStyle, event.target.value || undefined)}>
      <option value="">Default / inherit</option>{options.map((option) => <option key={option}>{option}</option>)}
    </select></label>)}
    {(["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "left", "right", "top", "bottom"] as const).map((key) => <label key={key}>{key}<input aria-label={`UI ${key}`} key={`${key}-${value[key]}`} defaultValue={String(value[key] ?? "")} placeholder="inherit · px · % · auto"
      onBlur={(event) => { const input = event.target.value; patch(key, input === "" ? undefined : /^-?\d+(\.\d+)?$/.test(input) ? Number(input) : input); }} /></label>)}
    {(["gap", "padding", "radius", "fontSize", "fontWeight", "columns", "cellMin", "grow"] as const).map((key) => <label key={key}>{key}<input aria-label={`UI ${key}`} type="number" value={value[key] ?? ""}
      onChange={(event) => patch(key, event.target.value === "" ? undefined : event.target.valueAsNumber)} /></label>)}
    {(["background", "color", "borderColor"] as const).map((key) => <label key={key}>{key}<input aria-label={`UI ${key}`} defaultValue={value[key] ?? ""} key={`${key}-${value[key]}`}
      onBlur={(event) => patch(key, event.target.value || undefined)} /></label>)}
    <label>Font asset<select aria-label="UI font asset" value={value.font?.guid ?? ""} onChange={(event) => patch("font", event.target.value ? { guid: event.target.value } : undefined)}>
      <option value="">Inherit / system font</option>
      {value.font && !assets.some((asset) => asset.guid === value.font!.guid) && <option value={value.font.guid}>Missing font · {value.font.guid}</option>}
      {assets.filter((asset) => asset.kind === "font" && asset.guid).map((asset) => <option key={asset.guid} value={asset.guid}>{asset.filename}</option>)}
    </select></label>
  </div>;
}
