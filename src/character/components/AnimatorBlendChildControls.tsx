import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import { EditorIcon } from "../../ui/EditorIcon";
import type { AnimatorParameter } from "../domain/animator-parameters";
import type { AnimatorBlendTree, AnimatorMotion } from "../domain/blend-tree";
import {
  moveAnimatorBlendChild,
  patchAnimatorBlendChild,
  removeAnimatorBlendChild,
  type AnimatorMotionPath,
} from "../application/animator-motion-authoring";

type BlendChild = AnimatorBlendTree["children"][number];

type AnimatorBlendChildControlsProps = Readonly<{
  rootMotion: AnimatorMotion | null;
  treePath: AnimatorMotionPath;
  child: BlendChild;
  index: number;
  childCount: number;
  numericParameters: readonly AnimatorParameter[];
  onChange: (motion: AnimatorMotion | null) => void;
}>;

export function AnimatorBlendChildControls({
  rootMotion,
  treePath,
  child,
  index,
  childCount,
  numericParameters,
  onChange,
}: AnimatorBlendChildControlsProps) {
  const patch = (next: Parameters<typeof patchAnimatorBlendChild>[3]) => (
    onChange(patchAnimatorBlendChild(rootMotion, treePath, child.id, next))
  );
  return (
    <div className="animator-blend-child__settings">
      <div className="animator-blend-child__actions">
        <button
          type="button"
          className="icon-button compact"
          disabled={index === 0}
          title="Move child up"
          onClick={() => onChange(moveAnimatorBlendChild(rootMotion, treePath, child.id, -1))}
        >↑</button>
        <button
          type="button"
          className="icon-button compact"
          disabled={index === childCount - 1}
          title="Move child down"
          onClick={() => onChange(moveAnimatorBlendChild(rootMotion, treePath, child.id, 1))}
        >↓</button>
        <button
          type="button"
          className="icon-button compact danger"
          title="Delete blend child"
          onClick={() => onChange(removeAnimatorBlendChild(rootMotion, treePath, child.id))}
        ><EditorIcon name="delete" size="row-action" /></button>
      </div>
      <label>Child Speed<InspectorNumberInput
        step={0.05}
        decimals={2}
        value={child.timeScale}
        ariaLabel="Blend child speed"
        onChange={(timeScale) => {
          if (Number.isFinite(timeScale) && timeScale !== 0) patch({ timeScale });
        }}
      /></label>
      {"threshold" in child && <label>Threshold<InspectorNumberInput
        step={0.05}
        decimals={2}
        value={child.threshold}
        ariaLabel="Blend child threshold"
        onChange={(threshold) => patch({ threshold })}
      /></label>}
      {"position" in child && (
        <div className="animator-blend-child__position">
          <label>X<InspectorNumberInput step={0.05} decimals={2} value={child.position[0]} ariaLabel="Blend child X" onChange={(x) => patch({
            position: [x, child.position[1]],
          })} /></label>
          <label>Y<InspectorNumberInput step={0.05} decimals={2} value={child.position[1]} ariaLabel="Blend child Y" onChange={(y) => patch({
            position: [child.position[0], y],
          })} /></label>
        </div>
      )}
      {"weightParameterId" in child && <label>Weight Parameter<select
        value={child.weightParameterId}
        onChange={(event) => patch({ weightParameterId: event.currentTarget.value })}
      >{numericParameters.map((parameter) => (
        <option key={parameter.id} value={parameter.id}>{parameter.name}</option>
      ))}</select></label>}
      <label><input
        type="checkbox"
        checked={child.mirror}
        onChange={(event) => patch({ mirror: event.currentTarget.checked })}
      /> Mirror</label>
    </div>
  );
}
