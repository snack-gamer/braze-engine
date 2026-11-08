import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorIconName } from "../../ui/icons";
import { toneClassName, type EditorTone } from "../../ui/tones";
import { ASSET_FILTERS } from "./model";
import type { AssetFilter } from "./types";

const filterIcons: Record<AssetFilter, EditorIconName> = {
  all: "listView", scenes: "sceneDocument", models: "assetModel",
  fonts: "assetFont", images: "assetImage", textures: "wireframe",
  materials: "material", prefabs: "assetPrefab", animation: "animationPlayer",
  input: "assetInput", hdris: "assetHdri", favorites: "favorite", recent: "recent",
};
const filterTones: Partial<Record<AssetFilter, EditorTone>> = {
  scenes: "neutral", models: "mesh", materials: "rendering", prefabs: "prefab",
  animation: "animation", input: "physics", hdris: "lighting",
};

/** One compact filter surface shared by search and folder browsing. */
export function AssetFilterBar({ value, onChange }: {
  value: AssetFilter; onChange: (value: AssetFilter) => void;
}) {
  return <div className="assets__filters editor-action-strip" role="group" aria-label="Asset type filters">
    {ASSET_FILTERS.map(({ id, label }) => <button key={id} type="button"
      className="icon-button editor-tooltip" data-tooltip={label === "All" ? "All assets" : label}
      aria-label={id === "all" ? "All assets" : id === "favorites" || id === "recent" ? label : `All ${label}`}
      aria-pressed={value === id} onClick={() => onChange(id)}>
      <EditorIcon name={filterIcons[id]} size="toolbar"
        className={`category-glyph ${toneClassName(filterTones[id] ?? "neutral")}`} />
    </button>)}
  </div>;
}
