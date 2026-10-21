import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { boneId } from "../../domain/skeleton";
import type { HumanoidMuscleLimit } from "../../domain/humanoid-avatar";
import type { HumanoidRetargetPlan, RetargetBonePlan } from "../../runtime/retarget-plan";
import { retargetThreeClipSafely } from "./three-retarget-adapter";

type RigFixture = Readonly<{
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  hips: THREE.Bone;
  spine: THREE.Bone;
}>;

function createRig(
  name: string,
  reference: Partial<Record<"hips" | "spine", THREE.Quaternion>> = {},
): RigFixture {
  const root = new THREE.Group();
  root.name = `${name}Root`;
  const hips = new THREE.Bone();
  hips.name = "Hips";
  hips.position.set(0, 1, 0);
  if (reference.hips) hips.quaternion.copy(reference.hips);
  const spine = new THREE.Bone();
  spine.name = "Spine";
  spine.position.set(0, 0.5, 0);
  if (reference.spine) spine.quaternion.copy(reference.spine);
  hips.add(spine);
  root.add(hips);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.8, 0.2, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = `${name}Mesh`;
  mesh.bind(new THREE.Skeleton([hips, spine]));
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh, hips, spine };
}

function plan(): HumanoidRetargetPlan {
  const hips: RetargetBonePlan = {
    humanBone: "hips",
    sourceBoneId: boneId("source-hips"),
    targetBoneId: boneId("target-hips"),
    sourceBoneName: "Hips",
    targetBoneName: "Hips",
    sourceBoneIndex: 0,
    targetBoneIndex: 0,
    referenceRotationOffset: [0, 0, 0, 1],
  };
  return {
    version: 1,
    kind: "humanoid",
    cacheKey: "retarget-plan-v1",
    sourceSkeletonSignature: "source",
    targetSkeletonSignature: "target",
    rootScale: 1,
    rootAxisRotation: [0, 0, 0, 1],
    hips,
    bones: [hips, {
      humanBone: "spine",
      sourceBoneId: boneId("source-spine"),
      targetBoneId: boneId("target-spine"),
      sourceBoneName: "Spine",
      targetBoneName: "Spine",
      sourceBoneIndex: 1,
      targetBoneIndex: 1,
      referenceRotationOffset: [0, 0, 0, 1],
    }],
  };
}

