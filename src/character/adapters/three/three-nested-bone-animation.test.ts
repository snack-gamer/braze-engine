import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import { ThreeAnimatorActionCache, type ThreeAnimatorClipResource } from "./three-animator-action-cache";

describe("Three nested bone animation", () => {
  it("animates a same-named skin alias through its outer bone", () => {
    const body = new THREE.Group();
    const animated = new THREE.Bone();
    const skinAlias = new THREE.Bone();
    animated.name = "Animated";
    skinAlias.name = "Animated";
    animated.add(skinAlias);
    const outerSkin = skinnedMesh("OuterSkin", animated);
    const aliasSkin = skinnedMesh("AliasSkin", skinAlias);
    body.add(animated, outerSkin, aliasSkin);
    const clip = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    ]);
    const clipsById = new Map([["move", {
      id: "move",
      resource: { bindings: [{ root: body, clip }] },
      metadata: { durationSeconds: 1, looping: true, events: [] },
    }]]);
    const cache = new ThreeAnimatorActionCache(body);

    try {
      const result = cache.apply(application(clipsById));
      body.updateMatrixWorld(true);

      expect(result.diagnostics).toEqual([]);
      expect(result.value?.changed).toBe(true);
      expect(animated.position.x).toBeCloseTo(1, 6);
      expect(skinAlias.position.x).toBe(0);
      expect(skinAlias.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(1, 6);
    } finally {
      cache.dispose();
      disposeSkinnedMesh(outerSkin);
      disposeSkinnedMesh(aliasSkin);
    }
  });
});

function application(
  clipsById: AnimatorPoseApplication<ThreeAnimatorClipResource>["clipsById"],
): AnimatorPoseApplication<ThreeAnimatorClipResource> {
  return {
    plan: {
      controllerId: "controller",
      controllerRevision: "r1",
      instructions: [{
        layerId: "base",
        blendMode: "override",
        layerWeight: 1,
        gpuMaskIndex: null,
        clips: [{
          sampleId: "move",
          clipId: "move",
          unwrappedLocalTimeSeconds: 0.5,
          localTimeSeconds: 0.5,
          weight: 1,
        }],
      }],
    },
    clipsById,
    masksById: new Map(),
  };
}

function skinnedMesh(name: string, bone: THREE.Bone): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.bind(new THREE.Skeleton([bone]));
  return mesh;
}

function disposeSkinnedMesh(mesh: THREE.SkinnedMesh): void {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => material.dispose());
}
