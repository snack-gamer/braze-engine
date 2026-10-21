import * as THREE from "three";

type ThreeRetargetPoseRecord = Readonly<{
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  matrix: THREE.Matrix4;
  matrixWorld: THREE.Matrix4;
}>;

export type ThreeRetargetPoseSnapshot = readonly ThreeRetargetPoseRecord[];

/** Captures every transform touched by the synchronous compatibility bake. */
export function captureThreeRetargetPose(root: THREE.Object3D): ThreeRetargetPoseSnapshot {
  root.updateMatrixWorld(true);
  const pose: ThreeRetargetPoseRecord[] = [];
  root.traverse((object) => pose.push({
    object,
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
    matrix: object.matrix.clone(),
    matrixWorld: object.matrixWorld.clone(),
  }));
  return pose;
}

export function restoreThreeRetargetPose(pose: ThreeRetargetPoseSnapshot): void {
  for (const item of pose) {
    item.object.position.copy(item.position);
    item.object.quaternion.copy(item.quaternion);
    item.object.scale.copy(item.scale);
    item.object.matrix.copy(item.matrix);
    item.object.matrixWorld.copy(item.matrixWorld);
  }
  pose[0]?.object.updateMatrixWorld(true);
}

/**
 * SkeletonUtils can only right-multiply per-bone offsets. A parent rotation
 * supplies the required left side of A * sourceDelta * A^-1 while also
 * aligning root translation through the same declared-axis transform.
 */
export function alignThreeRetargetSource(
  sourceClone: THREE.Object3D,
  rootAxisRotation: readonly [number, number, number, number],
): THREE.Group | null {
  sourceClone.updateMatrix();
  if (!invertibleMatrix(sourceClone.matrix)) return null;
  const alignedRoot = new THREE.Group();
  alignedRoot.matrixAutoUpdate = false;
  alignedRoot.matrix.makeRotationFromQuaternion(
    new THREE.Quaternion().fromArray(rootAxisRotation).normalize(),
  ).multiply(sourceClone.matrix.clone().invert());
  alignedRoot.add(sourceClone);
  alignedRoot.updateMatrixWorld(true);
  return alignedRoot;
}

/** Temporarily removes the target's parent-world transform from the bake. */
export function normalizeThreeRetargetTargetCoordinates(
  targetRoot: THREE.Object3D,
): (() => void) | null {
  targetRoot.parent?.updateWorldMatrix(true, false);
  const parentWorld = targetRoot.parent?.matrixWorld ?? new THREE.Matrix4();
  if (!invertibleMatrix(parentWorld)) return null;
  const matrixAutoUpdate = targetRoot.matrixAutoUpdate;
  const matrixWorldAutoUpdate = targetRoot.matrixWorldAutoUpdate;
  targetRoot.matrixAutoUpdate = false;
  targetRoot.matrix.copy(parentWorld).invert();
  targetRoot.matrixWorld.identity();
  targetRoot.updateMatrixWorld(true);
  return () => {
    targetRoot.matrixAutoUpdate = matrixAutoUpdate;
    targetRoot.matrixWorldAutoUpdate = matrixWorldAutoUpdate;
  };
}

function invertibleMatrix(matrix: THREE.Matrix4): boolean {
  const determinant = matrix.determinant();
  return Number.isFinite(determinant) && Math.abs(determinant) > 1.0e-12;
}
