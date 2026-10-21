import * as THREE from "three";
import {
  dynamicCasterGeneration,
  shadowCameraGeneration,
  shadowCameraPoseGeneration,
  shadowExtentGeneration,
  shadowLightGeneration,
  staticCasterGeneration,
} from "../../../runtime/shadows/shadow-generations";
import type { ShadowCascadeUpdateInput } from "../../../runtime/shadows/shadow-cascade-update-planner";

type Invalidation = "dynamicCasters" | "extent" | "light" | "staticCasters";

export type ThreeShadowFrameTracker = Readonly<{
  currentInput: () => ShadowCascadeUpdateInput;
  forceChanged: () => void;
  hasChanges: () => boolean;
  invalidate: (kind: Invalidation) => void;
  markPlanned: () => void;
  observe: (camera: THREE.PerspectiveCamera) => void;
}>;

type MutableInput = {
  camera: { near: number; far: number; maxShadowDistance: number };
  cameraPosition: { x: number; y: number; z: number };
  generations: {
    camera: ReturnType<typeof shadowCameraGeneration>;
    cameraPose: ReturnType<typeof shadowCameraPoseGeneration>;
    light: ReturnType<typeof shadowLightGeneration>;
    extent: ReturnType<typeof shadowExtentGeneration>;
    staticCasters: ReturnType<typeof staticCasterGeneration>;
    dynamicCasters: ReturnType<typeof dynamicCasterGeneration>;
  };
};

/** Tracks a camera/generation key and updates one reusable planner input in place. */
export function createThreeShadowFrameTracker(
  maxShadowDistance = 120,
): ThreeShadowFrameTracker {
  const input: MutableInput = {
    camera: { near: 0.1, far: maxShadowDistance, maxShadowDistance },
    cameraPosition: { x: 0, y: 0, z: 0 },
    generations: {
      camera: shadowCameraGeneration(0),
      cameraPose: shadowCameraPoseGeneration(0),
      light: shadowLightGeneration(0),
      extent: shadowExtentGeneration(0),
      staticCasters: staticCasterGeneration(0),
      dynamicCasters: dynamicCasterGeneration(0),
    },
  };
  const previous = {
    initialized: false,
    near: 0,
    far: 0,
    fov: 0,
    aspect: 0,
    zoom: 0,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  let changed = true;

  return Object.freeze({
    currentInput: () => input,
    forceChanged: () => { changed = true; },
    hasChanges: () => changed,
    invalidate: (kind) => {
      advanceGeneration(input.generations, kind);
      changed = true;
    },
    markPlanned: () => { changed = false; },
    observe: (camera) => {
      camera.updateWorldMatrix(true, false);
      camera.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
      if (previous.initialized) {
        if (projectionChanged(camera, previous)) {
          input.generations.camera = shadowCameraGeneration(
            nextGeneration(input.generations.camera),
          );
          changed = true;
        }
        if (
          worldPosition.distanceToSquared(previous.position) > 1e-12
          || 1 - Math.abs(worldQuaternion.dot(previous.quaternion)) > 1e-12
        ) {
          input.generations.cameraPose = shadowCameraPoseGeneration(
            nextGeneration(input.generations.cameraPose),
          );
          changed = true;
        }
      }
      input.camera.near = camera.near;
      input.camera.far = camera.far;
      input.cameraPosition.x = worldPosition.x;
      input.cameraPosition.y = worldPosition.y;
      input.cameraPosition.z = worldPosition.z;
      rememberCamera(camera, worldPosition, worldQuaternion, previous);
    },
  });
}

function advanceGeneration(
  generations: MutableInput["generations"],
  kind: Invalidation,
): void {
  switch (kind) {
    case "dynamicCasters":
      generations.dynamicCasters = dynamicCasterGeneration(
        nextGeneration(generations.dynamicCasters),
      );
      return;
    case "extent":
      generations.extent = shadowExtentGeneration(nextGeneration(generations.extent));
      return;
    case "light":
      generations.light = shadowLightGeneration(nextGeneration(generations.light));
      return;
    case "staticCasters":
      generations.staticCasters = staticCasterGeneration(
        nextGeneration(generations.staticCasters),
      );
  }
}

function projectionChanged(
  camera: THREE.PerspectiveCamera,
  previous: Readonly<{
    near: number;
    far: number;
    fov: number;
    aspect: number;
    zoom: number;
  }>,
): boolean {
  return camera.near !== previous.near
    || camera.far !== previous.far
    || camera.fov !== previous.fov
    || camera.aspect !== previous.aspect
    || camera.zoom !== previous.zoom;
}

function rememberCamera(
  camera: THREE.PerspectiveCamera,
  worldPosition: THREE.Vector3,
  worldQuaternion: THREE.Quaternion,
  previous: {
    initialized: boolean;
    near: number;
    far: number;
    fov: number;
    aspect: number;
    zoom: number;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  },
): void {
  previous.near = camera.near;
  previous.far = camera.far;
  previous.fov = camera.fov;
  previous.aspect = camera.aspect;
  previous.zoom = camera.zoom;
  previous.position.copy(worldPosition);
  previous.quaternion.copy(worldQuaternion);
  previous.initialized = true;
}

function nextGeneration(value: number): number {
  return value === Number.MAX_SAFE_INTEGER ? 0 : value + 1;
}
