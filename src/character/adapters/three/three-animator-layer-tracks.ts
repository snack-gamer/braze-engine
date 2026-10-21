import type * as THREE from "three";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import type { AvatarMaskAsset } from "../../domain/avatar-mask";
import { createThreeAvatarMaskTrackFilter } from "./three-avatar-mask";
import type {
  ThreeAnimatorClipBinding,
  ThreeAnimatorClipResource,
} from "./three-animator-clip-resource";

type HigherOverrideCoverage = Readonly<{
  instructionIndex: number;
  sampleIndexes: readonly number[];
}>;

export type ThreeAnimatorTrackGroup = Readonly<{
  key: string;
  higherOverrideCoverages: readonly HigherOverrideCoverage[];
  tracks: readonly THREE.KeyframeTrack[];
}>;

const WEIGHT_EPSILON = 1.0e-8;

/** Compiles stable track partitions for the sequential semantics one Three mixer can evaluate. */
export class ThreeAnimatorLayerTrackPlanner {
  private readonly filters = new WeakMap<AvatarMaskAsset, Map<string, (track: THREE.KeyframeTrack) => boolean>>();

  constructor(private readonly body: THREE.Object3D) {}

  groups(
    source: ThreeAnimatorClipBinding,
    instructionIndex: number,
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): readonly ThreeAnimatorTrackGroup[] {
    const instruction = application.plan.instructions[instructionIndex];
    if (!instruction) return [];
    const masks = [...application.masksById.values()];
    const ownMask = maskForInstruction(instruction.gpuMaskIndex, masks);
    const ownFilter = ownMask ? this.filter(ownMask, application) : null;
    const byOverrides = new Map<string, {
      higherOverrideCoverages: HigherOverrideCoverage[];
      tracks: THREE.KeyframeTrack[];
      trackIndexes: number[];
    }>();

    source.clip.tracks.forEach((track, trackIndex) => {
      if (ownFilter && !ownFilter(track)) return;
      const higherOverrideCoverages: HigherOverrideCoverage[] = [];
      for (let higherIndex = instructionIndex + 1; higherIndex < application.plan.instructions.length; higherIndex += 1) {
        const higher = application.plan.instructions[higherIndex]!;
        if (higher.blendMode !== "override") continue;
        const higherMask = maskForInstruction(higher.gpuMaskIndex, masks);
        const sampleIndexes = matchingHigherSampleIndexes(
          track,
          higher,
          application,
          higherMask ? this.filter(higherMask, application) : null,
        );
        if (sampleIndexes.length > 0) higherOverrideCoverages.push({
          instructionIndex: higherIndex,
          sampleIndexes,
        });
      }
      const overrideKey = higherOverrideCoverages
        .map((coverage) => `${coverage.instructionIndex}[${coverage.sampleIndexes.join(",")}]`)
        .join(";");
      const group = byOverrides.get(overrideKey) ?? {
        higherOverrideCoverages,
        tracks: [],
        trackIndexes: [],
      };
      group.tracks.push(track);
      group.trackIndexes.push(trackIndex);
      byOverrides.set(overrideKey, group);
    });

    return [...byOverrides.entries()].map(([overrideKey, group]) => ({
      key: `${overrideKey}:${group.trackIndexes.join(",")}`,
      higherOverrideCoverages: group.higherOverrideCoverages,
      tracks: group.tracks,
    }));
  }

  layerFactor(
    group: ThreeAnimatorTrackGroup,
    instructionIndex: number,
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): number {
    const instruction = application.plan.instructions[instructionIndex];
    if (!instruction) return 0;
    let factor = boundedWeight(instruction.layerWeight);
    for (const coverage of group.higherOverrideCoverages) {
      const higher = application.plan.instructions[coverage.instructionIndex];
      if (!higher || higher.blendMode !== "override") return 0;
      const trackCoverageWeight = Math.min(1, coverage.sampleIndexes.reduce(
        (sum, sampleIndex) => sum + boundedWeight(higher.clips[sampleIndex]?.weight ?? 0),
        0,
      ));
      factor *= 1 - boundedWeight(higher.layerWeight) * trackCoverageWeight;
    }
    return factor <= WEIGHT_EPSILON ? 0 : factor;
  }

  private filter(
    mask: AvatarMaskAsset,
    application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  ): (track: THREE.KeyframeTrack) => boolean {
    const avatarKey = application.avatar
      ? `${application.avatar.id}:${application.avatar.skeleton.compatibilitySignature}`
      : "none";
    const cachedByAvatar = this.filters.get(mask) ?? new Map();
    const cached = cachedByAvatar.get(avatarKey);
    if (cached) return cached;
    const compiled = createThreeAvatarMaskTrackFilter(this.body, mask, application.avatar);
    cachedByAvatar.set(avatarKey, compiled);
    this.filters.set(mask, cachedByAvatar);
    return compiled;
  }
}

function matchingHigherSampleIndexes(
  sourceTrack: THREE.KeyframeTrack,
  instruction: AnimatorPoseApplication<ThreeAnimatorClipResource>["plan"]["instructions"][number],
  application: AnimatorPoseApplication<ThreeAnimatorClipResource>,
  maskFilter: ((track: THREE.KeyframeTrack) => boolean) | null,
): number[] {
  const sampleIndexes: number[] = [];
  instruction.clips.forEach((sample, sampleIndex) => {
    const resource = application.clipsById.get(sample.clipId)?.resource;
    const coversTrack = resource?.bindings.some((binding) => (
      binding.clip.tracks.some((track) => (
        (!maskFilter || maskFilter(track))
        && track.name === sourceTrack.name
      ))
    ));
    if (coversTrack) sampleIndexes.push(sampleIndex);
  });
  return sampleIndexes;
}

function maskForInstruction(
  gpuMaskIndex: number | null,
  masks: readonly AvatarMaskAsset[],
): AvatarMaskAsset | undefined {
  return gpuMaskIndex === null ? undefined : masks[gpuMaskIndex];
}

function boundedWeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
