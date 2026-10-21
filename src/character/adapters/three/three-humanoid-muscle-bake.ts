import * as THREE from "three";
import type { HumanoidRetargetPlan, RetargetBonePlan } from "../../runtime/retarget-plan";
import {
  transferHumanoidMuscleRotation,
} from "../../runtime/humanoid-muscle-pose";
import type { CharacterQuaternion } from "../../runtime/pose-math";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

type BakeHumanoidMuscleTracksInput = Readonly<{
  sourceRoot: THREE.Object3D;
  sourceSkeleton: THREE.Skeleton;
  sourceClip: THREE.AnimationClip;
  targetSkeleton: THREE.Skeleton;
  baseClip: THREE.AnimationClip;
  plan: HumanoidRetargetPlan;
  sampleRateHz: number;
}>;

/** Replaces SkeletonUtils rotations with normalized Avatar-muscle reconstruction. */
export function bakeThreeHumanoidMuscleTracks(
  input: BakeHumanoidMuscleTracksInput,
): CharacterRuntimeResult<THREE.AnimationClip> {
  if (!input.plan.bones.every(completeMusclePlan)) {
    return characterRuntimeFailure(
      "incomplete-humanoid-muscle-plan",
      "The retarget plan does not contain complete Avatar muscle reference data.",
    );
  }
  const pairs = input.plan.bones.flatMap((plan) => {
    const source = input.sourceSkeleton.getBoneByName(plan.sourceBoneName);
    const target = input.targetSkeleton.getBoneByName(plan.targetBoneName);
    return source && target ? [{ plan, source, target }] : [];
  });
  if (!pairs.some(({ plan }) => plan.humanBone === "hips")) return characterRuntimeFailure(
    "missing-muscle-bake-hips",
    "Humanoid muscle baking requires mapped hips in the source and target skins.",
  );

  const frameCount = Math.round(input.sourceClip.duration * input.sampleRateHz);
  if (!Number.isSafeInteger(frameCount) || frameCount < 2) return characterRuntimeFailure(
    "invalid-muscle-bake-sample-count",
    "Humanoid muscle baking requires at least two bounded samples.",
  );
  const times = new Float32Array(frameCount);
  const values = new Map<string, Float32Array>();
  pairs.forEach(({ target }) => values.set(target.name, new Float32Array(frameCount * 4)));
  for (const chain of input.plan.twistChains ?? []) {
    chain.helperBones.forEach((bone) => {
      if (input.targetSkeleton.getBoneByName(bone.targetBoneName)) {
        values.set(bone.targetBoneName, new Float32Array(frameCount * 4));
      }
    });
  }

  const mixerRoot = new THREE.SkeletonHelper(input.sourceSkeleton.bones[0]!);
  (mixerRoot as THREE.SkeletonHelper & { skeleton: THREE.Skeleton }).skeleton = input.sourceSkeleton;
  const mixer = new THREE.AnimationMixer(mixerRoot);
  const sourceRotations = pairs.map(({ source }) => source.quaternion.clone());
  const action = mixer.clipAction(input.sourceClip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  try {
    const delta = input.sourceClip.duration / (frameCount - 1);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = frame * delta;
      times[frame] = time;
      mixer.setTime(time);
      input.sourceRoot.updateMatrixWorld(true);
      for (const pair of pairs) {
        const transferred = transferHumanoidMuscleRotation({
          sourceLocalRotation: pair.source.quaternion.toArray(),
          sourceReferenceLocalRotation: pair.plan.sourceReferenceLocalRotation!,
          sourceParentReferenceRotation: pair.plan.sourceParentReferenceRotation!,
          targetReferenceLocalRotation: pair.plan.targetReferenceLocalRotation!,
          targetParentReferenceRotation: pair.plan.targetParentReferenceRotation!,
          axisAlignment: input.plan.rootAxisRotation,
          sourceLimit: pair.plan.sourceMuscleLimit,
          targetLimit: pair.plan.targetMuscleLimit,
        });
        if (!transferred) return characterRuntimeFailure(
          "invalid-humanoid-muscle-sample",
          `Could not encode the ${pair.plan.humanBone} rotation as a finite muscle sample.`,
        );
        writeQuaternion(values.get(pair.target.name)!, frame, transferred.rotation);
      }
      distributeTwist(input, values, frame);
    }
  } finally {
    action.stop();
    mixer.uncacheAction(input.sourceClip, mixerRoot);
    mixer.uncacheRoot(mixerRoot);
    pairs.forEach(({ source }, index) => source.quaternion.copy(sourceRotations[index]!));
    input.sourceRoot.updateMatrixWorld(true);
    mixerRoot.geometry.dispose();
    if (Array.isArray(mixerRoot.material)) mixerRoot.material.forEach((material) => material.dispose());
    else mixerRoot.material.dispose();
  }

  const replacedNames = new Set(values.keys());
  const retained = input.baseClip.tracks.filter((track) => {
    const match = /^\.bones\[([^\]]+)]\.quaternion$/.exec(track.name);
    return !match || !replacedNames.has(match[1]!);
  });
  const tracks = [...retained, ...[...values].map(([name, rotations]) => (
    new THREE.QuaternionKeyframeTrack(`.bones[${name}].quaternion`, times, rotations)
  ))];
  return characterRuntimeSuccess(new THREE.AnimationClip(
    input.baseClip.name,
    input.baseClip.duration,
    tracks,
  ));
}

