import { describe, expect, it } from "vitest";
import { defaultCamera, defaultEnvironment } from "../constants";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../physics/domain/world-settings";
import type { SceneObject } from "../types";
import { DIRECTIONAL_LIGHT_AUTHORING_VERSION } from "./directional-light";
import { buildSavedScene, type ScenePersistenceSnapshot } from "./scene-persistence";

function snapshot(objects: SceneObject[]): ScenePersistenceSnapshot {
  return {
    objects,
    camera: defaultCamera,
    activeObjectId: objects[0]?.id ?? "",
    activeCameraId: "",
    environment: defaultEnvironment,
    physicsWorldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS,
  };
}

describe("buildSavedScene", () => {
  it("builds a deterministic empty scene with nullable selections", () => {
    const saved = buildSavedScene(snapshot([]), "2026-08-29T10:00:00.000Z");

    expect(saved.version).toBe("braze-engine/scene-v1");
    expect(saved.lightingAuthoringVersion).toBe(DIRECTIONAL_LIGHT_AUTHORING_VERSION);
    expect(saved.savedAt).toBe("2026-08-29T10:00:00.000Z");
    expect(saved.activeObjectId).toBeNull();
    expect(saved.activeCameraId).toBeNull();
    expect(saved.objects).toEqual([]);
  });

  it("never serializes removed SSGI, inverse-AO, or Sun-from-Sky fields", () => {
    const saved = buildSavedScene(snapshot([]), "2026-08-29T10:00:00.000Z");
    const environment = saved.environment as Record<string, unknown>;
    const sky = environment.sky as Record<string, unknown>;

    expect(environment).not.toHaveProperty("ssgi");
    expect(environment).not.toHaveProperty("denoise");
    expect(environment).not.toHaveProperty("temporalCache");
    expect(environment).not.toHaveProperty("skyAmbientFloor");
    expect(sky).not.toHaveProperty("sunAltitudeDeg");
    expect(sky).not.toHaveProperty("sunAzimuthDeg");
  });

  it("preserves durable asset and prefab identity in the shared payload", () => {
    const object: SceneObject = {
      id: "shop-root",
      name: "Shop 02A",
      primitive: "gltf",
      color: "#ffffff",
      visible: true,
      locked: false,
      position: [1, 2, 3],
      rotation: [0, 90, 0],
      scale: [1, 1, 1],
      assetName: "TSP Shop 02A",
      assetUrl: "/assets/tsp-shop-02a.glb",
      assetRef: { guid: "0123456789abcdef0123456789abcdef", localId: "mesh:shop:4300000" },
      prefabLink: {
        prefabRef: { guid: "fedcba9876543210fedcba9876543210", localId: "main" },
        prefabFilename: "tsp-shop-02a.braze-prefab.json",
        prefabName: "TSP Shop 02A",
        instanceId: "shop-instance",
        sourceObjectId: "source-root",
        overrides: ["transform"],
      },
    };

    const saved = buildSavedScene(snapshot([object]), "2026-08-29T10:00:00.000Z");

    expect(saved.objects[0]).toMatchObject({
      id: "shop-root",
      source_type: "gltf",
      asset: {
        ref: {
          guid: "0123456789abcdef0123456789abcdef",
          local_id: "mesh:shop:4300000",
        },
      },
      prefab_link: {
        prefab_ref: {
          guid: "fedcba9876543210fedcba9876543210",
          local_id: "main",
        },
        prefab_filename: "tsp-shop-02a.braze-prefab.json",
        instance_id: "shop-instance",
        source_object_id: "source-root",
        overrides: ["transform"],
      },
    });
    expect(object.position).toEqual([1, 2, 3]);
  });
});
