import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { defaultCamera, defaultEnvironment } from "../constants";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../physics/domain/world-settings";
import {
  activeDirectionalLight,
  syncAuthoredDirectionalLight,
  syncAuthoredDirectionalLightFrame,
  worldSunDirectionForNode,
} from "../three/directional-light";
import type { Runtime } from "../three/runtime";
import type { SceneObject } from "../types";
import {
  DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
  DIRECTIONAL_LIGHT_AUTHORING_VERSION,
  directionalLightFromEnvironment,
  migrateLegacyDirectionalLight,
  needsDirectionalLightMigration,
  normalizeDirectionalLightSettings,
} from "./directional-light";
import { parseSceneJson, makeObject } from "./payload";
import { buildSavedScene } from "./scene-persistence";

vi.mock("../particles/presets", () => ({
  defaultParticleEffectSettings: {
    version: 1,
    preset: "fire",
    enabled: true,
    autoPlay: true,
    seed: 1,
    duration: 2,
    looping: true,
    timeScale: 1,
    capacityScale: 1,
  },
  normalizeParticleEffectSettings: (value: unknown) => value,
}));

describe("directional light authoring", () => {
  it("creates a Unity-style directional light with safe defaults", () => {
    const object = makeObject("directionalLight", 0);

    expect(object).toMatchObject({
      name: "Directional Light",
      primitive: "directionalLight",
      renderVisible: false,
      rotation: [50, -30, 0],
      directionalLight: DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
    });
  });

  it("normalizes malformed component settings", () => {
    expect(normalizeDirectionalLightSettings({
      enabled: false,
      color: "not-a-color",
      intensity: 200,
      cast_shadows: false,
    })).toEqual({
      enabled: false,
      color: DEFAULT_DIRECTIONAL_LIGHT_SETTINGS.color,
      intensity: 20,
      castShadows: false,
    });
  });

  it("centralizes the v2 migration boundary without remigrating future documents", () => {
    expect(DIRECTIONAL_LIGHT_AUTHORING_VERSION).toBe(2);
    expect(needsDirectionalLightMigration(undefined)).toBe(true);
    expect(needsDirectionalLightMigration(1)).toBe(true);
    expect(needsDirectionalLightMigration(2)).toBe(false);
    expect(needsDirectionalLightMigration(3)).toBe(false);
  });

  it("preserves legacy HDRI appearance with a disabled zero-intensity authored light", () => {
    const object = directionalLightFromEnvironment({
      ...defaultEnvironment,
      worldSource: "hdri",
    });

    expect(object.directionalLight).toEqual({
      ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
      enabled: false,
      intensity: 0,
      castShadows: false,
    });
  });

  it("uses the first enabled light that is active in the runtime hierarchy", () => {
    const hidden = makeObject("directionalLight", 0, { id: "hidden" });
    const active = makeObject("directionalLight", 1, { id: "active" });
    expect(activeDirectionalLight([hidden, active], (object) => object.id !== "hidden")?.id).toBe("active");
  });

  it("converts authored world rotation to the shared world-to-sun direction", () => {
    const object = directionalLightFromEnvironment({
      ...defaultEnvironment,
      worldSource: "sky",
    }, "obj-directional-light", { altitudeDeg: 35, azimuthDeg: 210 });
    const node = new THREE.Group();
    node.rotation.set(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      THREE.MathUtils.degToRad(object.rotation[2]),
    );

    const actual = new THREE.Vector3(...worldSunDirectionForNode(node));
    const altitude = THREE.MathUtils.degToRad(35);
    const azimuth = THREE.MathUtils.degToRad(210);
    const expected = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(altitude),
      Math.sin(altitude),
      Math.cos(azimuth) * Math.cos(altitude),
    ).normalize();

    expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
  });

  it("applies component color, intensity, direction, and shadows to the shared Three.js key", () => {
    const object = makeObject("directionalLight", 0, {
      id: "sun",
      rotation: [60, 25, 0],
      directionalLight: {
        enabled: true,
        color: "#ffd080",
        intensity: 2.75,
        castShadows: false,
      },
    });
    const node = new THREE.Group();
    node.rotation.set(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      THREE.MathUtils.degToRad(object.rotation[2]),
    );
    const root = new THREE.Group();
    root.add(node);
    const key = new THREE.DirectionalLight("#ffffff", 0);
    const setSunDirectionOverride = vi.fn();
    const runtime = {
      objectMap: new Map([[object.id, node]]),
      worldLights: {
        key,
        keyOffset: new THREE.Vector3(),
      },
      sky: { setSunDirectionOverride },
      authoredDirectionalLightActive: false,
      framesSinceSceneChange: 10,
    } as unknown as Runtime;

    const selected = syncAuthoredDirectionalLight(runtime, [object], { worldSource: "sky" });
    const direction = new THREE.Vector3(...worldSunDirectionForNode(node));

    expect(selected?.id).toBe(object.id);
    expect(runtime.authoredDirectionalLightActive).toBe(true);
    expect(`#${key.color.getHexString()}`).toBe("#ffd080");
    expect(key.intensity).toBe(2.75);
    expect(key.castShadow).toBe(false);
    expect(runtime.worldLights.keyOffset.clone().normalize().distanceTo(direction)).toBeLessThan(1e-6);
    expect(setSunDirectionOverride).toHaveBeenCalledWith(direction.toArray());
    expect(runtime.framesSinceSceneChange).toBe(0);
  });

  it("suppresses direct sunlight when no authored light is active, including Sky mode", () => {
    const object = makeObject("directionalLight", 0, {
      id: "disabled-sun",
      directionalLight: {
        ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
        enabled: false,
      },
    });
    const node = new THREE.Group();
    const root = new THREE.Group();
    root.add(node);
    const key = new THREE.DirectionalLight("#ffffff", 4);
    key.castShadow = true;
    const setSunDirectionOverride = vi.fn();
    const runtime = {
      objectMap: new Map([[object.id, node]]),
      worldLights: {
        key,
        keyOffset: new THREE.Vector3(1, 1, 1),
      },
      sky: { setSunDirectionOverride },
      authoredDirectionalLightActive: true,
      authoredDirectionalLightObjectId: object.id,
      authoredDirectionalLightSettings: { ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS },
      authoredDirectionalLightDirection: new THREE.Vector3(0, 1, 0),
      framesSinceSceneChange: 10,
    } as unknown as Runtime;

    expect(syncAuthoredDirectionalLight(runtime, [object], { worldSource: "sky" })).toBeNull();
    expect(runtime.authoredDirectionalLightActive).toBe(false);
    expect(runtime.authoredDirectionalLightObjectId).toBeNull();
    expect(setSunDirectionOverride).toHaveBeenCalledWith(null);
    expect(key.intensity).toBe(0);
    expect(key.castShadow).toBe(false);
  });

  it("refreshes live SceneNode rotation from the existing viewport frame path", () => {
    const object = makeObject("directionalLight", 0, {
      id: "animated-sun",
      rotation: [15, 20, 0],
    });
    const node = new THREE.Group();
    node.rotation.set(
      THREE.MathUtils.degToRad(object.rotation[0]),
      THREE.MathUtils.degToRad(object.rotation[1]),
      0,
    );
    const root = new THREE.Group();
    root.add(node);
    const key = new THREE.DirectionalLight("#ffffff", 0);
    const runtime = {
      objectMap: new Map([[object.id, node]]),
      worldLights: {
        key,
        keyOffset: new THREE.Vector3(),
      },
      sky: { setSunDirectionOverride: vi.fn() },
      authoredDirectionalLightActive: false,
      authoredDirectionalLightObjectId: null,
      authoredDirectionalLightSettings: null,
      authoredDirectionalLightDirection: null,
      framesSinceSceneChange: 10,
    } as unknown as Runtime;

    syncAuthoredDirectionalLight(runtime, [object], { worldSource: "sky" });
    const initial = runtime.worldLights.keyOffset.clone().normalize();
    node.rotation.y += THREE.MathUtils.degToRad(35);
    node.updateMatrixWorld(true);
    runtime.framesSinceSceneChange = 10;

    expect(syncAuthoredDirectionalLightFrame(runtime)).toBe(true);
    const expected = new THREE.Vector3(...worldSunDirectionForNode(node));
    expect(runtime.worldLights.keyOffset.clone().normalize().distanceTo(expected)).toBeLessThan(1e-6);
    expect(runtime.worldLights.keyOffset.clone().normalize().distanceTo(initial)).toBeGreaterThan(0.1);
    expect(runtime.framesSinceSceneChange).toBe(0);
    expect(syncAuthoredDirectionalLightFrame(runtime)).toBe(false);
  });

  it("migrates a legacy scene once and preserves the light through save/load", () => {
    const camera: SceneObject = {
      id: "camera",
      name: "Camera",
      primitive: "camera",
      color: "#ffffff",
      visible: true,
      locked: false,
      position: [0, 2, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    const migrated = migrateLegacyDirectionalLight([camera], defaultEnvironment);
    const twice = migrateLegacyDirectionalLight(migrated, defaultEnvironment);
    expect(twice).toBe(migrated);
    expect(migrated.map((object) => object.primitive)).toEqual(["camera", "directionalLight"]);

    const light = migrated[1];
    const saved = buildSavedScene({
      objects: migrated,
      camera: defaultCamera,
      activeObjectId: light.id,
      activeCameraId: camera.id,
      environment: defaultEnvironment,
      physicsWorldSettings: DEFAULT_PHYSICS_WORLD_SETTINGS,
    }, "2026-08-30T00:00:00.000Z");
    expect(saved.version).toBe("braze-engine/scene-v1");
    expect(saved.lightingAuthoringVersion).toBe(DIRECTIONAL_LIGHT_AUTHORING_VERSION);
    expect(saved.objects[1]).toMatchObject({
      source_type: "directionalLight",
      directional_light: {
        enabled: light.directionalLight?.enabled,
        color: light.directionalLight?.color,
        intensity: light.directionalLight?.intensity,
        cast_shadows: light.directionalLight?.castShadows,
      },
    });

    const loaded = parseSceneJson(JSON.stringify(saved));
    expect(loaded?.[1]).toMatchObject({
      primitive: "directionalLight",
      directionalLight: light.directionalLight,
      rotation: light.rotation,
    });
  });
});
