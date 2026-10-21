import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  scanThreeCharacterModelWork,
  THREE_CHARACTER_MODEL_WORK_LIMITS,
  type ThreeCharacterModelWorkLimits,
} from "./three-character-model-work-limits";

describe("Three character model work limits", () => {
  it("accepts object count and hierarchy depth at the exact boundary", () => {
    const root = new THREE.Group();
    const child = new THREE.Group();
    const grandchild = new THREE.Group();
    root.add(child);
    child.add(grandchild);

    const accepted = scanThreeCharacterModelWork(root, limits({
      maximumObjects: 3,
      maximumHierarchyDepth: 2,
    }));

    expect(accepted.accepted).toBe(true);
    expect(accepted.stats).toMatchObject({ objects: 3, maximumHierarchyDepth: 2 });
    expect(scanThreeCharacterModelWork(root, limits({ maximumObjects: 2 })).diagnostics[0]?.code)
      .toBe("character-model-object-limit-exceeded");
    expect(scanThreeCharacterModelWork(root, limits({ maximumHierarchyDepth: 1 })).diagnostics[0]?.code)
      .toBe("character-model-depth-limit-exceeded");
  });

  it("bounds skinned meshes and skeleton bones at their exact totals", () => {
    const root = new THREE.Group();
    const firstBone = new THREE.Bone();
    const secondBone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([firstBone, secondBone]);
    root.add(skinnedMesh(skinnedGeometry(1), skeleton));
    root.add(skinnedMesh(skinnedGeometry(1), skeleton));
    const exact = limits({
      maximumSkinnedMeshes: 2,
      maximumBonesPerSkeleton: 2,
      maximumUniqueBones: 2,
    });

    expect(scanThreeCharacterModelWork(root, exact).accepted).toBe(true);
    expect(scanThreeCharacterModelWork(root, { ...exact, maximumSkinnedMeshes: 1 }).diagnostics[0]?.code)
      .toBe("character-skinned-mesh-limit-exceeded");
    expect(scanThreeCharacterModelWork(root, { ...exact, maximumBonesPerSkeleton: 1 }).diagnostics[0]?.code)
      .toBe("character-skeleton-bone-limit-exceeded");
    expect(scanThreeCharacterModelWork(root, { ...exact, maximumUniqueBones: 1 }).diagnostics[0]?.code)
      .toBe("character-unique-bone-limit-exceeded");
  });

  it("bounds per-geometry vertices before skin-plan allocation", () => {
    const root = new THREE.Group();
    root.add(skinnedMesh(skinnedGeometry(2), new THREE.Skeleton([new THREE.Bone()])));
    const exact = limits({
      maximumVerticesPerSkinGeometry: 2,
      maximumUniqueSkinnedVertices: 2,
      maximumInspectedSkinVertices: 2,
      maximumPlannedSkinVertices: 2,
    });

    const accepted = scanThreeCharacterModelWork(root, exact);

    expect(accepted.accepted).toBe(true);
    expect(accepted.stats).toMatchObject({
      maximumVerticesPerSkinGeometry: 2,
      uniqueSkinnedVertices: 2,
      inspectedSkinVertices: 2,
      plannedSkinVertices: 2,
    });
    expect(scanThreeCharacterModelWork(root, {
      ...exact,
      maximumVerticesPerSkinGeometry: 1,
    }).diagnostics[0]?.code).toBe("character-skin-geometry-vertex-limit-exceeded");
  });

  it("distinguishes unique, inspected, and per-variant planned skin work", () => {
    const root = new THREE.Group();
    const geometry = skinnedGeometry(2);
    root.add(skinnedMesh(geometry, new THREE.Skeleton([new THREE.Bone()])));
    root.add(skinnedMesh(geometry, new THREE.Skeleton([new THREE.Bone(), new THREE.Bone()])));
    const exact = limits({
      maximumUniqueSkinnedVertices: 2,
      maximumInspectedSkinVertices: 4,
      maximumPlannedSkinVertices: 4,
    });

    const accepted = scanThreeCharacterModelWork(root, exact);

    expect(accepted.accepted).toBe(true);
    expect(accepted.stats).toMatchObject({
      uniqueSkinnedVertices: 2,
      inspectedSkinVertices: 4,
      plannedSkinVertices: 4,
    });
    expect(codeFor(root, exact, { maximumUniqueSkinnedVertices: 1 }))
      .toContain("character-unique-skinned-vertex-limit-exceeded");
    expect(codeFor(root, exact, { maximumInspectedSkinVertices: 3 }))
      .toContain("character-skin-inspection-limit-exceeded");
    expect(codeFor(root, exact, { maximumPlannedSkinVertices: 3 }))
      .toContain("character-skin-plan-limit-exceeded");
  });

  it("bounds morph channels, target bindings, and names at the exact boundary", () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.morphAttributes.position = morphAttributes(2);
    geometry.morphAttributes.normal = morphAttributes(2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.morphTargetDictionary = { Smile: 0, Blink: 1 };
    root.add(mesh);
    const exact = limits({
      maximumMorphAttributeChannels: 2,
      maximumMorphTargets: 2,
      maximumMorphTargetNames: 2,
    });

    expect(scanThreeCharacterModelWork(root, exact).accepted).toBe(true);
    expect(codeFor(root, exact, { maximumMorphAttributeChannels: 1 }))
      .toContain("character-morph-channel-limit-exceeded");
    expect(codeFor(root, exact, { maximumMorphTargets: 1 }))
      .toContain("character-morph-target-limit-exceeded");
    expect(codeFor(root, exact, { maximumMorphTargetNames: 1 }))
      .toContain("character-morph-name-limit-exceeded");
  });
});

function limits(overrides: Partial<ThreeCharacterModelWorkLimits>): ThreeCharacterModelWorkLimits {
  return { ...THREE_CHARACTER_MODEL_WORK_LIMITS, ...overrides };
}

function codeFor(
  root: THREE.Object3D,
  base: ThreeCharacterModelWorkLimits,
  overrides: Partial<ThreeCharacterModelWorkLimits>,
): string[] {
  return scanThreeCharacterModelWork(root, { ...base, ...overrides }).diagnostics
    .map((diagnostic) => diagnostic.code);
}

function skinnedMesh(
  geometry: THREE.BufferGeometry,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.bind(skeleton);
  return mesh;
}

function skinnedGeometry(vertexCount: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4));
  return geometry;
}

function morphAttributes(count: number): THREE.Float32BufferAttribute[] {
  return Array.from({ length: count }, () => new THREE.Float32BufferAttribute([0, 0, 0], 3));
}
