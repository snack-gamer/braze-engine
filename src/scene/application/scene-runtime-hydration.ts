import { parseAnimationDocument } from "../../animation/serialization";
import type { AnimationDocument } from "../../animation/types";
import {
  migrateLegacyDirectionalLight,
  needsDirectionalLightMigration,
} from "../../lib/directional-light";
import {
  migrateLegacyCamera,
  normalizeCamera,
  normalizeEnvironment,
} from "../../lib/scene-normalize";
import { parsePhysicsWorldSettings } from "../../physics/serialization/codec";
import { readLegacySkyLightInput } from "../../rendering/application/legacy-sky-light-input";
import {
  parsePrimeTimelineDocument,
  timelineFromAnimationDocument,
} from "../../timeline/document";
import type { PrimeTimelineDocument } from "../../timeline/types";
import type {
  CameraState,
  EnvironmentSettings,
  PhysicsWorldSettings,
  SceneObject,
} from "../../types";
import { decodeSceneDocument } from "../serialization/scene-codec";
import type { SceneDocumentV1 } from "../serialization/scene-document";
import { defaultActiveSceneObjectId } from "./active-object-selection";

export type RuntimeSceneFallbacks = Readonly<{
  camera: CameraState;
  environment: EnvironmentSettings;
}>;

export type HydratedSceneState = {
  objects: SceneObject[];
  activeObjectId: string | null;
  activeCameraId: string | null;
  camera: CameraState;
  environment: EnvironmentSettings;
  physicsWorldSettings: PhysicsWorldSettings;
  timeline: PrimeTimelineDocument;
  animation?: AnimationDocument;
};

export type RuntimeSceneHydration = Readonly<{
  document: SceneDocumentV1;
  state: HydratedSceneState;
}>;

/** Decodes authored scene data without constructing editor persistence baselines. */
export function hydrateRuntimeSceneDocument(
  input: unknown,
  fallbacks: RuntimeSceneFallbacks,
): RuntimeSceneHydration {
  const { document, objects: parsed } = decodeSceneDocument(input);
  const savedCamera = normalizeCamera(document.camera);
  const legacySkyLight = readLegacySkyLightInput(document.environment);
  const savedEnvironment = normalizeEnvironment(document.environment);
  const camera = savedCamera ?? fallbacks.camera;
  const environment = savedEnvironment ?? fallbacks.environment;
  const cameraMigration = parsed.length > 0
    ? migrateLegacyCamera(parsed, savedCamera)
    : { objects: parsed, activeCameraId: null };
  const objects = parsed.length > 0 && needsDirectionalLightMigration(document.lightingAuthoringVersion)
    ? migrateLegacyDirectionalLight(
        cameraMigration.objects,
        savedEnvironment,
        legacySkyLight ?? undefined,
      )
    : cameraMigration.objects;
  const activeObjectId = typeof document.activeObjectId === "string"
    && objects.some((object) => object.id === document.activeObjectId)
    ? document.activeObjectId
    : defaultActiveSceneObjectId(objects) || null;
  const activeCameraId = typeof document.activeCameraId === "string"
    && objects.some((object) => object.id === document.activeCameraId && object.primitive === "camera")
    ? document.activeCameraId
    : cameraMigration.activeCameraId;
  const animation = parseAnimationDocument(document.animation);
  const timeline = parsePrimeTimelineDocument(document.timeline)
    ?? timelineFromAnimationDocument(animation);

  return {
    document,
    state: {
      objects,
      activeObjectId,
      activeCameraId,
      camera,
      environment,
      physicsWorldSettings: parsePhysicsWorldSettings(document.physics),
      timeline,
      animation,
    },
  };
}
