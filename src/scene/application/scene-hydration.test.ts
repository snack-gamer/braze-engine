import { describe, expect, it } from "vitest";
import { createAnimationDocument } from "../../animation/animation-document";
import { defaultCamera, defaultEnvironment } from "../../constants";
import { buildSavedScene, type ScenePersistenceSnapshot } from "../../lib/scene-persistence";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../../physics/domain/world-settings";
import { sceneDocumentHasAuthoredChanges } from "../serialization/scene-delta";
import { defaultPrimeTimelineDocument } from "../../timeline/document";
import { hydrateSceneDocument } from "./scene-hydration";

function fallbackSnapshot(): ScenePersistenceSnapshot {
  return {
    objects: [],
    activeObjectId: "",
    activeCameraId: "",
    camera: defaultCamera,
    environment: defaultEnvironment,
    physicsWorldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS,
    timeline: defaultPrimeTimelineDocument,
    animation: createAnimationDocument(),
  };
}

describe("scene hydration authored baseline", () => {
  it("keeps the exact server document separate from normalized defaults", () => {
    const serverDocument = {
      version: "braze-engine/scene-v1",
      savedAt: "2026-08-30T00:00:00.000Z",
      objects: [],
    };
    const hydrated = hydrateSceneDocument(serverDocument, fallbackSnapshot());

    expect(hydrated.serverDocument).toEqual(serverDocument);
    expect(hydrated.serverDocument).not.toHaveProperty("environment");
    expect(hydrated.authoredBaseline).toMatchObject({
      activeObjectId: null,
      activeCameraId: null,
      camera: { position: defaultCamera.position },
      environment: { hdriUrl: null, intensity: defaultEnvironment.intensity },
      physics: { gravity: DEFAULT_PHYSICS_WORLD_SETTINGS.gravity },
    });
  });

  it("ignores hydration defaults but detects a subsequent authored edit", () => {
    const hydrated = hydrateSceneDocument({
      version: "braze-engine/scene-v1",
      savedAt: "first",
      objects: [],
    }, fallbackSnapshot());
    const unchanged = buildSavedScene(fallbackSnapshot(), "later");
    const edited = buildSavedScene({
      ...fallbackSnapshot(),
      environment: { ...defaultEnvironment, intensity: 1.5 },
    }, "later");

    expect(sceneDocumentHasAuthoredChanges(hydrated.authoredBaseline, unchanged)).toBe(false);
    expect(sceneDocumentHasAuthoredChanges(hydrated.authoredBaseline, edited)).toBe(true);
  });

  it("accepts removed render fields as migration input but never emits them again", () => {
    const legacyEnvironment = {
      ...defaultEnvironment,
      worldSource: "sky",
      sky: {
        ...defaultEnvironment.sky,
        sunAltitudeDeg: 35,
        sunAzimuthDeg: 210,
      },
      ssgi: { enabled: true },
      denoise: { enabled: true },
      temporalCache: { enabled: true },
      skyAmbientFloor: { enabled: true },
    };
    const hydrated = hydrateSceneDocument({
      version: "braze-engine/scene-v1",
      lightingAuthoringVersion: 1,
      objects: [{
        id: "legacy-cube",
        name: "Cube",
        source_type: "cube",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }],
      environment: legacyEnvironment,
    }, fallbackSnapshot());

    const migratedLight = hydrated.state.objects.find(({ primitive }) => (
      primitive === "directionalLight"
    ));
    expect(migratedLight?.rotation).toEqual(expect.any(Array));
    const canonical = JSON.stringify(hydrated.authoredBaseline.environment);
    for (const removed of [
      "ssgi",
      "denoise",
      "temporalCache",
      "skyAmbientFloor",
      "sunAltitudeDeg",
      "sunAzimuthDeg",
    ]) expect(canonical).not.toContain(removed);

    const roundTrip = hydrateSceneDocument(hydrated.authoredBaseline, fallbackSnapshot());
    expect(roundTrip.state.environment).toEqual(hydrated.state.environment);
  });
});
