import * as THREE from "three";
import type {
  AnimatorPlaybackClip,
  AnimatorPoseApplication,
} from "../../application/playback/animator-playback-contracts";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import {
  assessThreeAnimationResourceTracks,
  THREE_ANIMATION_RESOURCE_LIMITS,
} from "./three-animation-resource-budget";
import { ThreeCanonicalClipResourceCache } from "./three-canonical-clip-resource-cache";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import { ThreeCharacterBindingIndex } from "./three-character-binding-index";
import { THREE_CHARACTER_MODEL_WORK_LIMITS } from "./three-character-model-work-limits";

export type ResolvedThreeAnimationTrackBinding = Readonly<{
  node: THREE.Object3D;
  target: object;
  objectName: string | null;
  objectIndex: string | null;
  propertyName: string;
  propertyIndex: string | null;
}>;

type BindingResolution = Readonly<{
  value: ResolvedThreeAnimationTrackBinding | null;
  reason?: "ambiguous" | "unresolved";
}>;

type ThreeAnimatorPlaybackClip = AnimatorPlaybackClip<ThreeAnimatorClipResource>;

/**
 * Rebinds every clip used by one character to a single mixer root. Canonical
 * names are clone-stable; source/cached clips remain untouched.
 */
export class ThreeAnimationBindingSpace {
  private readonly resources = new ThreeCanonicalClipResourceCache();
  private readonly namesByTarget = new WeakMap<object, Map<string, string>>();
  private readonly index: CharacterRuntimeResult<ThreeCharacterBindingIndex>;
  private lastClipSource: object | null = null;
  private lastPlanKey = "";
  private lastClips: CharacterRuntimeResult<ReadonlyMap<string, ThreeAnimatorPlaybackClip>> | null = null;

  constructor(private readonly body: THREE.Object3D) {
    this.index = ThreeCharacterBindingIndex.build(body);
  }

  canonicalize(
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): CharacterRuntimeResult<AnimatorPoseApplication<ThreeAnimatorClipResource>> {
    if (!this.index.value) return { value: null, diagnostics: this.index.diagnostics };
    const activeClipIds = clipIdsForPlan(application.plan);
    const planKey = JSON.stringify(activeClipIds);
    const clips = this.lastClipSource === application.clipsById && this.lastPlanKey === planKey
      ? this.lastClips!
      : this.canonicalClips(application.clipsById, activeClipIds);
    this.lastClipSource = application.clipsById;
    this.lastPlanKey = planKey;
    this.lastClips = clips;
    if (!clips.value) return { value: null, diagnostics: clips.diagnostics };
    return characterRuntimeSuccess({ ...application, clipsById: clips.value }, clips.diagnostics);
  }

  private canonicalClips(
    clips: AnimatorPoseApplication<ThreeAnimatorClipResource>["clipsById"],
    activeClipIds: readonly string[],
  ): CharacterRuntimeResult<AnimatorPoseApplication<ThreeAnimatorClipResource>["clipsById"]> {
    if (clips.size > THREE_ANIMATION_RESOURCE_LIMITS.maximumClipsPerCharacter) {
      return characterRuntimeFailure<ReadonlyMap<string, ThreeAnimatorPlaybackClip>>({
        code: "three-animation-clip-limit-exceeded",
        severity: "error",
        message: `A character cannot resolve more than ${THREE_ANIMATION_RESOURCE_LIMITS.maximumClipsPerCharacter} Three animation clips.`,
      });
    }
    const canonical = new Map<string, ThreeAnimatorPlaybackClip>();
    const diagnostics: CharacterRuntimeDiagnostic[] = [];
    const protectedSources = new Set<object>();
    for (const id of activeClipIds) {
      const clip = clips.get(id);
      if (clip) protectedSources.add(clip.resource as object);
    }
    for (const id of activeClipIds) {
      const clip = clips.get(id);
      if (!clip) {
        diagnostics.push({
          code: "missing-three-animation-clip",
          severity: "error",
          message: `Three pose application cannot resolve ${id}.`,
        });
        continue;
      }
      const resource = this.canonicalResource(id, clip.resource, protectedSources);
      diagnostics.push(...resource.diagnostics);
      if (resource.value) canonical.set(id, { ...clip, resource: resource.value });
    }
    return canonical.size === activeClipIds.length
      ? characterRuntimeSuccess(canonical, diagnostics)
      : characterRuntimeFailure<ReadonlyMap<string, ThreeAnimatorPlaybackClip>>(diagnostics);
  }

  private canonicalResource(
    clipId: string,
    resource: ThreeAnimatorClipResource,
    protectedSources: ReadonlySet<object>,
  ): CharacterRuntimeResult<ThreeAnimatorClipResource> {
    return this.resources.resolve(
      resource,
      protectedSources,
      () => this.compileResource(clipId, resource),
    );
  }

