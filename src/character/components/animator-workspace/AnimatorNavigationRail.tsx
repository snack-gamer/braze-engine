import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import type { AnimatorPreview } from "./useAnimatorPreview";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import { AnimatorLayerRail } from "./AnimatorLayerRail";
import { AnimatorParameterRail } from "./AnimatorParameterRail";

type AnimatorNavigationRailProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  selection: AnimatorWorkspaceSelection;
  preview: AnimatorPreview;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
  onChange: (controller: AnimatorController) => void;
}>;

export function AnimatorNavigationRail(props: AnimatorNavigationRailProps) {
  return (
    <aside className="animator-workspace__rail" aria-label="Animator layers and parameters">
      <AnimatorLayerRail
        controller={props.controller}
        layer={props.layer}
        onSelect={props.onSelect}
        onChange={props.onChange}
      />
      <AnimatorParameterRail
        controller={props.controller}
        layerId={props.layer.id}
        selection={props.selection}
        preview={props.preview}
        onSelect={props.onSelect}
        onChange={props.onChange}
      />
    </aside>
  );
}
