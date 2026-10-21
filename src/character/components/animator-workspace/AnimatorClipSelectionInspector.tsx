import type { AnimatorLayer } from "../../domain/animator-controller";
import { findAnimatorState } from "../../domain/animator-state-machine";
import {
  inspectorContentClass,
  inspectorHelpClass,
  inspectorSectionClass,
  inspectorTitleClass,
} from "./animator-inspector-classes";

type AnimatorClipSelectionInspectorProps = Readonly<{
  layer: AnimatorLayer;
  stateIds: readonly string[];
}>;

export function AnimatorClipSelectionInspector({ layer, stateIds }: AnimatorClipSelectionInspectorProps) {
  const clips = stateIds.flatMap((stateId) => {
    const state = findAnimatorState(layer, stateId)?.state;
    return state ? [state] : [];
  });
  return <div className={inspectorContentClass}>
    <header className={inspectorTitleClass}>
      <div><small>Clips</small><strong>{clips.length} Clips Selected</strong></div>
    </header>
    <section className={inspectorSectionClass}>
      <header><strong>Selection</strong><span>Multi-select</span></header>
      <div className="animator-multi-clip-list">
        {clips.map((clip) => <span key={clip.id}>{clip.name}</span>)}
      </div>
      <p className={inspectorHelpClass}>Select one Clip to edit its properties.</p>
    </section>
  </div>;
}
