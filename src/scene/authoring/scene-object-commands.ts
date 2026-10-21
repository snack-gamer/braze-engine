import { botProfilePatch, isAvatarBotObject, nextAvailableBotProfile } from "../../lib/bots";
import { rotationToCameraTarget } from "../../lib/camera-math";
import { applyScenePatch, markSceneOverrides } from "../../lib/prefab-authoring";
import type { SceneObject, Vec3 } from "../../types";
import { clampScaleVec } from "../domain/transform-values";
import type { ObjectTransformPatch } from "./live-transform";
import { createAuthoredId } from "../../identity/authored-id";
import { captureEntityTags } from "../../world/domain/entity-tags";
import { remapBehaviorReferences } from "../../behaviors/domain/behavior-references";

export type SceneObjectCommandResult = {
  objects: SceneObject[];
  selectedObjectId: string | null;
};

export function normalizeSceneObjectPatch(patch: Partial<SceneObject>): Partial<SceneObject> {
  const safe = patch.scale ? { ...patch, scale: clampScaleVec(patch.scale) } : patch;
  return "tags" in safe ? { ...safe, tags: captureEntityTags(safe.tags) } : safe;
}

export function duplicateActiveSceneObject(
  objects: SceneObject[],
  activeObjectId: string,
  createId: () => string = () => createAuthoredId("obj"),
): SceneObjectCommandResult {
  const current = objects.find((object) => object.id === activeObjectId);
  if (!current) return { objects, selectedObjectId: null };
  const clone: SceneObject = {
    ...current,
    id: createId(),
    name: `${current.name} copy`,
    prefabLink: undefined,
    position: [current.position[0] + 0.6, current.position[1], current.position[2] + 0.6],
  };
  clone.behaviors = remapBehaviorReferences(current.behaviors, new Map([[current.id, clone.id]]));
  if (current.uiCanvas) clone.uiCanvas = structuredClone(current.uiCanvas);
  if (isAvatarBotObject(current)) {
    const profile = nextAvailableBotProfile(objects);
    if (!profile) return { objects, selectedObjectId: null };
    Object.assign(clone, botProfilePatch(profile, clone));
  }
  return { objects: [...objects, clone], selectedObjectId: clone.id };
}

export function deleteActiveSceneObject(
  objects: SceneObject[],
  activeObjectId: string,
): SceneObjectCommandResult {
  if (objects.length <= 1) return { objects, selectedObjectId: null };
  const victim = objects.find((object) => object.id === activeObjectId);
  if (victim?.primitive === "camera") {
    const cameraCount = objects.filter((object) => object.primitive === "camera").length;
    if (cameraCount <= 1) return { objects, selectedObjectId: null };
  }
  const next = objects.filter((object) => object.id !== activeObjectId);
  return {
    objects: next,
    selectedObjectId: next[0]?.id ?? null,
  };
}

export function updateAuthoredSceneObject(
  objects: SceneObject[],
  id: string,
  patch: Partial<SceneObject>,
): SceneObject[] {
  const safePatch = normalizeSceneObjectPatch(patch);
  if (
    safePatch.botProfileId
    && objects.some((object) => object.id !== id && object.botProfileId === safePatch.botProfileId)
  ) {
    return objects;
  }
  return objects.map((object) => object.id === id ? applyScenePatch(object, safePatch) : object);
}

export function commitAuthoredObjectTransform(
  objects: SceneObject[],
  id: string,
  transform: ObjectTransformPatch,
): SceneObject[] {
  return objects.map((object) => {
    if (object.id !== id) return object;
    if (object.primitive === "camera" && object.camera) {
      const target = transform.cameraTarget
        ?? rotationToCameraTarget(transform.position, transform.rotation, object.camera.target);
      return markSceneOverrides({
        ...object,
        position: transform.position,
        camera: { ...object.camera, target },
      }, ["transform", "camera"]);
    }
    return markSceneOverrides({
      ...object,
      position: transform.position,
      rotation: transform.rotation,
      scale: clampScaleVec(transform.scale),
    }, ["transform"]);
  });
}

export function updateBuoyancyPin(
  object: SceneObject,
  modifierId: string,
  pinId: string,
  localOffset: Vec3,
): Partial<SceneObject> {
  return {
    modifiers: object.modifiers?.map((modifier) => {
      if (modifier.id !== modifierId || modifier.type !== "buoyancy") return modifier;
      return {
        ...modifier,
        pins: modifier.pins.map((pin) => pin.id === pinId ? { ...pin, localOffset } : pin),
      };
    }),
  };
}
