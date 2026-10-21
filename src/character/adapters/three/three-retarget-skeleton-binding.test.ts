import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  threeRetargetTargetMeshes,
  uniqueThreeSkeletonMeshes,
} from "./three-retarget-skeleton-binding";

describe("Three retarget target skeleton selection", () => {
  it("skips a nested same-name skin alias that inherits the primary pose", () => {
    const root = new THREE.Group();
    const hips = bone("Hips");
    const spine = bone("Spine");
    const aliasHips = bone("Hips");
    const aliasSpine = bone("Spine");
    hips.add(spine, aliasHips);
    spine.add(aliasSpine);
    const primary = skinnedMesh("Primary", [hips, spine]);
    const alias = skinnedMesh("Accessory", [aliasHips, aliasSpine]);
    root.add(hips, primary, alias);

    expect(uniqueThreeSkeletonMeshes(root)).toEqual([primary, alias]);
    expect(threeRetargetTargetMeshes(root)).toEqual([primary]);
  });

  it("keeps genuinely separate skeletons even when their bone names match", () => {
    const root = new THREE.Group();
    const firstHips = bone("Hips");
    const secondHips = bone("Hips");
    const first = skinnedMesh("First", [firstHips]);
    const second = skinnedMesh("Second", [secondHips]);
    root.add(firstHips, secondHips, first, second);

    expect(threeRetargetTargetMeshes(root)).toEqual([first, second]);
  });
});

function bone(name: string): THREE.Bone {
  const value = new THREE.Bone();
  value.name = name;
  return value;
}

function skinnedMesh(name: string, bones: THREE.Bone[]): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.bind(new THREE.Skeleton(bones));
  return mesh;
}
