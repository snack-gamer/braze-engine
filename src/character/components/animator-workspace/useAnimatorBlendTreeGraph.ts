import type { DragEvent as ReactDragEvent } from "react";
import type {
  AnimatorGraphEdge,
  AnimatorGraphModel,
  AnimatorGraphNode,
} from "../../application/animator-graph-model";
import { animatorGraphMotionKind } from "../../application/animator-graph-model";
import { addAnimatorBlendChild, createAnimatorMotion } from "../../application/animator-motion-authoring";
import { setScopedAnimatorStateMotion } from "../../application/animator-scoped-state-authoring";
import type { AnimatorController, AnimatorLayer, AnimatorState } from "../../domain/animator-controller";
import type { AnimatorBlendTreeMotion } from "../../domain/blend-tree";
import { evaluateBlendTree1d } from "../../runtime/blend-tree-1d";
import { hasAnimationClipDrag, readAnimationClipDrag } from "../animation-clip-drag-data";
import type { AnimatorPreview } from "./useAnimatorPreview";

type AnimatorBlendTreeGraphInput = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  state?: AnimatorState;
  preview: AnimatorPreview;
  onChange: (controller: AnimatorController) => void;
}>;

/** Adapts one Blend Tree to the shared Animator graph canvas. */
export function useAnimatorBlendTreeGraph(input: AnimatorBlendTreeGraphInput): Readonly<{
  graph: AnimatorGraphModel | undefined;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
}> {
  const motion = input.state?.motion?.kind === "blendTree" ? input.state.motion : undefined;
  const numericParameterId = input.controller.parameters.find((parameter) => parameter.kind === "float")?.id;
  const enabled = Boolean(motion && (motion.tree.kind !== "direct" || numericParameterId));
  return {
    graph: motion && input.state ? blendTreeGraph(input.state, motion, input.preview.values) : undefined,
    onDragOver: (event) => {
      if (!enabled || !hasAnimationClipDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDrop: (event) => {
      if (!enabled || !motion || !input.state) return;
      const clip = readAnimationClipDrag(event.dataTransfer);
      if (!clip) return;
      event.preventDefault();
      event.stopPropagation();
      input.onChange(setScopedAnimatorStateMotion(input.controller, input.layer.id, input.state.id,
        addAnimatorBlendChild(motion, [], {
          motion: createAnimatorMotion("clip", { clipRef: clip.clipRef })!,
          numericParameterId,
        })));
    },
  };
}

function blendTreeGraph(
  state: AnimatorState,
  motion: AnimatorBlendTreeMotion,
  values: AnimatorPreview["values"],
): AnimatorGraphModel {
  const weights = blendTreeWeights(motion, values);
  const childCount = motion.tree.children.length;
  const height = 64 + Math.max(1, childCount) * 96;
  const root: AnimatorGraphNode = {
    id: "root",
    kind: "state",
    motionKind: animatorGraphMotionKind(motion),
    label: state.name,
    subtitle: "Blend Tree",
    x: 64,
    y: height / 2 - 32,
    defaultState: false,
  };
  const children: AnimatorGraphNode[] = motion.tree.children.map((child, index) => ({
      id: child.id,
      kind: "state",
      motionKind: animatorGraphMotionKind(child.motion),
      label: child.motion.kind === "clip" ? child.motion.clipRef.localId ?? "Clip" : "Nested Blend Tree",
      subtitle: "threshold" in child
        ? `${child.threshold}`
        : "position" in child
          ? child.position.join(", ")
          : motion.tree.kind === "direct" ? "Weight" : `${index}`,
      x: 360,
      y: 48 + index * 96,
      previewWeight: motion.tree.kind === "1d" ? weights?.get(child.id) ?? 0 : undefined,
      defaultState: false,
    }));
  const edges: AnimatorGraphEdge[] = children.map((child) => ({
    id: child.id,
    kind: "entry",
    sourceNodeId: root.id,
    destinationNodeId: child.id,
  }));
  return {
    nodes: [root, ...children],
    edges,
    bounds: { x: 64, y: 48, width: 480, height: height - 96 },
    extent: { width: 608, height },
  };
}

function blendTreeWeights(
  motion: AnimatorBlendTreeMotion,
  values: AnimatorPreview["values"],
): ReadonlyMap<string, number> | undefined {
  if (motion.tree.kind !== "1d") return;
  const value = values[motion.tree.parameterId];
  if (typeof value !== "number") return;
  const evaluated = evaluateBlendTree1d(motion.tree.children.map((child) => ({
    motionId: child.id,
    threshold: child.threshold,
  })), value).value ?? [];
  return new Map(evaluated.map((item) => [item.motionId, item.weight]));
}