function completeMusclePlan(plan: RetargetBonePlan): boolean {
  return Boolean(
    plan.sourceReferenceLocalRotation
    && plan.targetReferenceLocalRotation
    && plan.sourceParentReferenceRotation
    && plan.targetParentReferenceRotation
    && plan.sourceMuscleLimit
    && plan.targetMuscleLimit,
  );
}

function distributeTwist(
  input: BakeHumanoidMuscleTracksInput,
  values: ReadonlyMap<string, Float32Array>,
  frame: number,
): void {
  const identity = new THREE.Quaternion();
  for (const chain of input.plan.twistChains ?? []) {
    if (chain.helperBones.length === 0 || chain.distribution <= 0) continue;
    const sourcePlan = input.plan.bones.find((bone) => bone.humanBone === chain.humanBone);
    const sourceValues = values.get(chain.targetBoneName);
    if (!sourcePlan?.targetReferenceLocalRotation || !sourceValues) continue;
    const rotation = readQuaternion(sourceValues, frame);
    const reference = new THREE.Quaternion().fromArray(sourcePlan.targetReferenceLocalRotation);
    const delta = rotation.clone().multiply(reference.clone().invert()).normalize();
    const axis = new THREE.Vector3().fromArray(chain.axis).normalize();
    const projection = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
    const twist = new THREE.Quaternion(
      axis.x * projection,
      axis.y * projection,
      axis.z * projection,
      delta.w,
    ).normalize();
    const swing = delta.clone().multiply(twist.clone().invert()).normalize();
    const distributed = Math.min(1, Math.max(0, chain.distribution));
    const retainedTwist = identity.clone().slerp(twist, 1 - distributed);
    writeQuaternion(
      sourceValues,
      frame,
      swing.multiply(retainedTwist).multiply(reference).normalize().toArray(),
    );
    const helperShare = distributed / chain.helperBones.length;
    const signedTwistAngle = 2 * Math.atan2(projection, delta.w);
    for (const helper of chain.helperBones) {
      const helperValues = values.get(helper.targetBoneName);
      if (!helperValues) continue;
      const helperAxis = new THREE.Vector3().fromArray(helper.axis ?? chain.axis).normalize();
      const helperTwist = new THREE.Quaternion().setFromAxisAngle(
        helperAxis,
        signedTwistAngle * helperShare,
      );
      helperTwist.multiply(new THREE.Quaternion().fromArray(helper.referenceLocalRotation)).normalize();
      writeQuaternion(helperValues, frame, helperTwist.toArray());
    }
  }
}

function writeQuaternion(
  values: Float32Array,
  frame: number,
  rotation: CharacterQuaternion,
): void {
  values.set(rotation, frame * 4);
}

function readQuaternion(values: Float32Array, frame: number): THREE.Quaternion {
  return new THREE.Quaternion().fromArray(values, frame * 4);
}
