import * as THREE from "three";
import type { SceneObject, Vec3 } from "../types";
import { clampScaleValue } from "../scene/domain/transform-values";

export { clampScaleValue, clampScaleVec } from "../scene/domain/transform-values";

const cameraLookTmp = new THREE.Vector3();
const cameraEyeTmp = new THREE.Vector3();
const cameraMatrixTmp = new THREE.Matrix4();

export function applyTransform(target: THREE.Object3D, object: SceneObject) {
  target.position.set(object.position[0], object.position[1], object.position[2]);
  if (object.primitive === "camera" && object.camera) {
    // Cameras express orientation via `camera.target` (lookAt point), not the
    // Euler rotation field. We can't use `target.lookAt(camera.target)` here
    // because Object3D.lookAt has REVERSED semantics vs Camera.lookAt — for a
    // plain Object3D it makes local -Z point AWAY from the target. We want
    // camera semantics (local -Z faces the target), so build the rotation
    // matrix manually with the Camera convention. Without this, every commit
    // computed `(0,0,-1) × quaternion` and landed on the 180°-reflected point.
    cameraEyeTmp.set(object.position[0], object.position[1], object.position[2]);
    cameraLookTmp.set(object.camera.target[0], object.camera.target[1], object.camera.target[2]);
    cameraMatrixTmp.lookAt(cameraEyeTmp, cameraLookTmp, target.up);
    target.quaternion.setFromRotationMatrix(cameraMatrixTmp);
  } else {
    target.rotation.set(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      THREE.MathUtils.degToRad(object.rotation[2]),
    );
  }
  target.scale.set(object.scale[0], object.scale[1], object.scale[2]);
  // Object stays visible only when the GameObject is active AND its mesh
  // components are present and enabled — removing or disabling the Mesh Filter
  // (no geometry) or Mesh Renderer (nothing drawn) hides it, as in Unity.
  const removed = object.removedComponents;
  target.visible =
    object.visible &&
    !removed?.includes("meshFilter") &&
    !removed?.includes("meshRenderer") &&
    object.meshFilter?.enabled !== false &&
    object.meshRenderer?.enabled !== false;
}

export function roundTransform(value: number) {
  return Number(value.toFixed(4));
}

export function readTransform(target: THREE.Object3D): Pick<SceneObject, "position" | "rotation" | "scale"> {
  return {
    position: [target.position.x, target.position.y, target.position.z].map(roundTransform) as Vec3,
    rotation: [
      THREE.MathUtils.radToDeg(target.rotation.x),
      THREE.MathUtils.radToDeg(target.rotation.y),
      THREE.MathUtils.radToDeg(target.rotation.z),
    ].map(roundTransform) as Vec3,
    scale: [target.scale.x, target.scale.y, target.scale.z].map(clampScaleValue).map(roundTransform) as Vec3,
  };
}

export function markIds(target: THREE.Object3D, objectId: string) {
  target.userData.objectId = objectId;
  target.traverse((child) => {
    child.userData.objectId = objectId;
  });
}
