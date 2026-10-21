import type { RootMotionPolicy } from "../../domain/animator-component";
import type { AvatarMaskAsset } from "../../domain/avatar-mask";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import {
  extractRootMotionDelta,
  type RootMotionDelta,
  type RootMotionPose,
  type RootMotionSink,
} from "../../runtime/root-motion";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPlaybackClip,
  AnimatorPoseApplier,
} from "./animator-playback-contracts";
import { extractLoopedRootMotionDelta } from "./root-motion-loop";
import { filterRootMotionDelta } from "./root-motion-policy";
import { resolveRootMotionLoopTraversal } from "./root-motion-traversal";
import type { HumanoidIkGoal } from "./animator-playback-ik";

type AnimatorPlaybackPoseDriverInput<TClip> = Readonly<{
  characterId: string;
  policy: RootMotionPolicy;
  avatar: AnimatorPlaybackAvatar | undefined;
  pose: AnimatorPoseApplier<TClip>;
  rootMotionSink: RootMotionSink | undefined;
  rootMotionObserver: RootMotionSink | undefined;
  clipsById: ReadonlyMap<string, AnimatorPlaybackClip<TClip>>;
  masksById: ReadonlyMap<string, AvatarMaskAsset>;
  ikGoals?: (layerId: string) => readonly HumanoidIkGoal[];
}>;

