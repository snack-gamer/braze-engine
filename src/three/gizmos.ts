import * as THREE from "three";
import { resolveCameraPreviewAspect } from "../camera/domain/camera-preview-aspect";
import { createCameraGizmo } from "../lib/camera-gizmo";
import type { SceneObject, Vec3 } from "../types";
import type { Runtime } from "./runtime";

const worldPosition = new THREE.Vector3();
const worldTarget = new THREE.Vector3();
const worldDirection = new THREE.Vector3();

export function cameraGizmoWorldPose(
  runtime: Runtime,
  objectId: string,
  position: Vec3,
  target: Vec3,
): { position: Vec3; target: Vec3 } {
  const parent = runtime.objectMap.get(objectId)?.parent;
  parent?.updateWorldMatrix(true, false);
  worldPosition.set(...position);
  worldTarget.set(...target);
  if (parent) {
    worldPosition.applyMatrix4(parent.matrixWorld);
    worldTarget.applyMatrix4(parent.matrixWorld);
  }
  return {
    position: [worldPosition.x, worldPosition.y, worldPosition.z],
    target: [worldTarget.x, worldTarget.y, worldTarget.z],
  };
}

export function removeCameraGizmo(runtime: Runtime, objectId: string): void {
  const gizmo = runtime.cameraGizmoMap.get(objectId);
  if (!gizmo) return;
  runtime.cameraGizmoRoot.remove(gizmo.helper);
  gizmo.dispose();
  runtime.cameraGizmoMap.delete(objectId);
}

/** Synchronizes one authored camera without walking the complete world. */
export function syncCameraGizmoForObject(
  runtime: Runtime,
  object: SceneObject,
  activeCameraId: string,
  hasSolo: boolean,
  cameraPreviewAspect: number | null,
): void {
  if (object.primitive !== "camera" || !object.camera) {
    removeCameraGizmo(runtime, object.id);
    return;
  }
  let gizmo = runtime.cameraGizmoMap.get(object.id);
  if (!gizmo) {
    gizmo = createCameraGizmo();
    runtime.cameraGizmoRoot.add(gizmo.helper);
    runtime.cameraGizmoMap.set(object.id, gizmo);
  }
  const pose = cameraGizmoWorldPose(runtime, object.id, object.position, object.camera.target);
  gizmo.update({
    position: pose.position,
    target: pose.target,
    fov: object.camera.fov,
    near: object.camera.near,
    far: object.camera.far,
    aspect: resolveCameraPreviewAspect(cameraPreviewAspect, runtime.camera.aspect),
  });
  gizmo.setActive(object.id === activeCameraId);
  gizmo.setVisible(object.visible && (!hasSolo || !!object.solo));
}

export function refreshCameraGizmoAspect(runtime: Runtime, cameraPreviewAspect: number | null): void {
  const aspect = resolveCameraPreviewAspect(cameraPreviewAspect, runtime.camera.aspect);
  for (const gizmo of runtime.cameraGizmoMap.values()) gizmo.refreshAspect(aspect);
}

/** Refreshes only camera helpers inside an authored transform subtree. The
 * traversal ignores render-body internals and is invoked only at edit boundaries. */
export function refreshCameraGizmoWorldPosesForSubtree(runtime: Runtime, root: THREE.Object3D): void {
  const visit = (node: THREE.Object3D): void => {
    const objectId = node.userData.objectId;
    if (typeof objectId !== "string" || runtime.objectMap.get(objectId) !== node) return;
    const gizmo = runtime.cameraGizmoMap.get(objectId);
    if (gizmo) {
      const parent = node.parent;
      parent?.updateWorldMatrix(true, false);
      worldPosition.copy(node.position);
      worldDirection.set(0, 0, -1).applyQuaternion(node.quaternion);
      worldTarget.copy(node.position).add(worldDirection);
      if (parent) {
        worldPosition.applyMatrix4(parent.matrixWorld);
        worldTarget.applyMatrix4(parent.matrixWorld);
      }
      gizmo.refreshPose(
        [worldPosition.x, worldPosition.y, worldPosition.z],
        [worldTarget.x, worldTarget.y, worldTarget.z],
      );
    }
    for (const child of node.children) {
      const childId = child.userData.objectId;
      if (typeof childId === "string" && runtime.objectMap.get(childId) === child) visit(child);
    }
  };
  visit(root);
}
