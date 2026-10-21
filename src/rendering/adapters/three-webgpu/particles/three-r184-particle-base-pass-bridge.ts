import type { PassTargetState } from "@particles/gpu";
import * as THREE from "three";
import type { Renderer } from "three/webgpu";

const EXPECTED_THREE_REVISION = "184";
const PARTICLE_RENDER_ORDER = 1_000_000;
const DIAGNOSTIC_CODE = "THREE_R184_PARTICLE_PASS_INCOMPATIBLE";

export type ThreeR184ParticlePassRecorder = Readonly<{
  renderToPass: (
    pass: GPURenderPassEncoder,
    camera: THREE.Camera,
    targetState: PassTargetState,
  ) => void;
}>;

export type ThreeR184ParticleCompatibilityDiagnostic = Readonly<{
  code: typeof DIAGNOSTIC_CODE;
  expectedRevision: typeof EXPECTED_THREE_REVISION;
  actualRevision: string;
  detail: string;
  message: string;
}>;

type BridgeArgs = Readonly<{
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: Renderer;
  particles: ThreeR184ParticlePassRecorder;
  reportDiagnostic?: (diagnostic: ThreeR184ParticleCompatibilityDiagnostic) => void;
}>;

export type ThreeR184ParticleBasePassBridge = Readonly<{
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}>;

type PinnedRendererAccess = Readonly<{
  renderer: Record<string, unknown>;
  backend: Record<string, unknown>;
  utils: Record<string, unknown>;
}>;

/**
 * Keeps the unavoidable Three r184 private pass seam isolated and version-guarded.
 * Particles remain part of Three's depth-aware base pass, never an overlay pass.
 */
export function installThreeR184ParticleBasePassBridge(
  args: BridgeArgs,
): ThreeR184ParticleBasePassBridge {
  let disposed = false;
  let incompatible = false;
  let diagnosticReported = false;
  const reportIncompatibility = (detail: string) => {
    incompatible = true;
    const diagnostic = compatibilityDiagnostic(detail);
    if (!diagnosticReported) {
      diagnosticReported = true;
      (args.reportDiagnostic ?? defaultReporter)(diagnostic);
    }
    return diagnostic;
  };

  let access: PinnedRendererAccess;
  try {
    access = pinnedRendererAccess(args.renderer);
  } catch (error) {
    const diagnostic = reportIncompatibility(errorMessage(error));
    throw new Error(diagnostic.message);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthTest: false,
    depthWrite: false,
    opacity: 0,
    transparent: true,
  });
  const hook = new THREE.Mesh(geometry, material);
  hook.name = "Particle Base-Pass Compatibility Bridge";
  hook.frustumCulled = false;
  hook.renderOrder = PARTICLE_RENDER_ORDER;
  hook.visible = false;
  hook.userData.renderPassHook = true;
  hook.userData.particleBasePassCompatibility = `three-r${EXPECTED_THREE_REVISION}`;
  hook.onAfterRender = (_activeRenderer, _scene, camera) => {
    if (disposed || incompatible || camera !== args.camera) return;
    let frame: ReturnType<typeof readPinnedFrame>;
    try {
      frame = readPinnedFrame(access);
    } catch (error) {
      hook.visible = false;
      reportIncompatibility(errorMessage(error));
      return;
    }
    try {
      args.particles.renderToPass(frame.pass, camera, frame.target);
    } finally {
      resetThreePipelineState(frame.data);
    }
  };

  args.scene.add(hook);
  return Object.freeze({
    setEnabled: (enabled: boolean) => {
      if (disposed) return;
      hook.visible = enabled && !incompatible;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      args.scene.remove(hook);
      hook.onAfterRender = () => undefined;
      geometry.dispose();
      material.dispose();
    },
  });
}

