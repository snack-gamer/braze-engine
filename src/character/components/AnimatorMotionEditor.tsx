import type { AnimatorParameter } from "../domain/animator-parameters";
import type { AnimatorBlendTree, AnimatorMotion } from "../domain/blend-tree";
import {
  animatorMotionAtPath,
  animatorMotionKind,
  MAX_AUTHORED_MOTION_DEPTH,
  replaceAnimatorMotionAtPath,
  type AnimatorMotionKind,
  type AnimatorMotionPath,
} from "../application/animator-motion-authoring";
import type { ImportedCharacterAssetOption } from "../application/imported-character-assets";
import { AnimatorBlendTreeEditor } from "./AnimatorBlendTreeEditor";
import { AnimatorClipMotionEditor } from "./AnimatorClipMotionEditor";
import "./AnimatorMotionEditor.css";

type AnimatorMotionEditorProps = Readonly<{
  rootMotion: AnimatorMotion | null;
  path?: AnimatorMotionPath;
  clips: readonly ImportedCharacterAssetOption[];
  numericParameters: readonly AnimatorParameter[];
  selectedChildId?: string;
  onChange: (motion: AnimatorMotion | null) => void;
  onRootBlendTypeChange?: (kind: AnimatorBlendTree["kind"]) => void;
  canChangeRootBlendType?: (kind: AnimatorBlendTree["kind"]) => boolean;
}>;

const BLEND_TYPES: ReadonlyArray<Readonly<{
  value: AnimatorBlendTree["kind"];
  label: string;
}>> = [
  { value: "1d", label: "1D Blend Tree" },
  { value: "2dSimpleDirectional", label: "2D Simple Directional" },
  { value: "2dFreeformDirectional", label: "2D Freeform Directional" },
  { value: "2dFreeformCartesian", label: "2D Freeform Cartesian" },
  { value: "direct", label: "Direct Blend Tree" },
];

const CHILD_MOTION_TYPES: ReadonlyArray<Readonly<{
  value: Exclude<AnimatorMotionKind, "none">;
  label: string;
}>> = [
  { value: "clip", label: "Animation Clip" },
  ...BLEND_TYPES,
];

export function AnimatorMotionEditor({
  rootMotion,
  path = [],
  clips,
  numericParameters,
  selectedChildId,
  onChange,
  onRootBlendTypeChange,
  canChangeRootBlendType,
}: AnimatorMotionEditorProps) {
  const motion = animatorMotionAtPath(rootMotion, path);
  const kind = animatorMotionKind(motion);
  const floatParameters = numericParameters.filter((parameter) => parameter.kind === "float");
  const editingRootBlendTree = path.length === 0 && motion?.kind === "blendTree";
  const canCreate2d = floatParameters.length >= 2;
  const changeKind = (nextKind: Exclude<AnimatorMotionKind, "none">) => {
    if (editingRootBlendTree && nextKind !== "clip" && onRootBlendTypeChange) {
      onRootBlendTypeChange(nextKind);
      return;
    }
    const first = floatParameters[0];
    const second = floatParameters.find((parameter) => parameter.id !== first?.id);
    onChange(replaceAnimatorMotionAtPath(rootMotion, path, nextKind, {
      clipRef: clips[0]?.ref,
      parameterId: first?.id,
      parameterYId: second?.id,
    }));
  };
  return (
    <div className="animator-motion-editor" data-depth={path.length}>
      <label className="animator-motion-editor__type">{editingRootBlendTree ? "Blend Type" : "Motion Type"}<select
        aria-label={editingRootBlendTree ? "Blend type" : `Motion type at depth ${path.length}`}
        value={kind}
        onChange={(event) => changeKind(event.currentTarget.value as Exclude<AnimatorMotionKind, "none">)}
      >
        {(editingRootBlendTree ? BLEND_TYPES : CHILD_MOTION_TYPES).map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={
              (editingRootBlendTree
                ? canChangeRootBlendType?.(option.value as AnimatorBlendTree["kind"]) === false
                : (option.value === "clip" && clips.length === 0)
                  || (option.value === "1d" && floatParameters.length === 0)
                  || (option.value.startsWith("2d") && !canCreate2d))
              || (path.length >= MAX_AUTHORED_MOTION_DEPTH && option.value !== "clip")
            }
          >{option.label}</option>
        ))}
      </select></label>
      {motion?.kind === "clip" && (
        <AnimatorClipMotionEditor
          rootMotion={rootMotion}
          path={path}
          motion={motion}
          clips={clips}
          numericParameters={numericParameters}
          onChange={onChange}
        />
      )}
      {motion?.kind === "blendTree" && (
        <AnimatorBlendTreeEditor
          rootMotion={rootMotion}
          path={path}
          tree={motion.tree}
          numericParameters={floatParameters}
          selectedChildId={selectedChildId}
          onChange={onChange}
          renderNested={(childId) => (
            <AnimatorMotionEditor
              rootMotion={rootMotion}
              path={[...path, childId]}
              clips={clips}
              numericParameters={numericParameters}
              onChange={onChange}
            />
          )}
        />
      )}
    </div>
  );
}
