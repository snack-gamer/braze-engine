import type { ReactNode } from "react";
import type { AnimatorParameter } from "../domain/animator-parameters";
import type { AnimatorBlendTree, AnimatorMotion } from "../domain/blend-tree";
import {
  patchAnimatorBlendTree,
  type AnimatorMotionPath,
} from "../application/animator-motion-authoring";
import { AnimatorBlendChildControls } from "./AnimatorBlendChildControls";

type AnimatorBlendTreeEditorProps = Readonly<{
  rootMotion: AnimatorMotion | null;
  path: AnimatorMotionPath;
  tree: AnimatorBlendTree;
  numericParameters: readonly AnimatorParameter[];
  selectedChildId?: string;
  onChange: (motion: AnimatorMotion | null) => void;
  renderNested: (childId: string) => ReactNode;
}>;

export function AnimatorBlendTreeEditor({
  rootMotion,
  path,
  tree,
  numericParameters,
  selectedChildId,
  onChange,
  renderNested,
}: AnimatorBlendTreeEditorProps) {
  const patchTree = (patch: Parameters<typeof patchAnimatorBlendTree>[2]) => (
    onChange(patchAnimatorBlendTree(rootMotion, path, patch))
  );
  return (
    <div className="animator-blend-tree-editor">
      <div className="animator-blend-tree-editor__parameters">
        {tree.kind === "1d" && (
          <ParameterSelect
            label="Blend Parameter"
            value={tree.parameterId}
            parameters={numericParameters}
            onChange={(parameterId) => patchTree({ parameterId })}
          />
        )}
        {tree.kind !== "1d" && tree.kind !== "direct" && (
          <>
            <ParameterSelect
              label="X Parameter"
              value={tree.parameterXId}
              parameters={numericParameters}
              disabledId={tree.parameterYId}
              onChange={(parameterXId) => patchTree({ parameterXId })}
            />
            <ParameterSelect
              label="Y Parameter"
              value={tree.parameterYId}
              parameters={numericParameters}
              disabledId={tree.parameterXId}
              onChange={(parameterYId) => patchTree({ parameterYId })}
            />
          </>
        )}
        {tree.kind === "direct" && (
          <label className="animator-blend-tree-editor__normalize"><input
            type="checkbox"
            checked={tree.normalizeWeights}
            onChange={(event) => patchTree({ normalizeWeights: event.currentTarget.checked })}
          /> Normalize Weights</label>
        )}
      </div>
      <div className="animator-blend-tree-editor__motions">
        <div className="animator-blend-tree-editor__children-head">
          <span>Motions <small>{tree.children.length}</small></span>
        </div>
        <div className="animator-blend-tree-editor__children">
          {tree.children.map((child, index) => (
            <details
              key={child.id}
              className="animator-blend-child"
              open={child.id === selectedChildId || undefined}
            >
              <summary>Motion {index + 1}<small>{child.motion.kind === "clip" ? "Clip" : "Blend Tree"}</small></summary>
              <AnimatorBlendChildControls
                rootMotion={rootMotion}
                treePath={path}
                child={child}
                index={index}
                childCount={tree.children.length}
                numericParameters={numericParameters}
                onChange={onChange}
              />
              {renderNested(child.id)}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParameterSelect({
  label,
  value,
  parameters,
  disabledId,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  parameters: readonly AnimatorParameter[];
  disabledId?: string;
  onChange: (id: string) => void;
}>) {
  return (
    <label>{label}<select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
      {parameters.map((parameter) => (
        <option key={parameter.id} value={parameter.id} disabled={parameter.id === disabledId}>
          {parameter.name}
        </option>
      ))}
    </select></label>
  );
}
