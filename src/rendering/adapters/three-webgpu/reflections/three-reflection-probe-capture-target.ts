import {
  CubeCamera,
  CubeRenderTarget,
  HalfFloatType,
  LinearMipmapLinearFilter,
  type CubeTexture,
  type Renderer,
  type Scene,
} from "three/webgpu";

const DEFAULT_RESOLUTION = 128;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 500;
const MAX_RESOLUTION = 4_096;

export type ThreeReflectionProbePosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type ThreeReflectionProbeCaptureTarget = Readonly<{
  capture: (
    renderer: Renderer,
    scene: Scene,
    position: ThreeReflectionProbePosition,
  ) => void;
  getTexture: () => CubeTexture;
  dispose: () => void;
}>;

export type ThreeReflectionProbeCaptureTargetOptions = Readonly<{
  resolution?: number;
  near?: number;
  far?: number;
  textureName?: string;
}>;

/** Owns the public Three cube camera and render target used by one probe. */
export function createThreeReflectionProbeCaptureTarget(
  options: ThreeReflectionProbeCaptureTargetOptions = {},
): ThreeReflectionProbeCaptureTarget {
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const near = options.near ?? DEFAULT_NEAR;
  const far = options.far ?? DEFAULT_FAR;
  validateOptions(resolution, near, far);

  const target = new CubeRenderTarget(resolution, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
  });
  target.texture.name = options.textureName?.trim() || "ReflectionProbe";
  const camera = new CubeCamera(near, far, target);
  let disposed = false;

  return {
    capture(renderer, scene, position) {
      if (disposed) throw new Error("Cannot capture with a disposed reflection probe target.");
      camera.position.set(position.x, position.y, position.z);
      const previousTarget = renderer.getRenderTarget();
      const previousFace = renderer.getActiveCubeFace();
      const previousMipmap = renderer.getActiveMipmapLevel();
      const previousXrEnabled = renderer.xr.enabled;
      const previousShadowsEnabled = renderer.shadowMap.enabled;
      const previousEnvironment = scene.environment;
      const samplesCaptureTarget = previousEnvironment === target.texture;
      const generateMipmaps = target.texture.generateMipmaps;
      let result: unknown;
      try {
        // A repeated capture commonly runs after this texture has become the
        // scene environment. Sampling it while rendering its cube faces is a
        // WebGPU attachment feedback loop, so hide only this target. An
        // independently authored environment remains available to the probe.
        if (samplesCaptureTarget) scene.environment = null;
        // An environment probe does not need to regenerate directional CSM
        // for each of its six temporary cube cameras.
        renderer.shadowMap.enabled = false;
        result = (camera.update as unknown as (
          activeRenderer: Renderer,
          activeScene: Scene,
        ) => unknown)(renderer, scene);
      } finally {
        target.texture.generateMipmaps = generateMipmaps;
        if (renderer.getRenderTarget() !== previousTarget
          || renderer.getActiveCubeFace() !== previousFace
          || renderer.getActiveMipmapLevel() !== previousMipmap) {
          renderer.setRenderTarget(previousTarget, previousFace, previousMipmap);
        }
        if (samplesCaptureTarget) scene.environment = previousEnvironment;
        renderer.xr.enabled = previousXrEnabled;
        renderer.shadowMap.enabled = previousShadowsEnabled;
      }
      if (isPromiseLike(result)) {
        throw new Error("Reflection probe capture must complete synchronously.");
      }
    },
    getTexture: () => target.texture as CubeTexture,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      target.dispose();
    },
  };
}

function validateOptions(resolution: number, near: number, far: number): void {
  if (!Number.isInteger(resolution) || resolution <= 0 || resolution > MAX_RESOLUTION) {
    throw new Error(`Reflection probe resolution must be an integer from 1 to ${MAX_RESOLUTION}.`);
  }
  if (!Number.isFinite(near) || near <= 0) {
    throw new Error("Reflection probe near distance must be finite and positive.");
  }
  if (!Number.isFinite(far) || far <= near) {
    throw new Error("Reflection probe far distance must be finite and greater than near distance.");
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof (value as PromiseLike<unknown>).then === "function";
}
