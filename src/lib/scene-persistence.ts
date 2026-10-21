import type { AnimationDocument } from "../animation/types";
import { serializeAnimationDocument } from "../animation/serialization";
import { normalizeEnvironmentRanges } from "./scene-normalize";
import { serializePhysicsWorldSettings } from "../physics/serialization/codec";
import type { PrimeTimelineDocument } from "../timeline/types";
import { serializePrimeTimelineDocument } from "../timeline/document";
import type {
  CameraState,
  EnvironmentSettings,
  PhysicsWorldSettings,
  SceneObject,
} from "../types";
import {
  SCENE_DOCUMENT_VERSION,
  type SceneDocumentV1,
} from "../scene/serialization/scene-document";
import { serializeSceneObject } from "../scene/serialization/scene-object-encoder";
import { DIRECTIONAL_LIGHT_AUTHORING_VERSION } from "../scene/domain/directional-light";

export type ScenePersistenceSnapshot = {
  objects: SceneObject[];
  camera: CameraState;
  activeObjectId: string;
  activeCameraId: string;
  environment: EnvironmentSettings;
  physicsWorldSettings: PhysicsWorldSettings;
  timeline?: PrimeTimelineDocument;
  animation?: AnimationDocument;
};

/**
 * Build the canonical scene document used by both autosave and explicit save.
 * Keeping this pure prevents the two authoring paths from silently drifting.
 */
export function buildSavedScene(
  snapshot: ScenePersistenceSnapshot,
  savedAt = new Date().toISOString(),
): SceneDocumentV1 {
  const {
    objects,
    camera,
    activeObjectId,
    activeCameraId,
    environment,
    physicsWorldSettings,
    timeline,
    animation,
  } = snapshot;

  return {
    version: SCENE_DOCUMENT_VERSION,
    lightingAuthoringVersion: DIRECTIONAL_LIGHT_AUTHORING_VERSION,
    savedAt,
    camera: {
      role: "generation_camera",
      position: camera.position,
      target: camera.target,
      fov_degrees: camera.fov,
    },
    activeObjectId: activeObjectId || null,
    activeCameraId: activeCameraId || null,
    environment: normalizeEnvironmentRanges(environment),
    physics: serializePhysicsWorldSettings(physicsWorldSettings),
    timeline: timeline ? serializePrimeTimelineDocument(timeline) : undefined,
    animation: animation ? serializeAnimationDocument(animation) : undefined,
    objects: objects.map(serializeSceneObject),
  };
}