export type AnimatorPlaybackPoseStep = Readonly<{
  changed: boolean;
  rootMotion: RootMotionDelta | null;
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

/** Applies blend plans and owns the root-motion sampling cursor for one session. */
export class AnimatorPlaybackPoseDriver<TClip> {
  private previousRootPose: RootMotionPose | null = null;
  private previousPlan: LayerBlendPlan | null = null;

  constructor(private readonly input: AnimatorPlaybackPoseDriverInput<TClip>) {}

  get extractsRootMotion(): boolean {
    return this.input.policy.mode !== "disabled" && !this.input.policy.bakeIntoPose;
  }

  initialize(plan: LayerBlendPlan): CharacterRuntimeResult<void> {
    this.previousPlan = plan;
    const applied = this.applyPose(plan);
    const diagnostics = [...applied.diagnostics];
    if (!applied.value || !this.extractsRootMotion) {
      const post = applied.value ? this.applyPostProcess(plan) : null;
      if (post) diagnostics.push(...post.diagnostics);
      return applied.value && post?.value !== null
        ? characterRuntimeSuccess(undefined, diagnostics)
        : { value: null, diagnostics };
    }
    if (!this.input.pose.readRootMotionPose) return characterRuntimeFailure([
      ...diagnostics,
      {
        code: "root-motion-source-unavailable",
        severity: "error",
        message: "The pose backend cannot read the configured root-motion source.",
      },
    ]);
    const sampled = this.input.pose.readRootMotionPose(this.input.policy);
    diagnostics.push(...sampled.diagnostics);
    if (!sampled.value) return { value: null, diagnostics };
    this.previousRootPose = sampled.value;
    if (!this.removeExtractedRootMotion(diagnostics)) return { value: null, diagnostics };
    const post = this.applyPostProcess(plan);
    diagnostics.push(...post.diagnostics);
    return post.value
      ? characterRuntimeSuccess(undefined, diagnostics)
      : { value: null, diagnostics };
  }

  applyPose(plan: LayerBlendPlan) {
    return this.input.pose.applyPose(this.applicationFor(plan));
  }

  applyPoseWithoutRootMotion(plan: LayerBlendPlan) {
    const applied = this.applyPose(plan);
    if (!applied.value) return applied;
    const post = this.applyPostProcess(plan);
    return post.value
      ? characterRuntimeSuccess({ changed: applied.value.changed || post.value.changed }, [
          ...applied.diagnostics,
          ...post.diagnostics,
        ])
      : { value: null, diagnostics: [...applied.diagnostics, ...post.diagnostics] };
  }

  private applicationFor(plan: LayerBlendPlan) {
    const ikGoalsByLayer = new Map(plan.instructions
      .filter((instruction) => instruction.ikPass)
      .map((instruction) => [
        instruction.layerId,
        this.input.ikGoals?.(instruction.layerId) ?? [],
      ]));
    return {
      plan,
      clipsById: this.input.clipsById,
      masksById: this.input.masksById,
      avatar: this.input.avatar,
      ikGoalsByLayer,
    };
  }

  private applyPostProcess(plan: LayerBlendPlan) {
    return this.input.pose.applyPostProcess?.(this.applicationFor(plan))
      ?? characterRuntimeSuccess({ changed: false });
  }

  applyPoseAndRootMotion(
    plan: LayerBlendPlan,
    deltaSeconds: number,
  ): AnimatorPlaybackPoseStep {
    const result = this.extractRootMotion(plan, deltaSeconds);
    this.previousPlan = plan;
    return result;
  }

  reset(): void {
    this.previousRootPose = null;
    this.previousPlan = null;
  }

  private extractRootMotion(
    plan: LayerBlendPlan,
    deltaSeconds: number,
  ): AnimatorPlaybackPoseStep {
    const diagnostics: CharacterRuntimeDiagnostic[] = [];
    const applied = this.applyPose(plan);
    diagnostics.push(...applied.diagnostics);
    if (!applied.value || !this.input.pose.readRootMotionPose) {
      if (!this.input.pose.readRootMotionPose) diagnostics.push({
        code: "root-motion-source-unavailable",
        severity: "error",
        message: "The pose backend cannot read the configured root-motion source.",
      });
      return this.finishPostProcess(plan, {
        changed: applied.value?.changed ?? false,
        rootMotion: null,
        diagnostics,
      });
    }
    const sampled = this.input.pose.readRootMotionPose(this.input.policy);
    diagnostics.push(...sampled.diagnostics);
    const current = sampled.value;
    if (!current) {
      this.previousRootPose = null;
      return this.finishPostProcess(plan, {
        changed: applied.value.changed,
        rootMotion: null,
        diagnostics,
      });
    }
    if (!this.removeExtractedRootMotion(diagnostics)) {
      this.previousRootPose = current;
      return this.finishPostProcess(plan, {
        changed: applied.value.changed,
        rootMotion: null,
        diagnostics,
      });
    }
    if (!this.previousRootPose) {
      this.previousRootPose = current;
      return this.finishPostProcess(plan, {
        changed: applied.value.changed,
        rootMotion: null,
        diagnostics,
      });
    }

    const traversal = this.previousPlan
      ? resolveRootMotionLoopTraversal(this.previousPlan, plan, this.input.clipsById)
      : { kind: "none" as const };
    if (traversal.kind === "discontinuous") {
      diagnostics.push({
        code: "root-motion-sample-discontinuity",
        severity: "info",
        message: "Root-motion extraction reset at an instantaneous state or blend-sample change.",
      });
      this.previousRootPose = current;
      return this.finishPostProcess(plan, {
        changed: applied.value.changed,
        rootMotion: null,
        diagnostics,
      });
    }
    if (traversal.kind === "ambiguous") {
      diagnostics.push({
        code: traversal.reason === "blended"
          ? "ambiguous-blended-root-motion-loop"
          : "unsafe-root-motion-loop-count",
        severity: "warning",
        message: traversal.reason === "blended"
          ? "Root-motion loop correction was skipped because multiple blend samples crossed a cycle in the same step."
          : "Root-motion loop correction was skipped because the cycle count exceeded safe integer precision.",
      });
      this.previousRootPose = current;
      return this.finishPostProcess(plan, {
        changed: applied.value.changed,
        rootMotion: null,
        diagnostics,
      });
    }

    const extracted = this.extractDelta(plan, current, traversal, diagnostics);
    this.previousRootPose = current;
    diagnostics.push(...extracted.diagnostics);
    if (!extracted.value) return this.finishPostProcess(plan, {
      changed: applied.value.changed,
      rootMotion: null,
      diagnostics,
    });
    const filtered = filterRootMotionDelta(extracted.value, this.input.policy);
    const application = {
      characterId: this.input.characterId,
      delta: filtered,
      fixedDeltaSeconds: deltaSeconds,
    };
    this.input.rootMotionObserver?.applyRootMotion(application);
    if (this.input.policy.mode === "applyToObject") {
      if (this.input.rootMotionSink) this.input.rootMotionSink.applyRootMotion(application);
      else diagnostics.push({
        code: "root-motion-sink-unavailable",
        severity: "error",
        message: "Apply To Object requires a character motor or object root-motion sink.",
      });
    }
    return this.finishPostProcess(plan, { changed: true, rootMotion: filtered, diagnostics });
  }

  private finishPostProcess(
    plan: LayerBlendPlan,
    step: AnimatorPlaybackPoseStep,
  ): AnimatorPlaybackPoseStep {
    const post = this.applyPostProcess(plan);
    return {
      changed: step.changed || Boolean(post.value?.changed),
      rootMotion: step.rootMotion,
      diagnostics: [...step.diagnostics, ...post.diagnostics],
    };
  }

  private extractDelta(
    plan: LayerBlendPlan,
    current: RootMotionPose,
    traversal: ReturnType<typeof resolveRootMotionLoopTraversal<TClip>>,
    diagnostics: CharacterRuntimeDiagnostic[],
  ): CharacterRuntimeResult<RootMotionDelta> {
    if (!this.previousRootPose || !this.previousPlan || traversal.kind !== "crossing") {
      return extractRootMotionDelta(this.previousRootPose!, current);
    }
    const boundary = this.input.pose.readRootMotionLoopBoundary?.(
      this.input.policy,
      this.previousPlan,
      plan,
    );
    if (!boundary?.value) {
      diagnostics.push(...(boundary?.diagnostics ?? []), {
        code: "root-motion-loop-boundary-unavailable",
        severity: "warning",
        message: "A looping root-motion sample was skipped because the backend could not resolve its cycle boundary.",
      });
      return characterRuntimeFailure([]);
    }
    diagnostics.push(...boundary.diagnostics);
    return extractLoopedRootMotionDelta(
      this.previousRootPose,
      current,
      boundary.value,
      traversal.cycleCrossings,
    );
  }

  private removeExtractedRootMotion(diagnostics: CharacterRuntimeDiagnostic[]): boolean {
    if (!this.input.pose.removeRootMotionFromPose) {
      diagnostics.push({
        code: "root-motion-pose-removal-unavailable",
        severity: "error",
        message: "The pose backend cannot remove extracted root motion from the rendered pose.",
      });
      return false;
    }
    const removed = this.input.pose.removeRootMotionFromPose(this.input.policy);
    diagnostics.push(...removed.diagnostics);
    return removed.value !== null && !hasCharacterRuntimeErrors(removed.diagnostics);
  }
}
