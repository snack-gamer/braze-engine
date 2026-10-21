import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createThreeAnimationPreviewSession } from "./three-animation-preview-session";

describe("Three animation preview session", () => {
  it("samples shared clips on every root and restores their original poses", () => {
    const first = new THREE.Group();
    const second = new THREE.Group();
    first.position.x = 2;
    second.position.x = 3;
    const clip = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const result = createThreeAnimationPreviewSession([
      { root: first, clip },
      { root: second, clip },
    ]);
    const session = result.value!;

    session.sample(0.5);
    expect(first.position.x).toBeCloseTo(0.5);
    expect(second.position.x).toBeCloseTo(0.5);

    session.setWeight(clip, 0);
    session.sample(0.75);
    expect(first.position.x).toBeCloseTo(2);
    expect(second.position.x).toBeCloseTo(3);

    session.dispose();
    session.dispose();
    expect(first.position.x).toBe(2);
    expect(second.position.x).toBe(3);
  });

  it("keeps the final pose at the exact non-looping clip duration", () => {
    const root = new THREE.Group();
    const clip = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const session = createThreeAnimationPreviewSession([{ root, clip }]).value!;

    session.sample(1);
    expect(root.position.x).toBeCloseTo(1);

    session.sample(0.25);
    expect(root.position.x).toBeCloseTo(0.25);
    session.dispose();
  });

  it("restores the complete target body including morph weights outside a binding root", () => {
    const body = new THREE.Group();
    const bindingRoot = new THREE.Group();
    const face = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    face.morphTargetInfluences = [0.2];
    body.add(bindingRoot, face);
    const clip = new THREE.AnimationClip("Pose", 1, []);
    const session = createThreeAnimationPreviewSession(
      [{ root: bindingRoot, clip }],
      { poseRoots: [body] },
    ).value!;
    face.morphTargetInfluences[0] = 0.9;
    face.position.x = 4;

    session.dispose();

    expect(face.morphTargetInfluences[0]).toBeCloseTo(0.2);
    expect(face.position.x).toBe(0);
    face.geometry.dispose();
    (face.material as THREE.Material).dispose();
  });
});