function pinnedRendererAccess(renderer: Renderer): PinnedRendererAccess {
  if (THREE.REVISION !== EXPECTED_THREE_REVISION) {
    throw new Error(`expected Three revision ${EXPECTED_THREE_REVISION}, received ${THREE.REVISION}`);
  }
  if (!isRecord(renderer) || !("_currentRenderContext" in renderer)) {
    throw new Error("renderer._currentRenderContext is unavailable");
  }
  const backend = renderer.backend;
  if (!isRecord(backend) || typeof backend.get !== "function") {
    throw new Error("renderer.backend.get is unavailable");
  }
  const utils = backend.utils;
  const requiredUtils = [
    "getCurrentColorFormats",
    "getCurrentDepthStencilFormat",
    "getSampleCountRenderContext",
  ];
  if (!isRecord(utils) || requiredUtils.some((name) => typeof utils[name] !== "function")) {
    throw new Error("renderer.backend.utils does not match the pinned attachment API");
  }
  return { renderer, backend, utils };
}

function readPinnedFrame(access: PinnedRendererAccess): Readonly<{
  data: Record<string, unknown>;
  pass: GPURenderPassEncoder;
  target: PassTargetState;
}> {
  const context = access.renderer._currentRenderContext;
  if (!isRecord(context)) throw new Error("the active Three render context is unavailable");
  const get = access.backend.get as (key: unknown) => unknown;
  const data = get.call(access.backend, context);
  if (!isRecord(data)) throw new Error("the active Three backend context data is unavailable");
  const pass = data.currentPass;
  if (!isParticleRenderPass(pass)) throw new Error("the active Three render pass encoder is incompatible");
  if (!isPinnedPipelineState(data.currentSets)) {
    throw new Error("Three currentSets no longer matches the pinned r184 pipeline-state shape");
  }

  const colorFormats = callUtils(access.utils, "getCurrentColorFormats", context);
  const depthFormat = callUtils(access.utils, "getCurrentDepthStencilFormat", context);
  const sampleCount = callUtils(access.utils, "getSampleCountRenderContext", context);
  if (!isFormatList(colorFormats)) throw new Error("the active color attachment formats are invalid");
  if (!isTextureFormat(depthFormat)) {
    throw new Error("the depth attachment required for particle occlusion is unavailable");
  }
  if (!Number.isSafeInteger(sampleCount) || (sampleCount as number) <= 0) {
    throw new Error("the active render-pass sample count is invalid");
  }
  return {
    data,
    pass,
    target: { colorFormats: [...colorFormats], depthFormat, sampleCount: sampleCount as number },
  };
}

function callUtils(utils: Record<string, unknown>, name: string, context: unknown): unknown {
  const operation = utils[name] as (context: unknown) => unknown;
  return operation.call(utils, context);
}

function resetThreePipelineState(data: Record<string, unknown>): void {
  data.currentSets = { attributes: {}, bindingGroups: [], index: null, pipeline: null };
}

function isPinnedPipelineState(value: unknown): boolean {
  return isRecord(value)
    && isRecord(value.attributes)
    && Array.isArray(value.bindingGroups)
    && "index" in value
    && "pipeline" in value;
}

function isParticleRenderPass(value: unknown): value is GPURenderPassEncoder {
  if (!isRecord(value)) return false;
  return ["setPipeline", "setBindGroup", "setVertexBuffer", "setIndexBuffer", "drawIndirect", "drawIndexedIndirect"]
    .every((name) => typeof value[name] === "function");
}

function isFormatList(value: unknown): value is GPUTextureFormat[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every(isTextureFormat);
}

function isTextureFormat(value: unknown): value is GPUTextureFormat {
  return typeof value === "string" && value.length > 0;
}

function compatibilityDiagnostic(detail: string): ThreeR184ParticleCompatibilityDiagnostic {
  const message = `Particle base-pass integration is incompatible with Three r${THREE.REVISION}: ${detail}. `
    + "Keep three@0.184.0 and @types/three@0.184.1 pinned or replace this bridge with a public pass API.";
  return Object.freeze({
    code: DIAGNOSTIC_CODE,
    expectedRevision: EXPECTED_THREE_REVISION,
    actualRevision: THREE.REVISION,
    detail,
    message,
  });
}

function defaultReporter(diagnostic: ThreeR184ParticleCompatibilityDiagnostic): void {
  console.error(`[particles:${diagnostic.code}] ${diagnostic.message}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