  private compileResource(
    clipId: string,
    resource: ThreeAnimatorClipResource,
  ): CharacterRuntimeResult<ThreeAnimatorClipResource> {
    if (resource.bindings.length < 1) return characterRuntimeFailure(
      "empty-three-animation-resource",
      `Animation clip ${clipId} has no Three binding.`,
    );
    if (resource.bindings.length > THREE_ANIMATION_RESOURCE_LIMITS.maximumBindingsPerResource) {
      return characterRuntimeFailure(
        "three-animation-binding-limit-exceeded",
        `A Three animation resource supports at most ${THREE_ANIMATION_RESOURCE_LIMITS.maximumBindingsPerResource} bindings.`,
      );
    }
    const sourceBudget = assessThreeAnimationResourceTracks(
      resource.bindings.map((binding) => binding.clip.tracks),
    );
    if (!sourceBudget.value) return { value: null, diagnostics: sourceBudget.diagnostics };
    const first = resource.bindings[0]!.clip;
    const tracks: THREE.KeyframeTrack[] = [];
    const byName = new Map<string, THREE.KeyframeTrack>();
    for (const binding of resource.bindings) {
      if (!sameDuration(first.duration, binding.clip.duration)) return characterRuntimeFailure(
        "incompatible-three-animation-binding-duration",
        `Animation clip ${clipId} has bindings with different durations.`,
      );
      for (const sourceTrack of binding.clip.tracks) {
        const resolution = resolveTrackBindingDetailed(this.index.value!, binding.root, sourceTrack);
        if (!resolution.value) return characterRuntimeFailure(
          resolution.reason === "ambiguous"
            ? "ambiguous-three-animation-binding"
            : "unresolved-three-animation-binding",
          `Animation clip ${clipId} cannot uniquely bind track ${JSON.stringify(sourceTrack.name)}.`,
        );
        const canonicalName = this.canonicalTrackName(resolution.value, sourceTrack.name);
        if (!canonicalName.value) return { value: null, diagnostics: canonicalName.diagnostics };
        const track = sourceTrack.clone();
        track.name = canonicalName.value;
        const duplicate = byName.get(track.name);
        if (duplicate) {
          if (!sameTrackSamples(duplicate, track)) return characterRuntimeFailure(
            "conflicting-three-animation-bindings",
            `Animation clip ${clipId} supplies conflicting samples for ${track.name}.`,
          );
          continue;
        }
        byName.set(track.name, track);
        tracks.push(track);
      }
    }
    const clip = new THREE.AnimationClip(first.name, first.duration, tracks, first.blendMode);
    return characterRuntimeSuccess({ bindings: [{ root: this.body, clip }] });
  }

  private canonicalTrackName(
    binding: ResolvedThreeAnimationTrackBinding,
    sourceName: string,
  ): CharacterRuntimeResult<string> {
    const propertyKey = `${binding.propertyName}\u0000${binding.propertyIndex ?? ""}`;
    const cached = this.namesByTarget.get(binding.target)?.get(propertyKey);
    if (cached) return characterRuntimeSuccess(cached);
    const candidate = isThreeObject(binding.target)
      ? directTrackName(this.index.value!, binding.target, binding.propertyName, binding.propertyIndex)
      : nestedTrackName(this.index.value!, binding);
    if (!candidate) return characterRuntimeFailure(
      "noncanonical-three-animation-binding",
      `Track ${JSON.stringify(sourceName)} does not resolve to a uniquely named target inside the character.`,
    );
    const verification = resolveTrackBindingDetailed(
      this.index.value!,
      this.body,
      new THREE.NumberKeyframeTrack(candidate, [0], [0]),
    );
    if (!verification.value || !sameThreeAnimationTrackBinding(binding, verification.value)) {
      return characterRuntimeFailure(
        "noncanonical-three-animation-binding",
        `Track ${JSON.stringify(sourceName)} cannot be represented in the character's canonical binding space.`,
      );
    }
    const byProperty = this.namesByTarget.get(binding.target) ?? new Map<string, string>();
    byProperty.set(propertyKey, candidate);
    this.namesByTarget.set(binding.target, byProperty);
    return characterRuntimeSuccess(candidate);
  }
}

function clipIdsForPlan(
  plan: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const instruction of plan.instructions) {
    for (const sample of instruction.clips) {
      if (seen.has(sample.clipId)) continue;
      seen.add(sample.clipId);
      ids.push(sample.clipId);
    }
  }
  return ids;
}

function sameThreeAnimationTrackBinding(
  left: ResolvedThreeAnimationTrackBinding,
  right: ResolvedThreeAnimationTrackBinding | null,
): boolean {
  return Boolean(right)
    && left.target === right!.target
    && left.propertyName === right!.propertyName
    && left.propertyIndex === right!.propertyIndex;
}

