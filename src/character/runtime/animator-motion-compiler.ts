import type { AssetRef } from "../../assets/domain/asset-reference";
import type { AnimatorMotion } from "../domain/blend-tree";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type { RuntimeAnimatorMotion } from "./animator-runtime";
import { validateBlendTree2dLayout } from "./blend-tree-2d";
import {
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";

export const MAX_COMPILED_BLEND_TREE_DEPTH = ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth;
const MAX_COMPILED_MOTION_NODES = ANIMATOR_DOCUMENT_LIMITS.motionNodesPerState;

export type AnimatorClipRuntimeMetadata = Readonly<{
  durationSeconds: number;
  looping: boolean;
}>;

export type AnimatorClipDurationResolver = (
  clipRef: AssetRef,
) => AnimatorClipRuntimeMetadata | number | undefined;

export type CompiledAnimatorMotion = Readonly<{
  motion: RuntimeAnimatorMotion | null;
  durationSeconds: number;
  looping: boolean;
}>;

export function compileAnimatorMotion(
  source: AnimatorMotion | null,
  clipMetadata: AnimatorClipDurationResolver,
): CharacterRuntimeResult<CompiledAnimatorMotion> {
  const context: CompileMotionContext = {
    active: new WeakSet<object>(),
    remainingNodes: MAX_COMPILED_MOTION_NODES,
    diagnostics: [],
  };
  const value = compileMotion(source, clipMetadata, context, 0, "motion");
  return {
    value: hasCharacterRuntimeErrors(context.diagnostics) ? null : value,
    diagnostics: context.diagnostics,
  };
}

type CompileMotionContext = {
  active: WeakSet<object>;
  remainingNodes: number;
  diagnostics: CharacterRuntimeDiagnostic[];
};

function compileMotion(
  source: AnimatorMotion | null,
  clipMetadata: AnimatorClipDurationResolver,
  context: CompileMotionContext,
  depth: number,
  path: string,
): CompiledAnimatorMotion {
  if (!source) return { motion: null, durationSeconds: 1, looping: false };
  if (depth > MAX_COMPILED_BLEND_TREE_DEPTH) {
    context.diagnostics.push(error(
      "blend-tree-depth-exceeded",
      `Blend trees cannot exceed depth ${MAX_COMPILED_BLEND_TREE_DEPTH}.`,
      path,
    ));
    return invalidMotion();
  }
  if (context.active.has(source)) {
    context.diagnostics.push(error("cyclic-blend-tree", "Blend-tree motions cannot contain cycles.", path));
    return invalidMotion();
  }
  context.remainingNodes -= 1;
  if (context.remainingNodes < 0) {
    context.diagnostics.push(error(
      "blend-tree-node-budget-exceeded",
      `A compiled motion cannot exceed ${MAX_COMPILED_MOTION_NODES} nodes.`,
      path,
    ));
    return invalidMotion();
  }
  if (source.kind === "clip") return compileClip(source, clipMetadata, context.diagnostics, path);

  context.active.add(source);
  try {
    const children = source.tree.children.flatMap((child, index) => {
      const childPath = `${path}.tree.children[${index}]`;
      const compiled = compileMotion(child.motion, clipMetadata, context, depth + 1, `${childPath}.motion`);
      const validTimeScale = Number.isFinite(child.timeScale) && child.timeScale !== 0;
      if (!validTimeScale) context.diagnostics.push(error(
        "invalid-blend-child-time-scale",
        "Blend child speed must be finite and non-zero.",
        childPath,
      ));
      if (!compiled.motion) return [];
      const timeScale = validTimeScale ? child.timeScale : 1;
      return [{
        id: child.id,
        motion: compiled.motion,
        timeScale,
        mirror: child.mirror,
        durationSeconds: compiled.durationSeconds / Math.abs(timeScale),
        looping: compiled.looping,
        authored: child,
      }];
    });
    const durationSeconds = Math.max(1.0e-6, ...children.map((child) => child.durationSeconds));
    const looping = children.length > 0 && children.every((child) => child.looping);
    if (source.tree.kind === "1d") return {
      motion: {
        kind: "blendTree1d",
        parameter: source.tree.parameterId,
        children: children.map((child) => ({
          id: child.id,
          motion: child.motion,
          timeScale: child.timeScale,
          mirror: child.mirror,
          threshold: "threshold" in child.authored ? child.authored.threshold : Number.NaN,
        })),
      },
      durationSeconds,
      looping,
    };
    if (source.tree.kind === "direct") return {
      motion: {
        kind: "blendTreeDirect",
        normalizeWeights: source.tree.normalizeWeights,
        children: children.map((child) => ({
          id: child.id,
          motion: child.motion,
          timeScale: child.timeScale,
          mirror: child.mirror,
          weightParameter: "weightParameterId" in child.authored
            ? child.authored.weightParameterId
            : "",
        })),
      },
      durationSeconds,
      looping,
    };
    const runtimeChildren = children.map((child) => ({
      id: child.id,
      motion: child.motion,
      timeScale: child.timeScale,
      mirror: child.mirror,
      position: "position" in child.authored
        ? [child.authored.position[0], child.authored.position[1]] as const
        : [Number.NaN, Number.NaN] as const,
    }));
    if (runtimeChildren.length > 0) context.diagnostics.push(...validateBlendTree2dLayout(
      source.tree.kind,
      runtimeChildren.map((child) => ({ motionId: child.id, position: child.position })),
    ));
    return {
      motion: {
        kind: "blendTree2d",
        algorithm: source.tree.kind,
        parameterX: source.tree.parameterXId,
        parameterY: source.tree.parameterYId,
        children: runtimeChildren,
      },
      durationSeconds,
      looping,
    };
  } finally {
    context.active.delete(source);
  }
}

function compileClip(
  source: Extract<AnimatorMotion, { kind: "clip" }>,
  clipMetadata: AnimatorClipDurationResolver,
  diagnostics: CharacterRuntimeDiagnostic[],
  path: string,
): CompiledAnimatorMotion {
  const metadata = resolvedClipMetadata(clipMetadata(source.clipRef));
  if (!metadata) diagnostics.push(error(
    "missing-animation-clip",
    `Animator clip ${assetRefKey(source.clipRef)} has no valid imported duration.`,
    path,
  ));
  if (!Number.isFinite(source.speed) || source.speed === 0) diagnostics.push(error(
    "invalid-motion-speed",
    `Animator clip ${assetRefKey(source.clipRef)} requires a finite non-zero speed.`,
    path,
  ));
  const durationSeconds = metadata?.durationSeconds ?? 1;
  const timeScale = Number.isFinite(source.speed) && source.speed !== 0 ? source.speed : 1;
  const looping = source.loopMode === "loop"
    ? true
    : source.loopMode === "once"
      ? false
      : metadata?.looping ?? true;
  return {
    motion: {
      kind: "clip",
      clipId: assetRefKey(source.clipRef)!,
      durationSeconds,
      timeScale,
      ...(source.timeScaleParameterId ? { timeScaleParameter: source.timeScaleParameterId } : {}),
      looping,
    },
    durationSeconds: durationSeconds / Math.abs(timeScale),
    looping,
  };
}

function resolvedClipMetadata(
  value: AnimatorClipRuntimeMetadata | number | undefined,
): AnimatorClipRuntimeMetadata | null {
  const metadata = typeof value === "number" ? { durationSeconds: value, looping: true } : value;
  return metadata && Number.isFinite(metadata.durationSeconds) && metadata.durationSeconds > 0
    ? metadata
    : null;
}

function invalidMotion(): CompiledAnimatorMotion {
  return { motion: null, durationSeconds: 1, looping: false };
}

function error(code: string, message: string, path: string): CharacterRuntimeDiagnostic {
  return { code, severity: "error", message, path };
}

export function assetRefKey(reference: AssetRef | undefined): string | undefined {
  return reference ? `${reference.guid}:${reference.localId ?? "main"}` : undefined;
}
