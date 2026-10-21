import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AnimatorPlaybackAvatar, AnimatorPoseApplication } from "../../application/playback/animator-playback-contracts";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import { extractThreeSkeletonDefinition } from "./three-skeleton-extractor";
import { ThreeHumanoidIkSolver } from "./three-humanoid-ik";

describe("Three Humanoid IK", () => {
  it("solves a weighted two-bone hand goal after animation evaluation", () => {
    const { body, hand } = armRig();
    const extraction = extractThreeSkeletonDefinition(body);
    const skeleton = extraction.definition!;
    const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone.id]));
    const avatar: AnimatorPlaybackAvatar = {
      id: "avatar",
      kind: "humanoid",
      skeleton,
      definition: {
        version: 1,
        id: "avatar",
        name: "Avatar",
        revision: "r1",
        sourceRef: { guid: "a".repeat(32), localId: "avatar" },
        skeletonRef: { guid: "a".repeat(32), localId: "skeleton" },
        mapping: {
          leftUpperArm: byName.get("UpperArm")!,
          leftLowerArm: byName.get("LowerArm")!,
          leftHand: byName.get("Hand")!,
        },
        referencePose: { space: "skeletonLocal", bones: {} },
        humanScale: 2,
        forwardAxis: "+z",
        upAxis: "+y",
        tuning: {
          armStretch: 0.05,
          legStretch: 0.05,
          upperArmTwist: 0.5,
          lowerArmTwist: 0.5,
          upperLegTwist: 0.5,
          lowerLegTwist: 0.5,
          feetSpacing: 0,
          hasTranslationDof: false,
        },
        validation: { status: "valid", issues: [] },
      },
    };
    const application: AnimatorPoseApplication<ThreeAnimatorClipResource> = {
      plan: {
        controllerId: "controller",
        controllerRevision: "r1",
        instructions: [{
          layerId: "base",
          blendMode: "override",
          layerWeight: 1,
          gpuMaskIndex: null,
          clips: [],
          ikPass: true,
        }],
      },
      clipsById: new Map(),
      masksById: new Map(),
      avatar,
      ikGoalsByLayer: new Map([["base", [{
        goal: "leftHand",
        position: [1, 1, 0],
        positionWeight: 1,
        rotationWeight: 0,
      }]]]),
    };

    const result = new ThreeHumanoidIkSolver(body).apply(application);

    expect(result.value?.changed).toBe(true);
    expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 0)))
      .toBeLessThan(1.0e-5);
  });
});

function armRig() {
  const body = new THREE.Group();
  const upper = new THREE.Bone();
  upper.name = "UpperArm";
  const lower = new THREE.Bone();
  lower.name = "LowerArm";
  lower.position.x = 1;
  const hand = new THREE.Bone();
  hand.name = "Hand";
  hand.position.x = 1;
  upper.add(lower);
  lower.add(hand);
  body.add(upper);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([upper, lower, hand]));
  body.add(mesh);
  body.updateMatrixWorld(true);
  return { body, hand };
}