function sourceClip(): THREE.AnimationClip {
  return new THREE.AnimationClip("Turn", 1, [
    new THREE.QuaternionKeyframeTrack(
      ".bones[Hips].quaternion",
      [0, 1],
      [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
    ),
    new THREE.QuaternionKeyframeTrack(
      ".bones[Spine].quaternion",
      [0, 1],
      [0, 0, 0, 1, Math.SQRT1_2, 0, 0, Math.SQRT1_2],
    ),
  ]);
}

describe("safe Three retarget adapter", () => {
  it("bakes each distinct target skeleton and restores authored poses", () => {
    const source = createRig("Source");
    const first = createRig("First");
    const second = createRig("Second");
    const targetRoot = new THREE.Group();
    targetRoot.add(first.root, second.root);
    first.hips.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.2);
    second.spine.position.set(0, 0.8, 0);
    targetRoot.updateMatrixWorld(true);
    const sourceBefore = source.hips.quaternion.toArray();
    const firstBefore = first.hips.quaternion.toArray();
    const secondBefore = second.spine.position.toArray();

    const result = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot,
      sourceClip: sourceClip(),
      plan: plan(),
      sampleRateHz: 24,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.cacheKey).toBe("retarget-plan-v1");
    expect(result.value?.bindings).toHaveLength(2);
    expect(result.value?.bindings.every((binding) => binding.clip.tracks.length > 0)).toBe(true);
    expect(source.hips.quaternion.toArray()).toEqual(sourceBefore);
    expect(first.hips.quaternion.toArray()).toEqual(firstBefore);
    expect(second.spine.position.toArray()).toEqual(secondBefore);
  });

  it("bakes a nested same-name accessory skin through its primary skeleton", () => {
    const source = createRig("Source");
    const target = createRig("Target");
    const aliasHips = new THREE.Bone();
    const aliasSpine = new THREE.Bone();
    aliasHips.name = target.hips.name;
    aliasSpine.name = target.spine.name;
    target.hips.add(aliasHips);
    target.spine.add(aliasSpine);
    const accessory = new THREE.SkinnedMesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    accessory.name = "Accessory";
    accessory.bind(new THREE.Skeleton([aliasHips, aliasSpine]));
    target.root.add(accessory);
    target.root.updateMatrixWorld(true);

    const result = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: target.root,
      sourceClip: sourceClip(),
      plan: plan(),
      sampleRateHz: 24,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value?.bindings).toHaveLength(1);
    expect(result.value?.bindings[0]?.target).toBe(target.mesh);
  });

  it("returns diagnostics instead of an unbound source-clip fallback", () => {
    const source = createRig("Source");
    const missingTarget = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: new THREE.Group(),
      sourceClip: sourceClip(),
      plan: plan(),
    });
    expect(missingTarget.value).toBeNull();
    expect(missingTarget.diagnostics.map((item) => item.code)).toEqual(["missing-target-skinned-mesh"]);

    const ambiguousTarget = createRig("Ambiguous");
    const duplicate = new THREE.Bone();
    duplicate.name = "Hips";
    ambiguousTarget.spine.add(duplicate);
    ambiguousTarget.mesh.skeleton = new THREE.Skeleton([
      ambiguousTarget.hips,
      ambiguousTarget.spine,
      duplicate,
    ]);
    const ambiguous = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: ambiguousTarget.root,
      sourceClip: sourceClip(),
      plan: plan(),
    });
    expect(ambiguous.value).toBeNull();
    expect(ambiguous.diagnostics.map((item) => item.code)).toContain("ambiguous-target-bone-name");
  });

  it("restores the target pose when Three fails during baking", () => {
    const source = createRig("Source");
    const target = createRig("Target");
    target.hips.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.31);
    target.root.updateMatrixWorld(true);
    const before = target.hips.quaternion.toArray();
    target.spine.matrix.decompose = () => {
      throw new Error("synthetic bake failure");
    };

    const result = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: target.root,
      sourceClip: sourceClip(),
      plan: plan(),
    });

    expect(result.value).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toContain("three-retarget-failed");
    expect(target.hips.quaternion.toArray()).toEqual(before);
  });

  it("safely bakes a tiny clip with exactly two finite samples", () => {
    const source = createRig("Source");
    const target = createRig("Target");
    const tiny = new THREE.AnimationClip("Tiny", 0.02, [
      new THREE.QuaternionKeyframeTrack(
        ".bones[Hips].quaternion",
        [0, 0.02],
        [0, 0, 0, 1, 0, 0.01, 0, 0.99995],
      ),
    ]);

    const result = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: target.root,
      sourceClip: tiny,
      plan: plan(),
      sampleRateHz: 30,
    });

    expect(result.diagnostics).toEqual([]);
    const baked = result.value!.bindings[0]!.clip;
    expect(baked.tracks.every((track) => track.times.length === 2)).toBe(true);
    expect(baked.tracks.every((track) => [...track.values].every(Number.isFinite))).toBe(true);

    const tooShortClip = tiny.clone();
    tooShortClip.duration = 0.01;
    const tooShort = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: target.root,
      sourceClip: tooShortClip,
      plan: plan(),
      sampleRateHz: 30,
    });
    expect(tooShort.value).toBeNull();
    expect(tooShort.diagnostics.map((item) => item.code)).toEqual(["retarget-clip-too-short"]);
  });

  it("preserves a non-identity neutral pose and axis-converts rotation and root translation", () => {
    const sourceReference = {
      hips: quaternion(new THREE.Vector3(1, 0, 0), 0.37),
      spine: quaternion(new THREE.Vector3(0, 1, 0), -0.29),
    };
    const targetReference = {
      hips: quaternion(new THREE.Vector3(0, 0, 1), 0.41),
      spine: quaternion(new THREE.Vector3(1, 0, 0), -0.23),
    };
    const source = createRig("Source", sourceReference);
    const target = createRig("Target", targetReference);
    source.root.position.set(3, -2, 4);
    source.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.2);
    source.root.scale.setScalar(1.3);
    const targetParent = new THREE.Group();
    targetParent.position.set(-4, 3, 2);
    targetParent.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.31);
    targetParent.scale.setScalar(0.8);
    target.root.position.set(1, 2, -3);
    target.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.27);
    targetParent.add(target.root);
    targetParent.updateMatrixWorld(true);
    const targetRootBefore = target.root.matrixWorld.toArray();
    const axis = quaternion(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const sourceHipsGlobal = sourceReference.hips.clone();
    const sourceSpineGlobal = sourceHipsGlobal.clone().multiply(sourceReference.spine);
    const targetHipsGlobal = targetReference.hips.clone();
    const targetSpineGlobal = targetHipsGlobal.clone().multiply(targetReference.spine);
    const axisInverse = axis.clone().invert();
    const hipsOffset = sourceHipsGlobal.clone().invert().multiply(axisInverse).multiply(targetHipsGlobal);
    const spineOffset = sourceSpineGlobal.clone().invert().multiply(axisInverse).multiply(targetSpineGlobal);
    const referencePlan = planWithReferences(axis, hipsOffset, spineOffset);
    const animatedHips = sourceReference.hips.clone()
      .multiply(quaternion(new THREE.Vector3(1, 0, 0), 0.53));
    const clip = new THREE.AnimationClip("AxisTurn", 1, [
      new THREE.QuaternionKeyframeTrack(
        ".bones[Hips].quaternion",
        [0, 1],
        [...sourceReference.hips.toArray(), ...animatedHips.toArray()],
      ),
      new THREE.QuaternionKeyframeTrack(
        ".bones[Spine].quaternion",
        [0, 1],
        [...sourceReference.spine.toArray(), ...sourceReference.spine.toArray()],
      ),
      new THREE.VectorKeyframeTrack(
        ".bones[Hips].position",
        [0, 1],
        [0, 1, 0, 0, 1, 1],
      ),
    ]);

    const result = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: target.root,
      sourceClip: clip,
      plan: referencePlan,
      sampleRateHz: 12,
    });

    expect(result.diagnostics).toEqual([]);
    const baked = result.value!.bindings[0]!.clip;
    const hipsTrack = quaternionTrack(baked, "Hips");
    const spineTrack = quaternionTrack(baked, "Spine");
    expectQuaternionAt(hipsTrack, 0, targetReference.hips);
    expectQuaternionAt(spineTrack, 0, targetReference.spine);

    const sourceDelta = animatedHips.clone().multiply(sourceReference.hips.clone().invert());
    const expectedFinalHips = axis.clone().multiply(sourceDelta).multiply(axis.clone().invert())
      .multiply(targetReference.hips);
    expectQuaternionAt(hipsTrack, hipsTrack.times.length - 1, expectedFinalHips, 5e-4);
    expectQuaternionAt(spineTrack, spineTrack.times.length - 1, targetReference.spine, 5e-4);

    const hipsPosition = vectorTrack(baked, "Hips");
    expect([...hipsPosition.values.slice(0, 3)]).toEqual([0, 1, 0]);
    const last = hipsPosition.values.length - 3;
    expect(hipsPosition.values[last]).toBeCloseTo(1, 4);
    expect(hipsPosition.values[last + 1]).toBeCloseTo(1, 4);
    expect(hipsPosition.values[last + 2]).toBeCloseTo(0, 4);
    expect(target.root.matrixWorld.toArray()).toEqual(targetRootBefore);
  });

  it("bakes Avatar muscles and distributes axial rotation across twist helpers", () => {
    const source = createRig("Source");
    const target = createRig("Target");
    const twist = new THREE.Bone();
    twist.name = "Hips_Twist";
    target.hips.add(twist);
    target.mesh.skeleton = new THREE.Skeleton([target.hips, target.spine, twist]);
    target.root.updateMatrixWorld(true);
    const complete = musclePlan({
      twistChains: [{
        humanBone: "hips",
        targetChildHumanBone: "spine",
        targetBoneName: "Hips",
        axis: [0, 1, 0],
        distribution: 0.5,
        helperBones: [{
          targetBoneId: boneId("target-hips-twist"),
          targetBoneName: "Hips_Twist",
          referenceLocalRotation: [0, 0, 0, 1],
        }],
      }],
    });

    const result = retargetThreeClipSafely({
      sourceRoot: source.root,
      targetRoot: target.root,
      sourceClip: sourceClip(),
      plan: complete,
      sampleRateHz: 12,
    });

    expect(result.diagnostics).toEqual([]);
    const clip = result.value!.bindings[0]!.clip;
    const hips = quaternionTrack(clip, "Hips");
    const helper = quaternionTrack(clip, "Hips_Twist");
    const expected = quaternion(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    expectQuaternionAt(hips, hips.times.length - 1, expected, 5e-4);
    expectQuaternionAt(helper, helper.times.length - 1, expected, 5e-4);
  });
});

