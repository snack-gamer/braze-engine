import * as THREE from "three";
import { normalizeDirectionalLightSettings } from "../lib/directional-light";
import type { EnvironmentSettings, SceneObject, Vec3 } from "../types";
import type { Runtime } from "./runtime";
import { markSceneDirty } from "./runtime";
import { waterShared } from "./water/shared";

const lightTravelDirection = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const sunDirection = new THREE.Vector3();

export function activeDirectionalLight(
  objects: SceneObject[],
  isRuntimeActive: (object: SceneObject) => boolean = () => true,
): SceneObject | null {
  // Keep the runtime predicate separate from serializable component state so
  // callers can also account for hidden parents and Solo filtering.
  return objects.find((object) =>
    object.primitive === "directionalLight"
    && object.visible
    && normalizeDirectionalLightSettings(object.directionalLight).enabled
    && isRuntimeActive(object),
  ) ?? null;
}

function isWorldVisible(node: THREE.Object3D | undefined): node is THREE.Object3D {
  let cursor = node;
  if (!cursor) return false;
  while (cursor) {
    if (!cursor.visible) return false;
    cursor = cursor.parent ?? undefined;
  }
  return true;
}

/** Direction from the world toward the sun, matching the existing keyOffset,
 * water and sky conventions. A Unity-style Directional Light emits along its
 * local +Z axis, hence the negation. */
export function worldSunDirectionForNode(node: THREE.Object3D): Vec3 {
  node.updateWorldMatrix(true, false);
  node.getWorldQuaternion(worldQuaternion);
  lightTravelDirection.set(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
  sunDirection.copy(lightTravelDirection).negate();
  return [sunDirection.x, sunDirection.y, sunDirection.z];
}

function suppressAuthoredDirectionalLight(runtime: Runtime): void {
  runtime.authoredDirectionalLightActive = false;
  runtime.authoredDirectionalLightObjectId = null;
  runtime.authoredDirectionalLightSettings = null;
  runtime.authoredDirectionalLightDirection = null;

  // The Sky keeps a stable fallback direction for its atmosphere, but hides
  // the visible disc when no hierarchy light owns the sun.
  runtime.sky?.setSunDirectionOverride(null);
  runtime.worldLights.key.intensity = 0;
  runtime.worldLights.key.castShadow = false;
  waterShared.sunIntensity = 0;
}

function applyAuthoredDirectionalLight(
  runtime: Runtime,
  objectId: string,
  settings: ReturnType<typeof normalizeDirectionalLightSettings>,
  direction: Vec3,
): void {
  runtime.authoredDirectionalLightActive = true;
  runtime.authoredDirectionalLightObjectId = objectId;
  runtime.authoredDirectionalLightSettings = { ...settings };
  runtime.sky?.setSunDirectionOverride(direction);

  // The hierarchy component is the sole owner of direct-light values.
  const key = runtime.worldLights.key;
  key.color.set(settings.color);
  key.intensity = settings.intensity;
  key.castShadow = settings.castShadows;
  runtime.worldLights.keyOffset
    .set(direction[0], direction[1], direction[2])
    .normalize()
    .multiplyScalar(100);
  key.position.copy(key.target.position).add(runtime.worldLights.keyOffset);

  const cachedDirection = runtime.authoredDirectionalLightDirection ?? new THREE.Vector3();
  cachedDirection.set(direction[0], direction[1], direction[2]).normalize();
  runtime.authoredDirectionalLightDirection = cachedDirection;
  waterShared.sunDirection.copy(cachedDirection);
  waterShared.sunIntensity = settings.intensity;
}

export function syncAuthoredDirectionalLight(
  runtime: Runtime,
  objects: SceneObject[],
  _environment: Pick<EnvironmentSettings, "worldSource">,
): SceneObject | null {
  const authored = activeDirectionalLight(objects, (object) =>
    isWorldVisible(runtime.objectMap.get(object.id)),
  );
  const node = authored ? runtime.objectMap.get(authored.id) : null;
  if (!authored || !node) {
    suppressAuthoredDirectionalLight(runtime);
    markSceneDirty(runtime);
    return null;
  }

  const settings = normalizeDirectionalLightSettings(authored.directionalLight);
  const direction = worldSunDirectionForNode(node);
  applyAuthoredDirectionalLight(runtime, authored.id, settings, direction);
  markSceneDirty(runtime);
  return authored;
}

/** Refresh transform-driven lighting from the runtime SceneNode. This is
 * intentionally called by the viewport's existing frame loop: transform
 * gizmos and timeline playback both mutate SceneNodes between React commits,
 * and adding another RAF would introduce ordering and lifetime problems. */
export function syncAuthoredDirectionalLightFrame(runtime: Runtime): boolean {
  if (!runtime.authoredDirectionalLightActive) return false;
  const objectId = runtime.authoredDirectionalLightObjectId;
  const settings = runtime.authoredDirectionalLightSettings;
  const node = objectId ? runtime.objectMap.get(objectId) : null;
  if (!objectId || !settings || !node || !isWorldVisible(node)) {
    suppressAuthoredDirectionalLight(runtime);
    markSceneDirty(runtime);
    return true;
  }

  const direction = worldSunDirectionForNode(node);
  const previous = runtime.authoredDirectionalLightDirection;
  if (
    previous
    && previous.distanceToSquared(lightTravelDirection.set(direction[0], direction[1], direction[2])) <= 1e-12
  ) {
    return false;
  }

  applyAuthoredDirectionalLight(runtime, objectId, settings, direction);
  markSceneDirty(runtime);
  return true;
}
