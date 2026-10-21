import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { RigImportSettings } from "../../domain/rig";
import { disposeObject } from "../../../three/dispose";
import {
  applyThreeRigImportPolicies,
  isMorphTargetTrack,
  normalizeThreeSkinInfluences,
} from "./three-rig-import-policy";
import { THREE_CHARACTER_MODEL_WORK_LIMITS } from "./three-character-model-work-limits";

function createPolicyFixture(): {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  animations: THREE.AnimationClip[];
} {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = "Hips";
  const spine = new THREE.Bone();
  spine.name = "Spine";
  hips.add(spine);
  root.add(hips);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([
    0, 1, 0, 1,
    99, 0, 0, 0,
  ], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([
    0.6, 0.2, 0.15, 0.05,
    1, 0, 0, 0,
  ], 4));
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 0.1, 0,
  ], 3)];

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = "Body";
  mesh.bind(new THREE.Skeleton([hips, spine]));
  mesh.updateMorphTargets();
  mesh.morphTargetDictionary = { Smile: 0 };
  root.add(mesh);
  root.updateMatrixWorld(true);

  const clip = new THREE.AnimationClip("Wave", 1, [
    new THREE.NumberKeyframeTrack("Body.morphTargetInfluences[Smile]", [0, 1], [0, 1]),
    new THREE.QuaternionKeyframeTrack(
      ".bones[Hips].quaternion",
      [0, 1],
      [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2],
    ),
  ]);
  return { root, mesh, animations: [clip] };
}

function createSharedSkinFixture(boneCounts: readonly number[]): {
  root: THREE.Group;
  sourceGeometry: THREE.BufferGeometry;
  meshes: THREE.SkinnedMesh[];
} {
  const root = new THREE.Group();
  const sourceGeometry = new THREE.BufferGeometry();
  sourceGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  sourceGeometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 2, 1, 0], 4));
  sourceGeometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.5, 0.3, 0.2, 0], 4));
  const meshes = boneCounts.map((boneCount, meshIndex) => {
    const mesh = new THREE.SkinnedMesh(sourceGeometry, new THREE.MeshBasicMaterial());
    mesh.name = `Body ${meshIndex}`;
    const bones = Array.from({ length: boneCount }, (_, boneIndex) => {
      const bone = new THREE.Bone();
      bone.name = `Bone ${meshIndex}:${boneIndex}`;
      return bone;
    });
    mesh.bind(new THREE.Skeleton(bones));
    root.add(mesh);
    return mesh;
  });
  return { root, sourceGeometry, meshes };
}

