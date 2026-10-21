import * as THREE from "three";
import type { SceneObject, Vec3 } from "../../types";
import type { Quat4 } from "./coordinates";

export type HierarchyWorldTransform = {
  position: Vec3;
  orientation: Quat4;
  scale: Vec3;
  hasShear: boolean;
};

function matrixHasShear(matrix: THREE.Matrix4): boolean {
  const elements = matrix.elements;
  const x = new THREE.Vector3(elements[0], elements[1], elements[2]).normalize();
  const y = new THREE.Vector3(elements[4], elements[5], elements[6]).normalize();
  const z = new THREE.Vector3(elements[8], elements[9], elements[10]).normalize();
  return Math.max(Math.abs(x.dot(y)), Math.abs(x.dot(z)), Math.abs(y.dot(z))) > 1.0e-5;
}

function localMatrix(object: Pick<SceneObject, "position" | "rotation" | "scale">): THREE.Matrix4 {
  const position = new THREE.Vector3(...object.position);
  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(object.rotation[0]),
    THREE.MathUtils.degToRad(object.rotation[1]),
    THREE.MathUtils.degToRad(object.rotation[2]),
  ));
  const scale = new THREE.Vector3(...object.scale);
  return new THREE.Matrix4().compose(position, orientation, scale);
}

/**
 * Resolves authored local TRS values into world transforms without requiring
 * the Three scene graph to have reconciled first. Invalid/missing parents are
 * treated as roots; cycles terminate at the first repeated object.
 */
export function compileHierarchyWorldTransforms(
  objects: Array<Pick<SceneObject, "id" | "parentId" | "position" | "rotation" | "scale">>,
): Map<string, HierarchyWorldTransform> {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const matrices = new Map<string, THREE.Matrix4>();
  const resolving = new Set<string>();

  const resolveMatrix = (objectId: string): THREE.Matrix4 | null => {
    const cached = matrices.get(objectId);
    if (cached) return cached;
    const object = byId.get(objectId);
    if (!object) return null;
    const own = localMatrix(object as Pick<SceneObject, "position" | "rotation" | "scale">);
    if (resolving.has(objectId)) return own;
    resolving.add(objectId);
    const parent = object.parentId && object.parentId !== object.id
      ? resolveMatrix(object.parentId)
      : null;
    resolving.delete(objectId);
    const world = parent ? parent.clone().multiply(own) : own;
    matrices.set(objectId, world);
    return world;
  };

  const result = new Map<string, HierarchyWorldTransform>();
  for (const object of objects) {
    const matrix = resolveMatrix(object.id);
    if (!matrix) continue;
    const position = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, orientation, scale);
    result.set(object.id, {
      position: [position.x, position.y, position.z],
      orientation: [orientation.x, orientation.y, orientation.z, orientation.w],
      scale: [scale.x, scale.y, scale.z],
      hasShear: matrixHasShear(matrix),
    });
  }
  return result;
}
