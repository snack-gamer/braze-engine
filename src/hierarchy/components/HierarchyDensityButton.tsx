import { EditorIcon } from "../../ui/EditorIcon";
import type { HierarchyDensity } from "../hierarchy-density";

type HierarchyDensityButtonProps = {
  density: HierarchyDensity;
  onToggle: () => void;
};

/** Switches Hierarchy rows between the large (maximum) size and compact. */
export function HierarchyDensityButton({ density, onToggle }: HierarchyDensityButtonProps) {
  const compact = density === "compact";
  return (
    <button
      type="button"
      className="icon-button hierarchy-density-button"
      aria-label="Compact rows"
      aria-pressed={compact}
      title={compact ? "Compact rows on — click for large rows" : "Click for compact rows"}
      onClick={onToggle}
    >
      <EditorIcon name="rowDensity" size="control" />
    </button>
  );
}
