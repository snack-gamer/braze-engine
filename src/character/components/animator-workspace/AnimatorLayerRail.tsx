import { EditorIcon } from "../../../ui/EditorIcon";
import { addAnimatorLayer } from "../../application/animator-controller-authoring";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";

type AnimatorLayerRailProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
  onChange: (controller: AnimatorController) => void;
}>;

export function AnimatorLayerRail({
  controller,
  layer,
  onSelect,
  onChange,
}: AnimatorLayerRailProps) {
  return (
    <section className="animator-rail-section">
      <header><strong>Layers</strong><button
        type="button"
        className="icon-button compact"
        title="Add layer"
        onClick={() => {
          const next = addAnimatorLayer(controller);
          const added = next.layers[next.layers.length - 1]!;
          onChange(next);
          onSelect({ kind: "layer", layerId: added.id });
        }}
      ><EditorIcon name="add" size="row-action" /></button></header>
      <div className="animator-rail-list">
        {controller.layers.map((candidate, index) => (
          <button
            type="button"
            key={candidate.id}
            className="animator-rail-row"
            data-selected={candidate.id === layer.id || undefined}
            onClick={() => onSelect({ kind: "layer", layerId: candidate.id })}
          >
            <EditorIcon name="animator" size="row-action" />
            <span>{candidate.name}</span>
            <small>{index === 0 ? "Base" : `${Math.round(candidate.weight * 100)}%`}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
