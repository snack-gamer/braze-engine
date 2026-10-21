import { CatalogPalette } from "../../ui/CatalogPalette";
import type { ResolvedSceneComponentAddition } from "../../scene/presentation/scene-component-registry";

type AddComponentMenuProps = Readonly<{
  additions: readonly ResolvedSceneComponentAddition[];
  onAdd: (addition: ResolvedSceneComponentAddition) => void;
  onClose: () => void;
}>;

export function AddComponentMenu({ additions, onAdd, onClose }: AddComponentMenuProps) {
  return (
    <CatalogPalette
      title="Add Component"
      titleIcon="prefabLink"
      items={additions.map((addition) => ({
        id: addition.id,
        label: addition.label,
        category: addition.category,
        description: addition.unavailableReason ?? addition.description,
        icon: addition.componentIcon,
      }))}
      onSelect={(id) => {
        const addition = additions.find((candidate) => candidate.id === id);
        if (addition) onAdd(addition);
      }}
      onClose={onClose}
    />
  );
}
