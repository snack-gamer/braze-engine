import * as THREE from "three";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import { ThreeAnimationBindingSpace } from "./three-animation-binding-space";
import {
  assessThreeAnimationResourceTracks,
  EMPTY_THREE_ANIMATION_TRACK_COUNTS,
  extendThreeAnimationCacheBudget,
  subtractThreeAnimationTrackCounts,
  type ThreeAnimationTrackCounts,
} from "./three-animation-resource-budget";
import type {
  ThreeAnimatorClipBinding,
  ThreeAnimatorClipResource,
} from "./three-animator-clip-resource";
import {
  ThreeAnimatorLayerTrackPlanner,
  type ThreeAnimatorTrackGroup,
} from "./three-animator-layer-tracks";
import { mirrorThreeHumanoidTracks } from "./three-humanoid-animation-mirror";
import {
  ThreeAnimatorPropertyMemory,
  type ThreeActiveLayerTracks,
} from "./three-animator-property-memory";
import {
  prepareThreeAnimatorClip,
  threeAnimatorPlanTopologySignature,
} from "./three-animator-action-preparation";

export type {
  ThreeAnimatorClipBinding,
  ThreeAnimatorClipResource,
} from "./three-animator-clip-resource";

type CachedAction = {
  key: string;
  action: THREE.AnimationAction;
  mixer: THREE.AnimationMixer;
  clip: THREE.AnimationClip;
  root: THREE.Object3D;
  counts: ThreeAnimationTrackCounts;
};

type CachedLayerAction = Readonly<{
  cached: CachedAction;
  group: ThreeAnimatorTrackGroup;
}>;

type ActionCacheTransaction = {
  previousActive: Set<THREE.AnimationAction>;
  nextActive: Set<THREE.AnimationAction>;
  createdActions: Array<Readonly<{ key: string; counts: ThreeAnimationTrackCounts }>>;
  createdGroupKeys: string[];
  createdMixerRoots: THREE.Object3D[];
  nextGroupKeys: Set<string>;
  nextDescriptors: Map<THREE.AnimationAction, ThreeActiveLayerTracks>;
};

const MAX_CACHED_ACTIONS = 128;
const MAX_CACHED_ACTION_GROUPS = 256;

/** Owns the bounded Three compatibility action/clip cache for one character. */
export class ThreeAnimatorActionCache {
  private readonly mixers = new Map<THREE.Object3D, THREE.AnimationMixer>();
  private readonly actions = new Map<string, CachedAction>();
  private readonly actionGroups = new Map<string, readonly CachedLayerAction[]>();
  private readonly bindingSpace: ThreeAnimationBindingSpace;
  private readonly trackPlanner: ThreeAnimatorLayerTrackPlanner;
  private activeActions = new Set<THREE.AnimationAction>();
  private activeDescriptors = new Map<THREE.AnimationAction, ThreeActiveLayerTracks>();
  private readonly propertyMemory = new ThreeAnimatorPropertyMemory();
  private preparedCounts: ThreeAnimationTrackCounts = EMPTY_THREE_ANIMATION_TRACK_COUNTS;
  private disposed = false;

  constructor(body: THREE.Object3D) {
    this.bindingSpace = new ThreeAnimationBindingSpace(body);
    this.trackPlanner = new ThreeAnimatorLayerTrackPlanner(body);
  }

