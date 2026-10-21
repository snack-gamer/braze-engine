import * as THREE from "three";
import type {
  EnvironmentSettings,
  SceneObject,
  Vec3,
} from "../types";
import {
  DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
} from "../scene/domain/directional-light";
import {
  LEGACY_SKY_LIGHT_DEFAULTS,
  type LegacySkyLightInput,
} from "../rendering/application/legacy-sky-light-input";
export {
  DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
  DIRECTIONAL_LIGHT_AUTHORING_VERSION,
  needsDirectionalLightMigration,
  normalizeDirectionalLightSettings,
} from "../scene/domain/directional-light";

/** Rotation that makes a Unity-style light's local +Z axis point toward the world. */
export function directionalLightRotationFromSun(
  altitudeDeg: number,
  azimuthDeg: number,
): Vec3 {
  const altitude = THREE.MathUtils.degToRad(altitudeDeg);
  const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
  const towardSun = new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(altitude),
    Math.sin(altitude),
    Math.cos(azimuth) * Math.cos(altitude),
  ).normalize();
  const travelDirection = towardSun.negate();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    travelDirection,
  );
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return [euler.x, euler.y, euler.z].map((value) =>
    Number(THREE.MathUtils.radToDeg(value).toFixed(4)),
  ) as Vec3;
}

function smoothstep(value: number, min: number, max: number): number {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Preserve legacy lighting when upgrading a scene to first-class authoring:
 * procedural Sky becomes an equivalent enabled key, while HDRI materializes
 * its former no-direct-light state as a disabled component. */
export function directionalLightFromEnvironment(
  environment: EnvironmentSettings | undefined,
  id = "obj-directional-light",
  legacySkyLight: LegacySkyLightInput = LEGACY_SKY_LIGHT_DEFAULTS,
): SceneObject {
  if (!environment || environment.worldSource !== "sky") {
    // Legacy HDRI worlds deliberately had no direct key light: illumination
    // came from the environment texture. Materialize that state as a disabled,
    // zero-intensity component so migration exposes a Unity-style authoring
    // object without changing the saved scene's appearance. `undefined` is the
    // new-scene seed path and retains the useful authored-light defaults.
    const legacyHdri = environment?.worldSource === "hdri";
    return {
      id,
      name: "Directional Light",
      primitive: "directionalLight",
      color: DEFAULT_DIRECTIONAL_LIGHT_SETTINGS.color,
      visible: true,
      locked: false,
      renderVisible: false,
      position: [0, 3, 0],
      rotation: [50, -30, 0],
      scale: [1, 1, 1],
      directionalLight: legacyHdri
        ? {
            ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS,
            enabled: false,
            intensity: 0,
            castShadows: false,
          }
        : { ...DEFAULT_DIRECTIONAL_LIGHT_SETTINGS },
    };
  }

  const sky = environment.sky;
  const altitude = THREE.MathUtils.degToRad(legacySkyLight.altitudeDeg);
  const sunY = Math.sin(altitude);
  const daylight = smoothstep(sunY, -0.015, 0.22);
  const twilight = (1 - smoothstep(sunY, 0.05, 0.32)) * smoothstep(sunY, -0.2, 0.08);
  const intensity = sky.exposure * (daylight * 2.45 + twilight * 0.22);
  const highSun = smoothstep(legacySkyLight.altitudeDeg, 4, 42);
  const color = new THREE.Color("#ff9b4e")
    .lerp(new THREE.Color("#fff0c8"), highSun)
    .getHexString();

  return {
    id,
    name: "Directional Light",
    primitive: "directionalLight",
    color: `#${color}`,
    visible: true,
    locked: false,
    renderVisible: false,
    position: [0, 3, 0],
    rotation: directionalLightRotationFromSun(legacySkyLight.altitudeDeg, legacySkyLight.azimuthDeg),
    scale: [1, 1, 1],
    directionalLight: {
      enabled: true,
      color: `#${color}`,
      intensity: Number(intensity.toFixed(4)),
      castShadows: daylight > 0.04,
    },
  };
}

export function migrateLegacyDirectionalLight(
  objects: SceneObject[],
  environment: EnvironmentSettings | undefined,
  legacySkyLight: LegacySkyLightInput = LEGACY_SKY_LIGHT_DEFAULTS,
): SceneObject[] {
  if (objects.some((object) => object.primitive === "directionalLight")) return objects;
  const usedIds = new Set(objects.map((object) => object.id));
  let id = "obj-directional-light";
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `obj-directional-light-${suffix}`;
    suffix += 1;
  }
  const light = directionalLightFromEnvironment(environment, id, legacySkyLight);
  const cameraIndex = objects.findIndex((object) => object.primitive === "camera");
  if (cameraIndex < 0) return [light, ...objects];
  return [...objects.slice(0, cameraIndex + 1), light, ...objects.slice(cameraIndex + 1)];
}
