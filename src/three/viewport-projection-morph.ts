import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const PROJECTION_STORAGE_KEY = "tgan:viewport-projection";
const PROJECTION_DURATION_MS = 280;

export type ViewportProjection = "perspective" | "orthographic";

export type ProjectionMorphState = {
  mode: ViewportProjection;
  mix: number;
};

export type ViewportProjectionMorph = {
  update: (now?: number) => boolean;
  toggle: (now?: number) => void;
  destroy: () => void;
};

type ProjectionMorphArgs = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  onChange: (state: ProjectionMorphState) => void;
};

export function matchingOrthographicProjection(
  camera: THREE.PerspectiveCamera,
  targetDistance: number,
  target = new THREE.Matrix4(),
): THREE.Matrix4 {
  const halfHeight = Math.max(0.0001, targetDistance)
    * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV() * 0.5));
  const halfWidth = halfHeight * Math.max(0.0001, camera.aspect);
  return target.makeOrthographic(
    -halfWidth,
    halfWidth,
    halfHeight,
    -halfHeight,
    camera.near,
    camera.far,
    camera.coordinateSystem,
  );
}

export function blendProjectionMatrices(
  perspective: THREE.Matrix4,
  orthographic: THREE.Matrix4,
  mix: number,
  target = new THREE.Matrix4(),
): THREE.Matrix4 {
  const amount = THREE.MathUtils.clamp(mix, 0, 1);
  const result = target.elements;
  const from = perspective.elements;
  const to = orthographic.elements;
  for (let index = 0; index < result.length; index += 1) {
    result[index] = THREE.MathUtils.lerp(from[index]!, to[index]!, amount);
  }
  return target;
}

function readStoredMode(): ViewportProjection {
  try {
    return window.localStorage.getItem(PROJECTION_STORAGE_KEY) === "orthographic"
      ? "orthographic"
      : "perspective";
  } catch {
    return "perspective";
  }
}

function storeMode(mode: ViewportProjection): void {
  try {
    window.localStorage.setItem(PROJECTION_STORAGE_KEY, mode);
  } catch {
    // Projection is an editor preference; unavailable storage is harmless.
  }
}

export function createViewportProjectionMorph({
  camera,
  controls,
  onChange,
}: ProjectionMorphArgs): ViewportProjectionMorph {
  const perspective = new THREE.Matrix4();
  const orthographic = new THREE.Matrix4();
  let mode = readStoredMode();
  let mix = mode === "orthographic" ? 1 : 0;
  let fromMix = mix;
  let targetMix = mix;
  let startTime = 0;
  let animating = false;
  let lastSignature = "";

  const signature = () => [
    camera.fov,
    camera.aspect,
    camera.near,
    camera.far,
    camera.zoom,
    camera.coordinateSystem,
    camera.position.distanceTo(controls.target),
  ].map((value) => value.toFixed(7)).join("|");

  const apply = () => {
    // Keep the authored perspective settings as the source projection. The
    // visible matrix is then morphed toward an ortho projection matched at the
    // OrbitControls target plane, so apparent scale does not jump.
    camera.updateProjectionMatrix();
    perspective.copy(camera.projectionMatrix);
    matchingOrthographicProjection(camera, camera.position.distanceTo(controls.target), orthographic);
    blendProjectionMatrices(perspective, orthographic, mix, camera.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    lastSignature = signature();
    onChange({ mode, mix });
  };

  apply();

  return {
    toggle: (now = performance.now()) => {
      mode = mode === "perspective" ? "orthographic" : "perspective";
      fromMix = mix;
      targetMix = mode === "orthographic" ? 1 : 0;
      startTime = now;
      animating = true;
      storeMode(mode);
      onChange({ mode, mix });
    },
    update: (now = performance.now()) => {
      if (animating) {
        const progress = Math.min(1, Math.max(0, (now - startTime) / PROJECTION_DURATION_MS));
        const eased = 1 - Math.pow(1 - progress, 3);
        mix = THREE.MathUtils.lerp(fromMix, targetMix, eased);
        if (progress >= 1) {
          mix = targetMix;
          animating = false;
        }
        apply();
        return true;
      }
      if (mix > 0 && signature() !== lastSignature) {
        apply();
        return true;
      }
      return false;
    },
    destroy: () => {
      mix = 0;
      camera.updateProjectionMatrix();
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    },
  };
}
