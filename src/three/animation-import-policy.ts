import * as THREE from "three";
import type { CharacterDiagnostic } from "../character/domain/diagnostics";
import type {
  AnimationCompressionMode,
  ModelAnimationClipSettings,
} from "../lib/model-import-settings";
import { trimAnimationClipToFrames } from "./animation-clip-range";
import {
  animationClipForRootMotionExtraction,
  applyAnimationClipLoopPose,
  cloneAnimationClipWithRootMotionSource,
} from "./animation-clip-loop-pose";

export type AnimationImportPolicyResult = Readonly<{
  animations: readonly THREE.AnimationClip[];
  diagnostics: readonly CharacterDiagnostic[];
  changed: boolean;
}>;

export type AnimationImportPolicy = Readonly<{
  compression: AnimationCompressionMode;
  clipSettings: Readonly<Record<string, ModelAnimationClipSettings>>;
}>;

/** Applies loader-owned, deterministic clip processing before source caching. */
export function applyAnimationImportPolicy(
  animations: readonly THREE.AnimationClip[],
  policy: AnimationImportPolicy,
): AnimationImportPolicyResult {
  if (animations.length === 0) {
    return { animations, diagnostics: [], changed: false };
  }
  const diagnostics: CharacterDiagnostic[] = [];
  const plan = animationClipImportPlan(policy.clipSettings, animations.length, diagnostics);
  let changed = false;
  let processed = animations.map((source, sourceIndex) => {
    const configured = plan.sources.get(sourceIndex);
    if (!configured) return source;
    const result = configuredAnimationClip(source, sourceIndex, configured, diagnostics, false);
    changed ||= result !== source;
    return result;
  });
  const segments = plan.segments.map((configured) => configuredAnimationClip(
    animations[configured.settings.sourceIndex!]!,
    configured.settings.sourceIndex!,
    configured,
    diagnostics,
    true,
  ));
  if (segments.length > 0) {
    changed = true;
    processed = [...processed, ...segments];
  }
  if (policy.compression === "off") {
    return { animations: processed, diagnostics, changed };
  }
  const before = countKeys(processed);
  processed = processed.map((source) => {
    const clip = cloneAnimationClipWithRootMotionSource(source);
    clip.optimize();
    clip.resetDuration();
    const rootMotionSource = animationClipForRootMotionExtraction(clip);
    if (rootMotionSource !== clip) {
      rootMotionSource.optimize();
      rootMotionSource.resetDuration();
    }
    return clip;
  });
  const after = countKeys(processed);
  const removed = Math.max(0, before - after);
  return {
    animations: processed,
    changed: true,
    diagnostics: [...diagnostics, {
      code: "animation-keyframe-reduction",
      severity: "info",
      message: `Animation keyframe reduction removed ${removed} redundant key${removed === 1 ? "" : "s"} across ${processed.length} clip${processed.length === 1 ? "" : "s"}.`,
    }],
  };
}

type ConfiguredClipSetting = Readonly<{
  localId: string;
  settings: ModelAnimationClipSettings;
}>;

function animationClipImportPlan(
  clipSettings: Readonly<Record<string, ModelAnimationClipSettings>>,
  clipCount: number,
  diagnostics: CharacterDiagnostic[],
): Readonly<{
  sources: Map<number, ConfiguredClipSetting>;
  segments: ConfiguredClipSetting[];
}> {
  const sources = new Map<number, ConfiguredClipSetting>();
  const segments: ConfiguredClipSetting[] = [];
  for (const [localId, settings] of Object.entries(clipSettings).sort(([left], [right]) => left.localeCompare(right))) {
    if (settings.enabled === false || settings.sourceIndex === undefined || !localId.startsWith("clip:")) continue;
    if (settings.sourceIndex < 0 || settings.sourceIndex >= clipCount) {
      diagnostics.push({
        code: "animation-clip-source-missing",
        severity: "warning",
        message: `Imported clip setting ${localId} references missing source take ${settings.sourceIndex}.`,
      });
      continue;
    }
    if (settings.kind === "segment") {
      segments.push({ localId, settings });
      continue;
    }
    if (sources.has(settings.sourceIndex)) {
      diagnostics.push({
        code: "animation-clip-source-ambiguous",
        severity: "warning",
        message: `Multiple imported clips reference source take ${settings.sourceIndex}; only ${localId} was ignored.`,
      });
      continue;
    }
    sources.set(settings.sourceIndex, { localId, settings });
  }
  return { sources, segments };
}

function configuredAnimationClip(
  source: THREE.AnimationClip,
  sourceIndex: number,
  configured: ConfiguredClipSetting,
  diagnostics: CharacterDiagnostic[],
  cloneWhenUnchanged: boolean,
): THREE.AnimationClip {
  const { settings } = configured;
  const hasRange = settings.firstFrame !== undefined && settings.lastFrame !== undefined;
  const ranged = hasRange ? trimAnimationClipToFrames(source, {
    firstFrame: settings.firstFrame!,
    lastFrame: settings.lastFrame!,
  }) : null;
  if (hasRange && !ranged) diagnostics.push({
    code: "animation-clip-range-invalid",
    severity: "warning",
    message: `Clip ${source.name || sourceIndex + 1} has an invalid imported frame range; the full source take was kept.`,
  });
  const rangedClip = ranged?.clip ?? source;
  const renamed = settings.name && settings.name !== rangedClip.name;
  const loopPose = settings.looping && settings.loopPose === true;
  if (!ranged?.changed && !renamed && !loopPose && !cloneWhenUnchanged) return source;
  let clip = ranged?.changed ? ranged.clip : source.clone();
  if (settings.name) clip.name = settings.name;
  if (ranged?.changed) diagnostics.push({
    code: "animation-clip-range-applied",
    severity: "info",
    message: `Imported ${clip.name || sourceIndex + 1} from frames ${ranged.firstFrame}–${ranged.lastFrame} at ${ranged.frameRate} FPS.`,
  });
  if (loopPose) {
    applyAnimationClipLoopPose(clip);
    diagnostics.push({
      code: "animation-loop-pose-applied",
      severity: "info",
      message: `Distributed ${clip.name || sourceIndex + 1}'s endpoint pose difference over its loop.`,
    });
  }
  return clip;
}

function countKeys(animations: readonly THREE.AnimationClip[]): number {
  return animations.reduce(
    (clipTotal, clip) => clipTotal + clip.tracks.reduce((trackTotal, track) => trackTotal + track.times.length, 0),
    0,
  );
}
