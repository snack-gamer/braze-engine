import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createCameraGizmo, type CameraGizmo } from "../lib/camera-gizmo";
import type { Runtime } from "./runtime";
import { cameraGizmoWorldPose, refreshCameraGizmoWorldPosesForSubtree } from "./gizmos";

describe("camera gizmo world pose", () => {
  it("projects a parent-local camera pose into the world-level gizmo root", () => {
    const parent = new THREE.Group();
    parent.position.set(10, 2, -4);
    parent.rotation.set(0, Math.PI / 2, 0);
    const cameraNode = new THREE.Group();
    parent.add(cameraNode);
    const runtime = {
      objectMap: new Map([["camera", cameraNode]]),
    } as unknown as Runtime;
    const localPosition = new THREE.Vector3(1, 0, 0);
    const localTarget = new THREE.Vector3(1, 0, -2);
    parent.updateMatrixWorld(true);
    const expectedPosition = localPosition.clone().applyMatrix4(parent.matrixWorld);
    const expectedTarget = localTarget.clone().applyMatrix4(parent.matrixWorld);

    const pose = cameraGizmoWorldPose(runtime, "camera", [1, 0, 0], [1, 0, -2]);

    expect(pose.position).toEqual([expectedPosition.x, expectedPosition.y, expectedPosition.z]);
    expect(pose.target).toEqual([expectedTarget.x, expectedTarget.y, expectedTarget.z]);
  });

  it("refreshes only camera helpers in the changed authored subtree", () => {
    const root = new THREE.Group();
    const changedParent = new THREE.Group();
    const nestedCamera = new THREE.Group();
    const unrelatedCamera = new THREE.Group();
    root.userData.objectId = "root";
    changedParent.userData.objectId = "changed-parent";
    nestedCamera.userData.objectId = "nested-camera";
    unrelatedCamera.userData.objectId = "unrelated-camera";
    changedParent.position.set(3, 1, -2);
    changedParent.scale.set(2, 1, 0.5);
    nestedCamera.position.set(0, 2, 1);
    nestedCamera.rotation.set(0, Math.PI / 2, 0);
    changedParent.add(nestedCamera);
    root.add(changedParent, unrelatedCamera);
    const refreshNestedPose = vi.fn();
    const refreshUnrelatedPose = vi.fn();
    const runtime = {
      objectMap: new Map([
        ["root", root],
        ["changed-parent", changedParent],
        ["nested-camera", nestedCamera],
        ["unrelated-camera", unrelatedCamera],
      ]),
      cameraGizmoMap: new Map([
        ["nested-camera", { refreshPose: refreshNestedPose } as unknown as CameraGizmo],
        ["unrelated-camera", { refreshPose: refreshUnrelatedPose } as unknown as CameraGizmo],
      ]),
    } as unknown as Runtime;
    changedParent.updateWorldMatrix(true, false);
    const expectedPosition = nestedCamera.position.clone().applyMatrix4(changedParent.matrixWorld);
    const localDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(nestedCamera.quaternion);
    const expectedTarget = nestedCamera.position.clone().add(localDirection).applyMatrix4(changedParent.matrixWorld);

    refreshCameraGizmoWorldPosesForSubtree(runtime, changedParent);

    expect(refreshNestedPose).toHaveBeenCalledWith(
      [expectedPosition.x, expectedPosition.y, expectedPosition.z],
      [expectedTarget.x, expectedTarget.y, expectedTarget.z],
    );
    expect(refreshUnrelatedPose).not.toHaveBeenCalled();
  });

  it("refreshes world pose without changing the camera projection", () => {
    const gizmo = createCameraGizmo();
    gizmo.update({
      position: [0, 0, 0],
      target: [0, 0, -2],
      fov: 63,
      near: 0.1,
      far: 200,
      aspect: 16 / 9,
    });

    gizmo.refreshPose([4, 3, 2], [4, 3, 1]);

    expect(gizmo.source.position.toArray()).toEqual([4, 3, 2]);
    expect(gizmo.source.fov).toBe(63);
    expect(gizmo.source.aspect).toBe(16 / 9);
    expect(gizmo.source.near).toBe(0.15);
    expect(gizmo.source.far).toBe(2.5);
    gizmo.dispose();
  });
});