function resolveTrackBindingDetailed(
  index: ThreeCharacterBindingIndex,
  root: THREE.Object3D,
  track: THREE.KeyframeTrack,
): BindingResolution {
  let parsed: THREE.ParseTrackNameResults;
  try {
    parsed = THREE.PropertyBinding.parseTrackName(track.name);
  } catch {
    return { value: null, reason: "unresolved" };
  }
  const node = index.resolve(root, parsed.nodeName);
  if (!node.value) return { value: null, reason: node.reason };
  let target: unknown = node.value;
  let objectIndex: string | null = parsed.objectIndex ?? null;
  if (parsed.objectName) {
    const nested = resolveNestedTarget(node.value, parsed.objectName, objectIndex);
    if (!nested.value) return { value: null, reason: nested.reason };
    target = nested.value.target;
    objectIndex = nested.value.objectIndex;
  }
  if (!isPropertyOwner(target) || !(parsed.propertyName in target)) {
    return { value: null, reason: "unresolved" };
  }
  let propertyIndex: string | null = parsed.propertyIndex ?? null;
  if (propertyIndex !== null && parsed.propertyName === "morphTargetInfluences") {
    const dictionary = target.morphTargetDictionary;
    if (isPropertyOwner(dictionary) && dictionary[propertyIndex] !== undefined) {
      propertyIndex = String(dictionary[propertyIndex]);
    }
  }
  return {
    value: {
      node: node.value,
      target,
      objectName: parsed.objectName ?? null,
      objectIndex,
      propertyName: parsed.propertyName,
      propertyIndex,
    },
  };
}

function resolveNestedTarget(
  node: THREE.Object3D,
  objectName: string,
  objectIndex: string | null,
): Readonly<{
  value: Readonly<{ target: object; objectIndex: string | null }> | null;
  reason?: "ambiguous" | "unresolved";
}> {
  const owner = node as unknown as Record<string, unknown>;
  let target: unknown;
  if (objectName === "materials") {
    const material = owner.material;
    target = isPropertyOwner(material) ? material.materials : undefined;
  } else if (objectName === "bones") {
    const skeleton = owner.skeleton;
    const bones = isPropertyOwner(skeleton) && Array.isArray(skeleton.bones)
      ? skeleton.bones
      : undefined;
    if (!bones || bones.length > THREE_CHARACTER_MODEL_WORK_LIMITS.maximumBonesPerSkeleton
      || objectIndex === null) return { value: null, reason: "unresolved" };
    const named = bones.filter((bone) => isPropertyOwner(bone) && bone.name === objectIndex);
    if (named.length > 1) return { value: null, reason: "ambiguous" };
    target = named[0] ?? bones[Number(objectIndex)];
    objectIndex = named.length === 1 ? String(bones.indexOf(named[0])) : objectIndex;
  } else if (objectName === "map") {
    const material = owner.material;
    target = owner.map ?? (isPropertyOwner(material) ? material.map : undefined);
  } else {
    target = owner[objectName];
  }
  if (objectName !== "bones" && objectIndex !== null) {
    if (!isPropertyOwner(target)) return { value: null, reason: "unresolved" };
    target = target[objectIndex];
  }
  return isPropertyOwner(target)
    ? { value: { target, objectIndex } }
    : { value: null, reason: "unresolved" };
}

function directTrackName(
  index: ThreeCharacterBindingIndex,
  target: THREE.Object3D,
  propertyName: string,
  propertyIndex: string | null,
): string | null {
  const targetName = index.stableName(target);
  return targetName === null ? null : `${targetName}.${propertyName}${indexSuffix(propertyIndex)}`;
}

function nestedTrackName(
  index: ThreeCharacterBindingIndex,
  binding: ResolvedThreeAnimationTrackBinding,
): string | null {
  if (!binding.objectName) return null;
  const nodeName = index.stableName(binding.node);
  if (nodeName === null) return null;
  return `${nodeName}.${binding.objectName}${indexSuffix(binding.objectIndex)}.${binding.propertyName}${indexSuffix(binding.propertyIndex)}`;
}

function indexSuffix(index: string | null): string {
  return index === null ? "" : `[${index}]`;
}

function sameDuration(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1.0e-6;
}

function sameTrackSamples(left: THREE.KeyframeTrack, right: THREE.KeyframeTrack): boolean {
  return left.constructor === right.constructor
    && left.getInterpolation() === right.getInterpolation()
    && sameArray(left.times, right.times)
    && sameArray(left.values, right.values);
}

function sameArray(left: ArrayLike<unknown>, right: ArrayLike<unknown>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function isThreeObject(value: object): value is THREE.Object3D {
  return (value as THREE.Object3D).isObject3D === true;
}

function isPropertyOwner(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}
