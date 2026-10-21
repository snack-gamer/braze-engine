import type * as THREE from "three";
import type { SceneObject } from "../types";
import {
  assignThreeShadowCasterLayer,
  type ThreeShadowCasterClass,
} from "../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import { findBody } from "./reconcile";

export type AuthoredShadowCasterClassification = Readonly<{
  byObjectId: ReadonlyMap<string, Exclude<ThreeShadowCasterClass, "none">>;
  staticSignature: string;
  dynamicSignature: string;
}>;

/** Classifies authored roots once per authored scene reference, including ancestry. */
export function classifyAuthoredShadowCasters(
  objects: readonly SceneObject[],
): AuthoredShadowCasterClassification {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const byObjectId = new Map<string, "static" | "dynamic">();
  const staticEntries: string[] = [];
  const dynamicEntries: string[] = [];
  for (const object of objects) {
    const casterClass = objectOrAncestorIsDynamic(object, objectsById) ? "dynamic" : "static";
    byObjectId.set(object.id, casterClass);
    const signature = authoredCasterSignature(object);
    (casterClass === "dynamic" ? dynamicEntries : staticEntries).push(signature);
  }
  return Object.freeze({
    byObjectId,
    staticSignature: staticEntries.sort().join("\n"),
    dynamicSignature: dynamicEntries.sort().join("\n"),
  });
}

/** Applies classification to authored render bodies, not hierarchy child nodes. */
export function applyAuthoredShadowCasterLayers(
  classification: AuthoredShadowCasterClassification,
  objectMap: ReadonlyMap<string, THREE.Group>,
): void {
  for (const [objectId, casterClass] of classification.byObjectId) {
    const node = objectMap.get(objectId);
    const body = node ? findBody(node) : null;
    if (body) assignThreeShadowCasterLayer(body, casterClass);
  }
}

export function applyAuthoredBodyShadowCasterLayer(
  classification: AuthoredShadowCasterClassification,
  objectId: string,
  body: THREE.Object3D,
): void {
  assignThreeShadowCasterLayer(body, classification.byObjectId.get(objectId) ?? "none");
}

function objectOrAncestorIsDynamic(
  object: SceneObject,
  objectsById: ReadonlyMap<string, SceneObject>,
): boolean {
  const visited = new Set<string>();
  let current: SceneObject | undefined = object;
  while (current && !visited.has(current.id)) {
    if (objectHasRuntimeMotion(current)) return true;
    visited.add(current.id);
    current = current.parentId ? objectsById.get(current.parentId) : undefined;
  }
  return false;
}

function objectHasRuntimeMotion(object: SceneObject): boolean {
  return (
    object.rigidbody?.enabled === true
    || object.characterController?.enabled === true
    || object.animator?.enabled === true
    || object.animationPlayer?.enabled === true
    || object.motionPulse?.enabled === true
    || object.cloner?.enabled === true
    || object.modifiers?.some((modifier) => (
      modifier.type === "buoyancy" && modifier.enabled
    )) === true
  );
}

function authoredCasterSignature(object: SceneObject): string {
  return [
    object.id,
    object.parentId ?? "",
    object.primitive,
    object.visible ? 1 : 0,
    object.renderVisible === false ? 0 : 1,
    object.meshRenderer?.enabled === false ? 0 : 1,
    object.meshRenderer?.castShadows === false ? 0 : 1,
    ...object.position,
    ...object.rotation,
    ...object.scale,
    object.assetRef?.guid ?? "",
    object.assetRef?.localId ?? "",
    object.assetUrl ?? "",
  ].join("|");
}
