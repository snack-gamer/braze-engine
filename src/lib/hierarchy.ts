import * as THREE from "three";
import type { CameraState, SceneObject, Vec3 } from "../types";
import { round } from "./format";

type ReparentTransform = Pick<SceneObject, "position" | "rotation" | "scale"> & {
  cameraTarget?: Vec3;
};

const identityMatrix = new THREE.Matrix4();
const positionTmp = new THREE.Vector3();
const scaleTmp = new THREE.Vector3();
const quaternionTmp = new THREE.Quaternion();
const eulerTmp = new THREE.Euler();
const matrixTmp = new THREE.Matrix4();
const parentInverseTmp = new THREE.Matrix4();
const cameraEyeTmp = new THREE.Vector3();
const cameraLookTmp = new THREE.Vector3();
const cameraMatrixTmp = new THREE.Matrix4();
const worldTargetTmp = new THREE.Vector3();
const localTargetTmp = new THREE.Vector3();
const localPositionTmp = new THREE.Vector3();

function localMatrix(object: SceneObject): THREE.Matrix4 {
  positionTmp.set(object.position[0], object.position[1], object.position[2]);
  scaleTmp.set(object.scale[0], object.scale[1], object.scale[2]);
  if (object.primitive === "camera" && object.camera) {
    cameraEyeTmp.copy(positionTmp);
    cameraLookTmp.set(object.camera.target[0], object.camera.target[1], object.camera.target[2]);
    cameraMatrixTmp.lookAt(cameraEyeTmp, cameraLookTmp, new THREE.Vector3(0, 1, 0));
    quaternionTmp.setFromRotationMatrix(cameraMatrixTmp);
  } else {
    eulerTmp.set(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      THREE.MathUtils.degToRad(object.rotation[2]),
    );
    quaternionTmp.setFromEuler(eulerTmp);
  }
  return new THREE.Matrix4().compose(positionTmp, quaternionTmp, scaleTmp);
}

function worldMatrixFor(
  object: SceneObject,
  byId: Map<string, SceneObject>,
  stack = new Set<string>(),
): THREE.Matrix4 {
  const own = localMatrix(object);
  const parent = object.parentId ? byId.get(object.parentId) : null;
  if (!parent || parent.id === object.id || stack.has(object.id)) return own;
  stack.add(object.id);
  return worldMatrixFor(parent, byId, stack).multiply(own);
}

export function transformForParent(
  objects: SceneObject[],
  object: SceneObject,
  nextParentId: string | undefined,
): ReparentTransform {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const world = worldMatrixFor(object, byId);
  const parent = nextParentId ? byId.get(nextParentId) : null;
  const parentWorld = parent ? worldMatrixFor(parent, byId) : identityMatrix;
  const local = matrixTmp.copy(parentInverseTmp.copy(parentWorld).invert()).multiply(world);

  local.decompose(positionTmp, quaternionTmp, scaleTmp);
  eulerTmp.setFromQuaternion(quaternionTmp);

  const next: ReparentTransform = {
    position: [positionTmp.x, positionTmp.y, positionTmp.z].map(round) as Vec3,
    rotation: [
      THREE.MathUtils.radToDeg(eulerTmp.x),
      THREE.MathUtils.radToDeg(eulerTmp.y),
      THREE.MathUtils.radToDeg(eulerTmp.z),
    ].map(round) as Vec3,
    scale: [scaleTmp.x, scaleTmp.y, scaleTmp.z].map((value) => round(Math.max(0.01, value))) as Vec3,
  };

  if (object.primitive === "camera" && object.camera) {
    const oldParent = object.parentId ? byId.get(object.parentId) : null;
    const oldParentWorld = oldParent ? worldMatrixFor(oldParent, byId) : identityMatrix;
    const worldTarget = new THREE.Vector3(...object.camera.target).applyMatrix4(oldParentWorld);
    const localTarget = worldTarget.applyMatrix4(parentInverseTmp.copy(parentWorld).invert());
    next.cameraTarget = [localTarget.x, localTarget.y, localTarget.z].map(round) as Vec3;
  }

  return next;
}