  apply(
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): CharacterRuntimeResult<{ changed: boolean }> {
    if (this.disposed) return characterRuntimeFailure(
      "disposed-three-animator",
      "The Three Animator pose backend is already disposed.",
    );
    let canonical: CharacterRuntimeResult<AnimatorPoseApplication<ThreeAnimatorClipResource>>;
    try {
      canonical = this.bindingSpace.canonicalize(application);
    } catch (error) {
      return characterRuntimeFailure(
        "three-animation-binding-space-failed",
        `Three could not canonicalize animation bindings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!canonical.value) return this.failClosed(canonical.diagnostics);
    const canonicalApplication = canonical.value;
    const transaction = this.beginTransaction(canonicalApplication);
    try {
      const layerTopologySignature = threeAnimatorPlanTopologySignature(canonicalApplication);
      for (let instructionIndex = 0; instructionIndex < canonicalApplication.plan.instructions.length; instructionIndex += 1) {
        const instruction = canonicalApplication.plan.instructions[instructionIndex]!;
        for (let sampleIndex = 0; sampleIndex < instruction.clips.length; sampleIndex += 1) {
          const sample = instruction.clips[sampleIndex]!;
          const resource = canonicalApplication.clipsById.get(sample.clipId)?.resource;
          if (!resource) return this.rollback(transaction, [{
            code: "missing-three-animation-clip",
            severity: "error",
            message: `Three pose application cannot resolve ${sample.clipId}.`,
          }]);
          for (let bindingIndex = 0; bindingIndex < resource.bindings.length; bindingIndex += 1) {
            const binding = resource.bindings[bindingIndex]!;
            const cachedGroups = this.actionsFor(
              sample.clipId,
              `${instruction.layerId}:${sampleIndex}`,
              bindingIndex,
              binding,
              instruction.blendMode,
              instructionIndex,
              sample.mirrored === true,
              layerTopologySignature,
              canonicalApplication,
              transaction,
            );
            if (!cachedGroups.value) {
              return this.rollback(transaction, cachedGroups.diagnostics);
            }
            for (const { cached, group } of cachedGroups.value) {
              const layerFactor = this.trackPlanner.layerFactor(group, instructionIndex, canonicalApplication);
              if (layerFactor <= 0) continue;
              const action = cached.action;
              transaction.nextActive.add(action);
              transaction.nextDescriptors.set(action, {
                layerId: instruction.layerId,
                instructionIndex,
                writeDefaults: instruction.writeDefaults !== false,
                root: cached.root,
                tracks: cached.clip.tracks,
              });
              action.enabled = true;
              action.paused = true;
              action.time = sample.localTimeSeconds;
              action.setEffectiveWeight(sample.weight * layerFactor);
              action.play();
            }
          }
        }
      }
      this.propertyMemory.prime(transaction.nextDescriptors.values());
      for (const mixer of this.mixers.values()) mixer.update(0);
    } catch (error) {
      return this.rollback(transaction, [{
        code: "three-animator-action-apply-failed",
        severity: "error",
        message: `Three could not apply the animation plan: ${error instanceof Error ? error.message : String(error)}`,
      }]);
    }
    for (const action of transaction.previousActive) {
      if (!transaction.nextActive.has(action)) action.stop();
    }
    this.propertyMemory.apply(transaction.nextDescriptors.values());
    this.activeActions = transaction.nextActive;
    this.activeDescriptors = transaction.nextDescriptors;
    this.pruneInactivePlanGroups(transaction.nextGroupKeys);
    // Disabling the final action restores Three's saved property state. That is
    // a visible pose change too, even though the new plan contains no clips.
    return characterRuntimeSuccess(
      { changed: transaction.previousActive.size > 0 || transaction.nextActive.size > 0 },
      canonical.diagnostics,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mixer of this.mixers.values()) mixer.stopAllAction();
    for (const cached of this.actions.values()) {
      cached.mixer.uncacheAction(cached.clip, cached.root);
    }
    for (const mixer of this.mixers.values()) mixer.uncacheRoot(mixer.getRoot());
    this.activeActions.clear();
    this.activeDescriptors.clear();
    this.propertyMemory.dispose();
    this.actionGroups.clear();
    this.actions.clear();
    this.mixers.clear();
    this.preparedCounts = EMPTY_THREE_ANIMATION_TRACK_COUNTS;
  }

  private actionsFor(
    clipId: string,
    sampleSlot: string,
    bindingIndex: number,
    binding: ThreeAnimatorClipBinding,
    blendMode: "override" | "additive",
    instructionIndex: number,
    mirrored: boolean,
    layerTopologySignature: string,
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
    transaction: ActionCacheTransaction,
  ): CharacterRuntimeResult<readonly CachedLayerAction[]> {
    const groupKey = `${clipId}\u0000${sampleSlot}\u0000${bindingIndex}\u0000${blendMode}\u0000${mirrored}\u0000${layerTopologySignature}`;
    const existing = this.actionGroups.get(groupKey);
    transaction.nextGroupKeys.add(groupKey);
    if (existing) return characterRuntimeSuccess(existing);
    if (this.actionGroups.size >= MAX_CACHED_ACTION_GROUPS) return characterRuntimeFailure(
      "three-animator-action-group-capacity",
      `A character exceeded the ${MAX_CACHED_ACTION_GROUPS}-group Three compatibility limit.`,
    );
    const groups = this.trackPlanner.groups(binding, instructionIndex, application);
    const cachedGroups: CachedLayerAction[] = [];
    for (const group of groups) {
      const cached = this.actionFor(
        `${groupKey}\u0000${group.key}`,
        binding,
        blendMode,
        group.tracks,
        mirrored,
        application,
        transaction,
      );
      if (!cached.value) return { value: null, diagnostics: cached.diagnostics };
      cachedGroups.push({ cached: cached.value, group });
    }
    this.actionGroups.set(groupKey, cachedGroups);
    transaction.createdGroupKeys.push(groupKey);
    return characterRuntimeSuccess(cachedGroups);
  }

  private actionFor(
    key: string,
    binding: ThreeAnimatorClipBinding,
    blendMode: "override" | "additive",
    tracks: readonly THREE.KeyframeTrack[],
    mirrored: boolean,
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
    transaction: ActionCacheTransaction,
  ): CharacterRuntimeResult<CachedAction> {
    const existing = this.actions.get(key);
    if (existing) return characterRuntimeSuccess(existing);
    if (this.actions.size >= MAX_CACHED_ACTIONS) return characterRuntimeFailure(
      "three-animator-action-capacity",
      `A character exceeded the ${MAX_CACHED_ACTIONS}-action Three compatibility limit.`,
    );
    const preparedTracks = mirrored
      ? mirrorThreeHumanoidTracks(tracks, application.avatar)
      : characterRuntimeSuccess(tracks);
    if (!preparedTracks.value) return { value: null, diagnostics: preparedTracks.diagnostics };
    const counts = assessThreeAnimationResourceTracks([preparedTracks.value]);
    if (!counts.value) return { value: null, diagnostics: counts.diagnostics };
    const preparedBudget = extendThreeAnimationCacheBudget(
      this.preparedCounts,
      counts.value,
      "prepared",
    );
    if (!preparedBudget.value) return { value: null, diagnostics: preparedBudget.diagnostics };

    const clip = prepareThreeAnimatorClip(binding.clip, blendMode, preparedTracks.value);
    let mixer = this.mixers.get(binding.root);
    if (!mixer) {
      mixer = new THREE.AnimationMixer(binding.root);
      this.mixers.set(binding.root, mixer);
      transaction.createdMixerRoots.push(binding.root);
    }
    const action = mixer.clipAction(
      clip,
      binding.root,
      blendMode === "additive"
        ? THREE.AdditiveAnimationBlendMode
        : THREE.NormalAnimationBlendMode,
    );
    const cached = { key, action, mixer, clip, root: binding.root, counts: counts.value };
    this.actions.set(key, cached);
    this.preparedCounts = preparedBudget.value;
    transaction.createdActions.push({ key, counts: counts.value });
    return characterRuntimeSuccess(cached);
  }

  private beginTransaction(
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): ActionCacheTransaction {
    const previousActive = new Set(this.activeActions);
    this.propertyMemory.capture(this.activeDescriptors.values(), application.plan.instructions);
    for (const action of previousActive) {
      action.enabled = false;
      action.setEffectiveWeight(0);
    }
    return {
      previousActive,
      nextActive: new Set(),
      createdActions: [],
      createdGroupKeys: [],
      createdMixerRoots: [],
      nextGroupKeys: new Set(),
      nextDescriptors: new Map(),
    };
  }

  private pruneInactivePlanGroups(keep: ReadonlySet<string>): void {
    for (const [groupKey, group] of this.actionGroups) {
      if (keep.has(groupKey)) continue;
      this.actionGroups.delete(groupKey);
      for (const { cached } of group) {
        if (this.activeActions.has(cached.action)) continue;
        cached.mixer.uncacheAction(cached.clip, cached.root);
        this.actions.delete(cached.key);
        this.preparedCounts = subtractThreeAnimationTrackCounts(
          this.preparedCounts,
          cached.counts,
        );
      }
    }
  }

  private rollback(
    transaction: ActionCacheTransaction,
    diagnostics: readonly CharacterRuntimeDiagnostic[],
  ): CharacterRuntimeResult<{ changed: boolean }> {
    const output = [...diagnostics];
    const touched = new Set([...transaction.previousActive, ...transaction.nextActive]);
    for (const action of touched) {
      action.enabled = false;
      action.setEffectiveWeight(0);
    }
    for (const mixer of this.mixers.values()) {
      try {
        mixer.update(0);
      } catch (error) {
        output.push({
          code: "three-animator-action-rollback-failed",
          severity: "error",
          message: `Three could not restore a failed animation plan: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    for (const action of touched) action.stop();
    this.activeActions = new Set();
    this.activeDescriptors = new Map();
    this.propertyMemory.dispose();
    transaction.createdGroupKeys.forEach((key) => this.actionGroups.delete(key));
    for (const created of transaction.createdActions) {
      const cached = this.actions.get(created.key);
      if (cached) {
        cached.mixer.uncacheAction(cached.clip, cached.root);
        this.actions.delete(created.key);
      }
      this.preparedCounts = subtractThreeAnimationTrackCounts(
        this.preparedCounts,
        created.counts,
      );
    }
    for (const root of transaction.createdMixerRoots) {
      const mixer = this.mixers.get(root);
      if (!mixer || [...this.actions.values()].some((cached) => cached.mixer === mixer)) continue;
      mixer.uncacheRoot(root);
      this.mixers.delete(root);
    }
    return { value: null, diagnostics: output };
  }

  private failClosed(
    diagnostics: readonly CharacterRuntimeDiagnostic[],
  ): CharacterRuntimeResult<{ changed: boolean }> {
    for (const action of this.activeActions) {
      action.enabled = false;
      action.setEffectiveWeight(0);
    }
    for (const mixer of this.mixers.values()) mixer.update(0);
    for (const action of this.activeActions) action.stop();
    this.activeActions.clear();
    this.activeDescriptors.clear();
    this.propertyMemory.dispose();
    return { value: null, diagnostics };
  }
}