describe("Three rig import policies", () => {
  it("prunes, normalizes, and repairs skin weights deterministically", () => {
    const { root, mesh } = createPolicyFixture();
    const result = normalizeThreeSkinInfluences(root, 2);
    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");

    expect(result.changed).toBe(true);
    expect([weights.getX(0), weights.getY(0), weights.getZ(0), weights.getW(0)])
      .toEqual([0.75, 0.25, 0, 0]);
    expect([indices.getX(1), weights.getX(1), weights.getY(1)]).toEqual([0, 1, 0]);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "skin-influences-pruned",
      "skin-weights-normalized",
      "empty-skin-weights-repaired",
      "invalid-skin-influences-removed",
    ]));
  });

  it("isolates shared geometry when skeleton sizes require different normalized outputs", () => {
    const { root, sourceGeometry, meshes } = createSharedSkinFixture([2, 3]);
    const [smallSkeletonMesh, largeSkeletonMesh] = meshes as [THREE.SkinnedMesh, THREE.SkinnedMesh];

    const result = normalizeThreeSkinInfluences(root, 4);
    const smallIndices = smallSkeletonMesh.geometry.getAttribute("skinIndex");
    const smallWeights = smallSkeletonMesh.geometry.getAttribute("skinWeight");
    const largeIndices = largeSkeletonMesh.geometry.getAttribute("skinIndex");
    const largeWeights = largeSkeletonMesh.geometry.getAttribute("skinWeight");

    expect(result.changed).toBe(true);
    expect(smallSkeletonMesh.geometry).not.toBe(sourceGeometry);
    expect(largeSkeletonMesh.geometry).toBe(sourceGeometry);
    expect(smallSkeletonMesh.geometry).not.toBe(largeSkeletonMesh.geometry);
    expect([smallIndices.getX(0), smallIndices.getY(0)]).toEqual([0, 1]);
    expect([smallWeights.getX(0), smallWeights.getY(0)]).toEqual([expect.closeTo(5 / 7), expect.closeTo(2 / 7)]);
    expect([largeIndices.getX(0), largeIndices.getY(0), largeIndices.getZ(0)]).toEqual([0, 2, 1]);
    expect([largeWeights.getX(0), largeWeights.getY(0), largeWeights.getZ(0)])
      .toEqual([0.5, expect.closeTo(0.3), expect.closeTo(0.2)]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("invalid-skin-influences-removed");
  });

  it("keeps geometry shared when bindings have equivalent skeleton constraints", () => {
    const { root, sourceGeometry, meshes } = createSharedSkinFixture([3, 4]);

    const result = normalizeThreeSkinInfluences(root, 1);

    expect(result.changed).toBe(true);
    expect(meshes[0]?.geometry).toBe(sourceGeometry);
    expect(meshes[1]?.geometry).toBe(sourceGeometry);
    expect(sourceGeometry.getAttribute("skinWeight").getX(0)).toBe(1);
  });

  it("owns and disposes an isolated variant without mutating leased source geometry", () => {
    const { root, sourceGeometry, meshes } = createSharedSkinFixture([3, 4]);
    for (const mesh of meshes) mesh.userData.sharedGeometry = true;
    const sourceDispose = vi.spyOn(sourceGeometry, "dispose");

    const result = normalizeThreeSkinInfluences(root, 1);
    const isolatedGeometry = meshes[0]!.geometry;
    const isolatedDispose = vi.spyOn(isolatedGeometry, "dispose");

    expect(result.changed).toBe(true);
    expect(isolatedGeometry).not.toBe(sourceGeometry);
    expect(meshes[1]?.geometry).toBe(isolatedGeometry);
    expect(meshes[0]?.userData.sharedGeometry).toBe(false);
    expect(meshes[1]?.userData.sharedGeometry).toBe(false);
    expect(sourceGeometry.getAttribute("skinWeight").getX(0)).toBe(0.5);
    expect(isolatedGeometry.getAttribute("skinWeight").getX(0)).toBe(1);

    disposeObject(root);
    expect(isolatedDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it("rejects an empty skeleton without fabricating a bone-zero binding", () => {
    const { root, sourceGeometry, meshes } = createSharedSkinFixture([0]);
    const originalIndices = Array.from(sourceGeometry.getAttribute("skinIndex").array);
    const originalWeights = Array.from(sourceGeometry.getAttribute("skinWeight").array);

    const result = normalizeThreeSkinInfluences(root, 4);

    expect(result.changed).toBe(false);
    expect(meshes[0]?.geometry).toBe(sourceGeometry);
    expect(Array.from(sourceGeometry.getAttribute("skinIndex").array)).toEqual(originalIndices);
    expect(Array.from(sourceGeometry.getAttribute("skinWeight").array)).toEqual(originalWeights);
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: "empty-skin-skeleton",
      severity: "error",
    })]);
  });

  it("rejects an oversized model before mutating skin or morph data", () => {
    const { root, mesh, animations } = createPolicyFixture();
    const skinWeight = mesh.geometry.getAttribute("skinWeight");
    const morphPosition = mesh.geometry.morphAttributes.position;
    for (let index = root.children.length + 1;
      index <= THREE_CHARACTER_MODEL_WORK_LIMITS.maximumObjects;
      index += 1) {
      root.add(new THREE.Group());
    }

    const result = applyThreeRigImportPolicies(root, animations, {
      kind: "generic",
      importBlendShapes: false,
      maxBoneInfluences: 1,
      optimizeBones: false,
    });

    expect(result.changed).toBe(false);
    expect(result.animations).toBe(animations);
    expect(result.diagnostics[0]?.code).toBe("character-model-object-limit-exceeded");
    expect(mesh.geometry.getAttribute("skinWeight")).toBe(skinWeight);
    expect(mesh.geometry.morphAttributes.position).toBe(morphPosition);
    expect(mesh.morphTargetDictionary).toEqual({ Smile: 0 });
  });

  it("strips imported blend shapes and only their animation tracks", () => {
    const { root, mesh, animations } = createPolicyFixture();
    const settings: RigImportSettings = {
      kind: "generic",
      importBlendShapes: false,
      maxBoneInfluences: 4,
      optimizeBones: false,
    };
    const result = applyThreeRigImportPolicies(root, animations, settings);

    expect(result.skinnedContent).toBe(true);
    expect(result.changed).toBe(true);
    expect(mesh.geometry.morphAttributes).toEqual({});
    expect(mesh.morphTargetDictionary).toBeUndefined();
    expect(result.animations[0]?.tracks.map((track) => track.name)).toEqual([
      ".bones[Hips].quaternion",
    ]);
    expect(animations[0]?.tracks).toHaveLength(2);
    expect(result.diagnostics.map((item) => item.code)).toContain("blend-shapes-stripped");
  });

  it("recognizes morph tracks without stripping similarly named properties", () => {
    expect(isMorphTargetTrack("Face.morphTargetInfluences[Smile]")).toBe(true);
    expect(isMorphTargetTrack("Face.material.morphTargetInfluencesEnabled")).toBe(false);
  });
});