export function cameraStateForObject(objects: SceneObject[], object: SceneObject): CameraState | null {
  if (object.primitive !== "camera" || !object.camera) return null;
  const byId = new Map(objects.map((item) => [item.id, item]));
  const world = worldMatrixFor(object, byId);
  world.decompose(positionTmp, quaternionTmp, scaleTmp);
  const parent = object.parentId ? byId.get(object.parentId) : null;
  const parentWorld = parent ? worldMatrixFor(parent, byId) : identityMatrix;
  worldTargetTmp.set(object.camera.target[0], object.camera.target[1], object.camera.target[2]).applyMatrix4(parentWorld);
  return {
    position: [positionTmp.x, positionTmp.y, positionTmp.z].map(round) as Vec3,
    target: [worldTargetTmp.x, worldTargetTmp.y, worldTargetTmp.z].map(round) as Vec3,
    fov: object.camera.fov,
  };
}

export type ObjectFocusBounds = {
  position: Vec3;
  radius: number;
};

function localBoundingRadius(object: SceneObject): number {
  if (object.water || object.primitive === "water") return Math.SQRT2 * 2.5;
  switch (object.primitive) {
    case "sphere":
      return 0.78;
    case "plane":
    case "image":
      return Math.hypot(2.2 * 0.5, 1.35 * 0.5);
    case "fbx":
    case "usdz":
    case "usd":
    case "gltf":
      return 0.85;
    case "cube":
      return Math.hypot(0.7, 0.7, 0.7);
    default:
      return 0.7;
  }
}

export function objectFocusBounds(objects: SceneObject[], objectId: string): ObjectFocusBounds | null {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const object = byId.get(objectId);
  if (!object) return null;
  const world = worldMatrixFor(object, byId);
  world.decompose(positionTmp, quaternionTmp, scaleTmp);
  const scale = Math.max(Math.abs(scaleTmp.x), Math.abs(scaleTmp.y), Math.abs(scaleTmp.z), 0.001);
  const radius = Math.min(6, Math.max(0.2, localBoundingRadius(object) * scale));
  return {
    position: [positionTmp.x, positionTmp.y, positionTmp.z].map(round) as Vec3,
    radius: round(radius),
  };
}

export function cameraLocalFromWorld(
  objects: SceneObject[],
  object: SceneObject,
  camera: CameraState,
): Pick<SceneObject, "position"> & { target: Vec3 } {
  const byId = new Map(objects.map((item) => [item.id, item]));
  const parent = object.parentId ? byId.get(object.parentId) : null;
  const parentWorld = parent ? worldMatrixFor(parent, byId) : identityMatrix;
  const inverse = parentInverseTmp.copy(parentWorld).invert();
  localPositionTmp.set(camera.position[0], camera.position[1], camera.position[2]).applyMatrix4(inverse);
  localTargetTmp.set(camera.target[0], camera.target[1], camera.target[2]).applyMatrix4(inverse);
  return {
    position: [localPositionTmp.x, localPositionTmp.y, localPositionTmp.z].map(round) as Vec3,
    target: [localTargetTmp.x, localTargetTmp.y, localTargetTmp.z].map(round) as Vec3,
  };
}

export function wouldCreateCycle(objects: SceneObject[], sourceId: string, targetId: string): boolean {
  const descendants = new Set<string>([sourceId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of objects) {
      if (object.parentId && descendants.has(object.parentId) && !descendants.has(object.id)) {
        descendants.add(object.id);
        grew = true;
      }
    }
  }
  return descendants.has(targetId);
}

export function normalizeHierarchy(objects: SceneObject[]): SceneObject[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  return objects.map((object) => {
    if (!object.parentId || object.parentId === object.id || !byId.has(object.parentId)) {
      return object.parentId ? { ...object, parentId: undefined } : object;
    }
    const seen = new Set<string>([object.id]);
    let current: string | undefined = object.parentId;
    while (current) {
      if (seen.has(current)) return { ...object, parentId: undefined };
      seen.add(current);
      current = byId.get(current)?.parentId;
    }
    return object;
  });
}