function musclePlan(
  overrides: Partial<HumanoidRetargetPlan> = {},
): HumanoidRetargetPlan {
  const base = plan();
  const limit: HumanoidMuscleLimit = {
    minimum: [-Math.PI, -Math.PI, -Math.PI],
    maximum: [Math.PI, Math.PI, Math.PI],
  };
  const bones = base.bones.map((bone) => ({
    ...bone,
    sourceReferenceLocalRotation: [0, 0, 0, 1] as const,
    targetReferenceLocalRotation: [0, 0, 0, 1] as const,
    sourceParentReferenceRotation: [0, 0, 0, 1] as const,
    targetParentReferenceRotation: [0, 0, 0, 1] as const,
    sourceMuscleLimit: limit,
    targetMuscleLimit: limit,
  }));
  return { ...base, hips: bones[0]!, bones, ...overrides };
}

function planWithReferences(
  axis: THREE.Quaternion,
  hipsOffset: THREE.Quaternion,
  spineOffset: THREE.Quaternion,
): HumanoidRetargetPlan {
  const base = plan();
  const hips = { ...base.hips, referenceRotationOffset: hipsOffset.toArray() };
  return {
    ...base,
    rootAxisRotation: axis.toArray(),
    hips,
    bones: [hips, { ...base.bones[1]!, referenceRotationOffset: spineOffset.toArray() }],
  };
}

function quaternion(axis: THREE.Vector3, angle: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

function quaternionTrack(clip: THREE.AnimationClip, boneName: string): THREE.QuaternionKeyframeTrack {
  const track = clip.tracks.find((candidate) => candidate.name === `.bones[${boneName}].quaternion`);
  expect(track).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
  return track as THREE.QuaternionKeyframeTrack;
}

function vectorTrack(clip: THREE.AnimationClip, boneName: string): THREE.VectorKeyframeTrack {
  const track = clip.tracks.find((candidate) => candidate.name === `.bones[${boneName}].position`);
  expect(track).toBeInstanceOf(THREE.VectorKeyframeTrack);
  return track as THREE.VectorKeyframeTrack;
}

function expectQuaternionAt(
  track: THREE.QuaternionKeyframeTrack,
  keyframe: number,
  expected: THREE.Quaternion,
  tolerance = 1e-5,
): void {
  const offset = keyframe * 4;
  const actual = new THREE.Quaternion(
    track.values[offset]!,
    track.values[offset + 1]!,
    track.values[offset + 2]!,
    track.values[offset + 3]!,
  );
  expect(actual.angleTo(expected)).toBeLessThan(tolerance);
}
