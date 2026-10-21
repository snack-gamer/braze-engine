import {
  bakeCurveLUT, type LUTDescriptor, type MinMaxCurve, type Module,
  type ParticleSystem, type UniformDescriptor,
} from '@particles/core';
import { buildComputeShader, LUT_BIND_BASE, type CompositeShader } from './pipeline-builder';
import { COMPACT_WGSL } from './shaders/compact.wgsl';
import { MESH_RENDER_WGSL } from './shaders/mesh-render.wgsl';
import { RENDER_WGSL } from './shaders/render.wgsl';
import {
  generateAtlasTexture,
  generateBuiltinTexture,
  makeDefaultFrameLut,
  uploadCurveFrameLut,
  type BuiltinTextureName,
} from './textures';
import { CustomTextureStore } from './custom-texture-store';
import {
  ParticleMeshFramePlan,
  type BuiltinParticleMesh,
  type ParticleCustomMeshAsset,
  type ParticleMeshDistribution,
  type ParticleMeshSlot,
  type ParticleMeshSource,
} from './particle-mesh-frame-plan';
import { MAX_FIELD_EFFECTORS, MAX_PARTICLE_COLLIDERS } from './particle-influence-limits';

export type BlendMode = 'alpha' | 'additive' | 'multiply';
type RenderMaterial = 'unlitAlpha' | 'unlitAdditive' | 'softSmoke' | 'multiply';
type MaterialShading = 'unlit' | 'lit';
type SpriteRenderMode =
  | 'sprite'
  | 'stretchedSprite'
  | 'horizontalBillboard'
  | 'verticalBillboard'
  | 'mesh'
  | 'none';
type RenderFacing = 'auto' | 'camera' | 'velocity' | 'world' | 'local';
type BuiltinMesh = BuiltinParticleMesh;
type MeshDistribution = ParticleMeshDistribution;
type MeshSource = ParticleMeshSource;
type MeshFaceSide = 'front' | 'back' | 'both';
export type FieldEffectorType = 'directionalForce' | 'radialForce' | 'vortex' | 'drag' | 'turbulence';
export type FieldEffectorShape = 'infinite' | 'sphere' | 'box';
export type FieldEffectorFalloff = 'none' | 'linear' | 'smooth';
export type FieldVortexMode = 'free' | 'core' | 'orbit';
export type ParticleColliderType = 'plane' | 'sphere' | 'box';

export interface GpuFieldEffector {
  type: FieldEffectorType;
  shape: FieldEffectorShape;
  falloff: FieldEffectorFalloff;
  strength: number;
  position: [number, number, number];
  direction: [number, number, number];
  vortexMode?: FieldVortexMode;
  vortexPull?: number;
  vortexOrbitRadius?: number;
  vortexLift?: number;
  vortexAxialDamping?: number;
  vortexLiftVariation?: number;
  turbulenceDetail?: number;
  turbulenceScale?: number;
  turbulenceScaleRandom?: number;
  randomStrength?: number;
  randomPosition?: number;
  randomDirection?: number;
  radius: number;
  size: [number, number, number];
}

export interface GpuParticleCollider {
  type: ParticleColliderType;
  position: [number, number, number];
  axisX: [number, number, number];
  axisY: [number, number, number];
  axisZ: [number, number, number];
  radius: number;
  size: [number, number, number];
  bounce: number;
  friction: number;
  stickiness: number;
  settleSpeed: number;
}

export type CpuParticleSpawnAlign = 'none' | 'velocity' | 'normal';

export interface CpuParticleSpawn {
  position: [number, number, number];
  velocity: [number, number, number];
  normal: [number, number, number];
  count: number;
  align: CpuParticleSpawnAlign;
  inheritVelocity: number;
  generation?: number;
}

export type GpuParticleEventType = 'birth' | 'death' | 'collision';

export interface GpuParticleEvent {
  type: GpuParticleEventType;
  slot: number;
  colliderIndex: number;
  generation: number;
  speed: number;
  position: [number, number, number];
  velocity: [number, number, number];
  normal: [number, number, number];
}

type CustomMeshAssetLike = ParticleCustomMeshAsset;
type MeshSlotLike = ParticleMeshSlot;

interface MaterialModuleLike extends Module {
  config: {
    preset: RenderMaterial;
    shading: MaterialShading;
    blendMode: BlendMode;
    tint: [number, number, number, number];
    baseMap?: string;
    alphaCutoff: number;
    emissiveStrength: number;
    twoSided: boolean;
    depthTest: boolean;
    depthWrite: boolean;
  };
}

/** Minimal duck-typed interface for the Renderer module to avoid a circular dep. */
interface RendererModuleLike extends Module {
  config: {
    renderMode?: SpriteRenderMode;
    facing?: RenderFacing;
    material?: RenderMaterial;
    blendMode: BlendMode;
    tint: [number, number, number, number];
    texture: BuiltinTextureName;
    customTexture?: string;
    pivot?: [number, number];
    flip?: [number, number];
    velocityScale?: number;
    lengthScale?: number;
    rotateWithStretch?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    mesh?: BuiltinMesh;
    meshSource?: MeshSource;
    meshFaceSide?: MeshFaceSide;
    meshScale?: [number, number, number];
    meshRotationJitter?: [number, number, number];
    customMesh?: CustomMeshAssetLike;
    meshDistribution?: MeshDistribution;
    meshSlots?: MeshSlotLike[];
  };
}
interface SpriteAnimModuleLike extends Module {
  config: {
    cols: number;
    rows: number;
    cycles: number;
    frameOverLifetime: MinMaxCurve;
    customAtlas?: string;
    animation: 'wholeSheet' | 'singleRow';
    timeMode: 'fps' | 'lifetime' | 'speed';
    playback: 'once' | 'loop' | 'pingPong' | 'holdLast';
    fps: number;
    speedRange: [number, number] | readonly [number, number];
    startFrame: number;
    randomStart: boolean;
    rowMode: 'custom' | 'random';
    row: number;
  };
}

interface MeshShapeModuleLike extends Module {
  config: {
    kind: string;
    mesh?: { name: string; vertices: number[]; indices: number[] };
    meshEmitSource?: 'surface' | 'vertices' | 'edges';
  };
}

interface MeshShapeSampler {
  key: string;
  cumulativeAreas: Float32Array;
  totalArea: number;
}

/** 80 bytes per particle (5x vec4f). */
export const PARTICLE_STRIDE = 80;
/** 64 (mat4 emit_xform) + 32 (8 scalars). */
const GLOBAL_UNIFORMS_SIZE = 96;
const GLOBALS_MAT_OFFSET_F32 = 0;
const GLOBALS_TIME_OFFSET_F32 = 16;
const GLOBALS_DT_OFFSET_F32 = 17;
const GLOBALS_CAPACITY_OFFSET_U32 = 18;
const GLOBALS_EMITCURSOR_OFFSET_U32 = 19;
const GLOBALS_EMITCOUNT_OFFSET_U32 = 20;
const GLOBALS_SEED_OFFSET_U32 = 21;
const GLOBALS_EVENT_FLAGS_OFFSET_U32 = 22;
const GLOBALS_EVENT_CAPACITY_OFFSET_U32 = 23;
const MAX_RENDER_BATCHES = 4;
const FIELD_EFFECTOR_FLOATS = 4 + MAX_FIELD_EFFECTORS * 24;
const PARTICLE_COLLIDER_FLOATS = 4 + MAX_PARTICLE_COLLIDERS * 24;
const INDIRECT_ARGS_U32_STRIDE = 5;
const INDIRECT_ARGS_BYTES_STRIDE = INDIRECT_ARGS_U32_STRIDE * 4;
const MAX_PARTICLE_EVENTS = 4096;
const EVENT_QUEUE_HEADER_BYTES = 16;
const EVENT_RECORD_BYTES = 64;
const EVENT_QUEUE_BYTES = EVENT_QUEUE_HEADER_BYTES + MAX_PARTICLE_EVENTS * EVENT_RECORD_BYTES;
const WHITE_TINT: readonly [number, number, number, number] = [1, 1, 1, 1];
const ZERO_VEC2: readonly [number, number] = [0, 0];
const ZERO_VEC3: readonly [number, number, number] = [0, 0, 0];
const ONE_VEC3: readonly [number, number, number] = [1, 1, 1];

export type PlayState = 'playing' | 'paused' | 'stopped';

export interface BackendOptions {
  device: GPUDevice;
  colorFormat: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
  /** Multisample count of the surface the particles render into. Must match scene MSAA. */
  sampleCount?: number;
  /** CPU-side wakeup when decoded resources are ready for an admitted GPU commit. */
  onGpuCommitReady?: () => void;
}

/**
 * Full attachment state of the render pass particles draw into. WebGPU
 * requires a pipeline's color target list to match the pass exactly, so a
 * host that renders particles inside an MRT pass (e.g. a deferred/composite
 * scene pass with normal/roughness targets) must report every attachment.
 * Particles only write color to target 0; extra targets are declared with
 * writeMask 0.
 */
export interface PassTargetState {
  colorFormats: GPUTextureFormat[];
  depthFormat?: GPUTextureFormat;
  sampleCount?: number;
}

export interface BackendUpdateOptions {
  /** False means simulate live particles but spawn nothing this tick. */
  allowEmit?: boolean;
  /** Runtime playback duration override, used by emitter timeline clips. */
  duration?: number;
  /** Runtime loop override, used by emitter timeline clips. */
  looping?: boolean;
  /** Bitmask of particle event kinds to append on GPU: birth=1, death=2, collision=4. */
  eventFlags?: number;
}

interface CompiledPipeline {
  shader: CompositeShader;
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  /** module uniform values mirrored on CPU for partial updates. */
  uniformView: Float32Array;
  uniformViewU32: Uint32Array;
  lutTextures: GPUTexture[];
}

interface MeshResource {
  key: string;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
}

export class ParticleBackend {
  readonly device: GPUDevice;
  readonly system: ParticleSystem;
  colorFormat: GPUTextureFormat;
  depthFormat: GPUTextureFormat | undefined;
  sampleCount: number;
  /** MRT attachments beyond target 0; particles declare but never write them. */
  private readonly extraColorFormats: GPUTextureFormat[] = [];

  readonly particleBuffer: GPUBuffer;
  readonly globalBuffer: GPUBuffer;
  private readonly globalScratch = new ArrayBuffer(GLOBAL_UNIFORMS_SIZE);
  private readonly globalF32: Float32Array;
  private readonly globalU32: Uint32Array;

  private emit: CompiledPipeline | null = null;
  private simulate: CompiledPipeline | null = null;

  private renderPipeline: GPURenderPipeline | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private renderLayout: GPUBindGroupLayout | null = null;
  private meshPipeline: GPURenderPipeline | null = null;
  private meshLayout: GPUBindGroupLayout | null = null;
  private compactPipeline: GPUComputePipeline | null = null;
  private compactBindGroup: GPUBindGroup | null = null;
  /** Currently bound blend mode for the render pipeline (rebuilds on change). */
  private currentBlend: BlendMode = 'alpha';
  private currentDepthTest = true;
  private currentDepthWrite = false;
  private currentMeshCullMode: GPUCullMode = 'none';
  /** mat4 view_proj + mat4 model + vec4 right + vec4 up + vec4 tint + vec4 tile + vec4 render + vec4 pivot/flip + vec4 stretch + vec4 mesh scale. */
  private readonly renderUniformBuffer: GPUBuffer;
  private readonly meshUniformBuffers: GPUBuffer[] = [];
  private readonly meshBindGroups: Array<GPUBindGroup | null> = [null, null, null, null];
  private readonly meshBindGroupTextures: Array<GPUTexture | null> = [null, null, null, null];
  private readonly meshFrame = new ParticleMeshFramePlan();
  private readonly renderUniformScratch = new Float32Array(16 + 16 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4);
  private readonly visibleIndexBuffer: GPUBuffer;
  private readonly indirectBuffer: GPUBuffer;
  private readonly compactParamsBuffer: GPUBuffer;
  private readonly eventBuffer: GPUBuffer;
  private readonly fieldEffectorBuffer: GPUBuffer;
  private readonly fieldEffectorScratch = new Float32Array(FIELD_EFFECTOR_FLOATS);
  private readonly colliderBuffer: GPUBuffer;
  private readonly colliderScratch = new Float32Array(PARTICLE_COLLIDER_FLOATS);
  private readonly compactScratch = new ArrayBuffer(32);
  private readonly compactU32 = new Uint32Array(this.compactScratch);
  private readonly compactF32 = new Float32Array(this.compactScratch);
  private readonly indirectScratch = new Uint32Array(MAX_RENDER_BATCHES * INDIRECT_ARGS_U32_STRIDE);
  private readonly meshCache = new Map<string, MeshResource>();
  private eventQueueResetPending = true;
  private meshShapeSampler: MeshShapeSampler | null = null;
  /** Built-in texture cache, generated on first use. */
  private readonly textureCache = new Map<BuiltinTextureName, GPUTexture>();
  private readonly customTextures: CustomTextureStore;
  /** Frame LUT used by sprite animation; default 1×1 when disabled. */
  private spriteFrameLut: GPUTexture;
  /** Linear-clamp sampler for the particle texture. */
  private readonly sampler: GPUSampler;

  /** Cursor for ring-buffer emit allocation. */
  private emitCursor = 0;
  /** Carry-over fractional emission accumulator (host-side). */
  private emitAccumulator = 0;
  /** Absolute simulation time, seconds. */
  private time = 0;
  /** Playback state — drives emit/simulate dispatch in update(). */
  playState: PlayState = 'playing';
  /** Identity 4x4, default for emit_xform if caller doesn't supply one. */
  private static readonly IDENTITY = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]);
  /** Emit-time transform set per-frame by the view. */
  private emitXform: Float32Array = ParticleBackend.IDENTITY;

  constructor(system: ParticleSystem, opts: BackendOptions) {
    this.device = opts.device;
    this.system = system;
    this.colorFormat = opts.colorFormat;
    this.depthFormat = opts.depthFormat;
    this.sampleCount = opts.sampleCount ?? 1;
    this.customTextures = new CustomTextureStore({
      onCommitReady: opts.onGpuCommitReady,
    });

    this.globalF32 = new Float32Array(this.globalScratch);
    this.globalU32 = new Uint32Array(this.globalScratch);

    this.particleBuffer = this.device.createBuffer({
      label: 'particles',
      size: PARTICLE_STRIDE * system.config.capacity,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX,
    });
    // Zero-init so all slots start dead (lifetime == 0).
    const zero = new Uint8Array(PARTICLE_STRIDE * system.config.capacity);
    this.device.queue.writeBuffer(this.particleBuffer, 0, zero);

    this.globalBuffer = this.device.createBuffer({
      label: 'globals',
      size: GLOBAL_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.visibleIndexBuffer = this.device.createBuffer({
      label: 'visible_particle_indices',
      size: system.config.capacity * MAX_RENDER_BATCHES * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    this.indirectBuffer = this.device.createBuffer({
      label: 'particle_indirect_args',
      size: MAX_RENDER_BATCHES * INDIRECT_ARGS_BYTES_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });

    this.compactParamsBuffer = this.device.createBuffer({
      label: 'particle_compact_params',
      size: this.compactScratch.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.eventBuffer = this.device.createBuffer({
      label: 'particle_event_queue',
      size: EVENT_QUEUE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    this.fieldEffectorBuffer = this.device.createBuffer({
      label: 'field_effectors',
      size: this.fieldEffectorScratch.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.fieldEffectorBuffer, 0, this.fieldEffectorScratch);

    this.colliderBuffer = this.device.createBuffer({
      label: 'particle_colliders',
      size: this.colliderScratch.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.colliderBuffer, 0, this.colliderScratch);

    this.renderUniformBuffer = this.device.createBuffer({
      label: 'render_uniforms',
      size: this.renderUniformScratch.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    for (let i = 0; i < MAX_RENDER_BATCHES; i++) {
      this.meshUniformBuffers.push(this.device.createBuffer({
        label: `mesh_render_uniforms_${i}`,
        size: this.renderUniformScratch.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }));
    }

    this.sampler = this.device.createSampler({
      label: 'particle_sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.spriteFrameLut = makeDefaultFrameLut(this.device);

    this.compile();
    this.buildCompactPipeline();
    this.buildRenderPipeline();
    // Bake & upload sprite anim frame LUT if the module is already in the system
    // (e.g. restored from persistence).
    this.applyRendererConfig();
  }

  /** Rebuild compute pipelines from current module set. Call on module add/remove/toggle. */
  compile(): void {
    const manifests = this.system.modules
      .filter((m) => m.enabled)
      .map((m) => m.build());

    const emitShader = buildComputeShader({ kind: 'emit', modules: manifests });
    const simShader = buildComputeShader({ kind: 'simulate', modules: manifests });

    // Destroy old pipeline GPU resources before overwriting — otherwise each
    // recompile leaks one uniform buffer + N LUT textures.
    this.disposePipeline(this.emit);
    this.disposePipeline(this.simulate);
    this.emit = this.makePipeline(emitShader);
    this.simulate = this.makePipeline(simShader);

    // Debug stash for devtools / verify scripts — opt-in via window flag.
    if ((globalThis as { __PARTICLES_DEBUG__?: boolean }).__PARTICLES_DEBUG__) {
      (globalThis as Record<string, unknown>).__particles_wgsl = {
        emit: emitShader.code,
        simulate: simShader.code,
      };
    }

    // Module set may now include / exclude Renderer or SpriteAnimation —
    // re-pick texture and re-upload sprite frame LUT accordingly.
    if (this.renderLayout) this.applyRendererConfig();
  }

  /** Called by editor when a uniform value changes — patches the GPU buffer in-place. */
  patchUniform(moduleId: string, name: string, value: number | readonly number[]): void {
    for (const pipe of [this.emit, this.simulate]) {
      if (!pipe) continue;
      const key = `${moduleId}__${name}`;
      const offset = pipe.shader.uniformOffsets.get(key);
      if (offset === undefined) continue;
      const desc = pipe.shader.uniforms.find((u) => u.name === key)!;
      writeUniform(pipe.uniformView, pipe.uniformViewU32, offset, desc.type, value);
      this.device.queue.writeBuffer(
        pipe.uniformBuffer,
        offset,
        pipe.uniformView.buffer,
        pipe.uniformView.byteOffset + offset,
        typeBytes(desc.type),
      );
    }
  }

  /** Replace a LUT texture's contents (curve/gradient edited). */
  patchLUT(moduleId: string, name: string, data: Float32Array | Uint8Array): void {
    for (const pipe of [this.emit, this.simulate]) {
      if (!pipe) continue;
      const key = `${moduleId}__${name}`;
      const idx = pipe.shader.luts.findIndex((l) => l.name === key);
      if (idx < 0) continue;
      const desc = pipe.shader.luts[idx]!;
      const tex = pipe.lutTextures[idx]!;
      this.writeLUT(tex, desc, data);
    }
  }

  /** Update the emit-time transform (caller-supplied each frame from view.matrixWorld). */
  setEmitTransform(xform: Float32Array): void {
    this.emitXform = xform;
  }

  setFieldEffectors(effectors: readonly GpuFieldEffector[]): void {
    this.fieldEffectorScratch.fill(0);
    const count = Math.min(MAX_FIELD_EFFECTORS, effectors.length);
    this.fieldEffectorScratch[0] = count;
    for (let i = 0; i < count; i++) {
      const effector = effectors[i]!;
      const base = 4 + i * 24;
      this.fieldEffectorScratch[base] = fieldEffectorTypeCode(effector.type);
      this.fieldEffectorScratch[base + 1] = fieldEffectorShapeCode(effector.shape);
      this.fieldEffectorScratch[base + 2] = effector.strength;
      this.fieldEffectorScratch[base + 3] = fieldEffectorFalloffCode(effector.falloff);
      this.fieldEffectorScratch[base + 4] = effector.position[0];
      this.fieldEffectorScratch[base + 5] = effector.position[1];
      this.fieldEffectorScratch[base + 6] = effector.position[2];
      this.fieldEffectorScratch[base + 7] = effector.radius;
      this.fieldEffectorScratch[base + 8] = effector.direction[0];
      this.fieldEffectorScratch[base + 9] = effector.direction[1];
      this.fieldEffectorScratch[base + 10] = effector.direction[2];
      this.fieldEffectorScratch[base + 11] = fieldVortexModeCode(effector.vortexMode ?? 'free');
      this.fieldEffectorScratch[base + 12] = effector.size[0];
      this.fieldEffectorScratch[base + 13] = effector.size[1];
      this.fieldEffectorScratch[base + 14] = effector.size[2];
      this.fieldEffectorScratch[base + 15] = effector.randomStrength ?? 0;
      this.fieldEffectorScratch[base + 16] = effector.vortexPull ?? 0;
      this.fieldEffectorScratch[base + 17] = effector.vortexOrbitRadius ?? 1;
      this.fieldEffectorScratch[base + 18] = effector.randomPosition ?? 0;
      this.fieldEffectorScratch[base + 19] = effector.randomDirection ?? 0;
      this.fieldEffectorScratch[base + 20] = effector.type === 'turbulence'
        ? effector.turbulenceDetail ?? 1 : effector.vortexLift ?? 0;
      this.fieldEffectorScratch[base + 21] = effector.type === 'turbulence'
        ? effector.turbulenceScale ?? 10 : effector.vortexAxialDamping ?? 0;
      this.fieldEffectorScratch[base + 22] = effector.type === 'turbulence'
        ? effector.turbulenceScaleRandom ?? 0.3 : effector.vortexLiftVariation ?? 0;
    }
    this.device.queue.writeBuffer(this.fieldEffectorBuffer, 0, this.fieldEffectorScratch);
  }

  setParticleColliders(colliders: readonly GpuParticleCollider[]): void {
    this.colliderScratch.fill(0);
    const count = Math.min(MAX_PARTICLE_COLLIDERS, colliders.length);
    this.colliderScratch[0] = count;
    for (let i = 0; i < count; i++) {
      const collider = colliders[i]!;
      const base = 4 + i * 24;
      this.colliderScratch[base] = particleColliderTypeCode(collider.type);
      this.colliderScratch[base + 1] = collider.bounce;
      this.colliderScratch[base + 2] = collider.friction;
      this.colliderScratch[base + 3] = collider.stickiness;
      this.colliderScratch[base + 4] = collider.position[0];
      this.colliderScratch[base + 5] = collider.position[1];
      this.colliderScratch[base + 6] = collider.position[2];
      this.colliderScratch[base + 7] = collider.radius;
      this.colliderScratch[base + 8] = collider.axisX[0];
      this.colliderScratch[base + 9] = collider.axisX[1];
      this.colliderScratch[base + 10] = collider.axisX[2];
      this.colliderScratch[base + 11] = collider.settleSpeed;
      this.colliderScratch[base + 12] = collider.axisY[0];
      this.colliderScratch[base + 13] = collider.axisY[1];
      this.colliderScratch[base + 14] = collider.axisY[2];
      this.colliderScratch[base + 15] = 0;
      this.colliderScratch[base + 16] = collider.axisZ[0];
      this.colliderScratch[base + 17] = collider.axisZ[1];
      this.colliderScratch[base + 18] = collider.axisZ[2];
      this.colliderScratch[base + 19] = 0;
      this.colliderScratch[base + 20] = collider.size[0];
      this.colliderScratch[base + 21] = collider.size[1];
      this.colliderScratch[base + 22] = collider.size[2];
      this.colliderScratch[base + 23] = 0;
    }
    this.device.queue.writeBuffer(this.colliderBuffer, 0, this.colliderScratch);
  }

  /**
   * True iff the system is non-looping and the simulation time has reached its
   * duration. Inspector uses this to auto-restart one-shot systems when the
   * user edits a value — otherwise their changes are invisible because the
   * emitter stopped long ago.
   */
  get hasFinished(): boolean {
    const cfg = this.system.config;
    return !cfg.looping && cfg.duration > 0 && this.time >= cfg.duration;
  }

  /** Wipe all live particles and reset simulation time. */
  reset(encoder?: GPUCommandEncoder): void {
    const sz = PARTICLE_STRIDE * this.system.config.capacity;
    if (encoder) {
      encoder.clearBuffer(this.particleBuffer, 0, sz);
      encoder.clearBuffer(this.eventBuffer, 0, 4);
      this.eventQueueResetPending = false;
    } else {
      const enc = this.device.createCommandEncoder({ label: 'particles_reset' });
      enc.clearBuffer(this.particleBuffer, 0, sz);
      enc.clearBuffer(this.eventBuffer, 0, 4);
      this.device.queue.submit([enc.finish()]);
      this.eventQueueResetPending = false;
    }
    this.time = 0;
    this.emitCursor = 0;
    this.emitAccumulator = 0;
    this.indirectScratch.fill(0);
    this.writeIndirectArgs(this.indirectScratch);
  }

  /** Tick simulation. */
  update(dt: number, encoder: GPUCommandEncoder, opts: BackendUpdateOptions = {}): void {
    if (this.playState === 'stopped') {
      // Caller is expected to have already called reset() on the transition; nothing to dispatch.
      return;
    }
    if (this.playState === 'paused') {
      // Freeze time and skip both emit and simulate. Render still draws what's there.
      this.compactVisibleParticles(encoder);
      return;
    }

    const cfg = this.system.config;
    const duration = opts.duration ?? cfg.duration;
    const looping = opts.looping ?? cfg.looping;
    const eventFlags = opts.eventFlags ?? 0;
    const dtScaled = dt * cfg.timeScale;
    this.time += dtScaled;
    if (this.eventQueueResetPending) {
      encoder.clearBuffer(this.eventBuffer, 0, 4);
      this.eventQueueResetPending = false;
    }

    // Looping behavior. Wrap time inside the loop window so the emission module's
    // burst-fire tracker (which detects wraparound via time < lastTime) re-arms.
    // Non-looping systems stop emitting once they pass duration but still simulate
    // the particles that are already alive.
    let emitting = opts.allowEmit !== false;
    if (duration > 0 && this.time >= duration) {
      if (looping) {
        this.time %= duration;
      } else {
        this.time = duration;
        emitting = false;
      }
    }

    // Determine how many particles to emit this frame.
    const emitRate = emitting ? (this.readScalar('emission', 'rate') ?? 0) : 0;
    const bursts = emitting ? this.consumeBursts() : 0;
    this.emitAccumulator += emitRate * dtScaled;
    let emitCount = Math.floor(this.emitAccumulator) + bursts;
    this.emitAccumulator -= Math.floor(this.emitAccumulator);
    if (emitCount > cfg.capacity) emitCount = cfg.capacity;

    // Write globals — mat4 first, then scalars.
    this.globalF32.set(this.emitXform, GLOBALS_MAT_OFFSET_F32);
    this.globalF32[GLOBALS_TIME_OFFSET_F32] = this.time;
    this.globalF32[GLOBALS_DT_OFFSET_F32] = dtScaled;
    this.globalU32[GLOBALS_CAPACITY_OFFSET_U32] = cfg.capacity;
    this.globalU32[GLOBALS_EMITCURSOR_OFFSET_U32] = this.emitCursor;
    this.globalU32[GLOBALS_EMITCOUNT_OFFSET_U32] = emitCount;
    this.globalU32[GLOBALS_SEED_OFFSET_U32] = cfg.seed;
    this.globalU32[GLOBALS_EVENT_FLAGS_OFFSET_U32] = eventFlags;
    this.globalU32[GLOBALS_EVENT_CAPACITY_OFFSET_U32] = MAX_PARTICLE_EVENTS;
    this.device.queue.writeBuffer(this.globalBuffer, 0, this.globalScratch);

    const meshShape = this.findMeshShape();
    if (emitCount > 0 && meshShape?.config.mesh) {
      this.injectMeshShapeParticles(meshShape, emitCount);
    } else if (emitCount > 0 && this.emit) {
      const pass = encoder.beginComputePass({ label: 'emit' });
      pass.setPipeline(this.emit.pipeline);
      pass.setBindGroup(0, this.emit.bindGroup);
      pass.dispatchWorkgroups(Math.ceil(emitCount / 64));
      pass.end();
      this.emitCursor = (this.emitCursor + emitCount) % cfg.capacity;
    }

    if (this.simulate) {
      const pass = encoder.beginComputePass({ label: 'simulate' });
      pass.setPipeline(this.simulate.pipeline);
      pass.setBindGroup(0, this.simulate.bindGroup);
      pass.dispatchWorkgroups(Math.ceil(cfg.capacity / 64));
      pass.end();
    }

    this.compactVisibleParticles(encoder);
  }

  async readParticleEvents(): Promise<GpuParticleEvent[]> {
    const readback = this.device.createBuffer({
      label: 'particle_event_readback',
      size: EVENT_QUEUE_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder({ label: 'particle_event_copy' });
    encoder.copyBufferToBuffer(this.eventBuffer, 0, readback, 0, EVENT_QUEUE_BYTES);
    this.device.queue.submit([encoder.finish()]);
    this.eventQueueResetPending = true;
    await readback.mapAsync(GPUMapMode.READ);
    const range = readback.getMappedRange();
    const u32 = new Uint32Array(range);
    const f32 = new Float32Array(range);
    const count = Math.min(u32[0] ?? 0, MAX_PARTICLE_EVENTS);
    const events: GpuParticleEvent[] = [];
    for (let i = 0; i < count; i++) {
      const baseBytes = EVENT_QUEUE_HEADER_BYTES + i * EVENT_RECORD_BYTES;
      const baseU32 = baseBytes / 4;
      const kind = u32[baseU32] ?? 0;
      const type = eventTypeFromCode(kind);
      if (!type) continue;
      events.push({
        type,
        slot: u32[baseU32 + 1] ?? 0,
        colliderIndex: u32[baseU32 + 2] ?? 0xffffffff,
        generation: u32[baseU32 + 3] ?? 0,
        speed: f32[baseU32 + 15] ?? 0,
        position: [f32[baseU32 + 4] ?? 0, f32[baseU32 + 5] ?? 0, f32[baseU32 + 6] ?? 0],
        velocity: [f32[baseU32 + 8] ?? 0, f32[baseU32 + 9] ?? 0, f32[baseU32 + 10] ?? 0],
        normal: [f32[baseU32 + 12] ?? 0, f32[baseU32 + 13] ?? 1, f32[baseU32 + 14] ?? 0],
      });
    }
    readback.unmap();
    readback.destroy();
    return events;
  }

  injectParticles(spawns: CpuParticleSpawn[]): number {
    const total = spawns.reduce((sum, spawn) => sum + Math.max(0, Math.floor(spawn.count)), 0);
    if (total <= 0) return 0;

    const capacity = this.system.config.capacity;
    const count = Math.min(total, capacity);
    const strideF32 = PARTICLE_STRIDE / 4;
    const floats = new Float32Array(count * strideF32);
    const bits = new Uint32Array(floats.buffer);
    const main = this.findMainConfig();
    let written = 0;

    for (const spawn of spawns) {
      const spawnCount = Math.max(0, Math.floor(spawn.count));
      for (let i = 0; i < spawnCount && written < count; i++) {
        const base = written * strideF32;
        const seed = hashU32((this.system.config.seed ^ (this.emitCursor + written) ^ (i * 0x9e3779b9)) >>> 0);
        const r0 = random01(seed);
        const r1 = random01(hashU32(seed ^ 0x68bc21eb));
        const r2 = random01(hashU32(seed ^ 0x02e5be93));
        const r3 = random01(hashU32(seed ^ 0x7f4a7c15));
        const life = main?.infiniteLifetime ? 1e20 : sampleCurve(main?.startLifetime, 0, r0, 1);
        const speed = sampleCurve(main?.startSpeed, 0, r1, 0);
        const size = sampleCurve(main?.startSize, 0, r2, 1);
        const rotation = sampleCurve(main?.startRotation, 0, r3, 0);
        const color = sampleGradient(main?.startColor, 0, random01(hashU32(seed ^ 0x1b873593)));
        const dir = directionForSpawn(spawn, seed);
        floats[base] = spawn.position[0];
        floats[base + 1] = spawn.position[1];
        floats[base + 2] = spawn.position[2];
        floats[base + 3] = Math.max(0.001, life);
        floats[base + 4] = dir[0] * speed + spawn.velocity[0] * spawn.inheritVelocity;
        floats[base + 5] = dir[1] * speed + spawn.velocity[1] * spawn.inheritVelocity;
        floats[base + 6] = dir[2] * speed + spawn.velocity[2] * spawn.inheritVelocity;
        floats[base + 7] = 0;
        floats[base + 8] = color[0];
        floats[base + 9] = color[1];
        floats[base + 10] = color[2];
        floats[base + 11] = color[3];
        floats[base + 12] = Math.max(0, size);
        floats[base + 13] = Math.max(0, size);
        floats[base + 14] = rotation;
        bits[base + 15] = packSeedGeneration(seed, spawn.generation ?? 0);
        floats[base + 16] = color[0];
        floats[base + 17] = color[1];
        floats[base + 18] = color[2];
        floats[base + 19] = color[3];
        written++;
      }
    }

    this.writeParticlesAtCursor(floats, written);
    return written;
  }

  killParticleSlots(slots: Iterable<number>): void {
    const zero = new Float32Array([0]);
    const capacity = this.system.config.capacity;
    for (const slot of slots) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= capacity) continue;
      this.device.queue.writeBuffer(this.particleBuffer, slot * PARTICLE_STRIDE + 12, zero);
    }
  }

  /**
   * Match render pipelines to the attachment state of the pass particles are
   * about to draw into. Cheap when nothing changed; rebuilds both sprite and
   * mesh pipelines when the host pass layout differs (MRT count, formats,
   * depth format, or sample count).
   */
  setPassTargetState(state: PassTargetState): void {
    const colorFormat = state.colorFormats[0] ?? this.colorFormat;
    const extraCount = Math.max(0, state.colorFormats.length - 1);
    const sampleCount = state.sampleCount ?? 1;
    let extrasChanged = extraCount !== this.extraColorFormats.length;
    for (let index = 0; !extrasChanged && index < extraCount; index++) {
      if (state.colorFormats[index + 1] !== this.extraColorFormats[index]) extrasChanged = true;
    }
    if (
      colorFormat === this.colorFormat &&
      state.depthFormat === this.depthFormat &&
      sampleCount === this.sampleCount &&
      !extrasChanged
    ) {
      return;
    }
    this.colorFormat = colorFormat;
    this.extraColorFormats.length = extraCount;
    for (let index = 0; index < extraCount; index++) {
      this.extraColorFormats[index] = state.colorFormats[index + 1]!;
    }
    this.depthFormat = state.depthFormat;
    this.sampleCount = sampleCount;
    this.buildRenderPipeline();
  }

  /** Render particles into the given render pass. Caller manages pass begin/end and clears. */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    model: Float32Array,
    cameraRight: readonly [number, number, number],
    cameraUp: readonly [number, number, number],
  ): void {
    if (!this.renderPipeline || !this.renderBindGroup) return;
    const renderer = this.findRenderer();
    const material = this.findMaterial();
    const sprite = this.findSpriteAnim();

    // If material/depth mode was changed externally, rebuild pipeline.
    const wantBlend = effectiveBlend(renderer, material);
    const wantDepthTest = material?.config.depthTest ?? renderer?.config.depthTest ?? true;
    const wantDepthWrite = material?.config.depthWrite ?? renderer?.config.depthWrite ?? false;
    const wantMeshCullMode = cullModeForMeshFaceSide(renderer, material);
    if (wantBlend !== this.currentBlend
        || wantDepthTest !== this.currentDepthTest
        || wantDepthWrite !== this.currentDepthWrite
        || wantMeshCullMode !== this.currentMeshCullMode) {
      this.currentBlend = wantBlend;
      this.currentDepthTest = wantDepthTest;
      this.currentDepthWrite = wantDepthWrite;
      this.currentMeshCullMode = wantMeshCullMode;
      this.buildRenderPipeline();
    }

    const tint = material?.config.tint ?? renderer?.config.tint ?? WHITE_TINT;
    const cols = sprite?.config.cols ?? 1;
    const rows = sprite?.config.rows ?? 1;
    const cycles = sprite?.config.cycles ?? 1;
    const spriteOn = sprite && sprite.enabled ? 1 : 0;

    const s = this.renderUniformScratch;
    writeRenderUniforms(
      s,
      renderer,
      viewProj,
      model,
      cameraRight,
      cameraUp,
      tint,
      cols,
      rows,
      cycles,
      spriteOn,
      material,
      this.system.config.capacity,
      sprite,
    );
    this.device.queue.writeBuffer(this.renderUniformBuffer, 0, s);

    if (renderer?.config.renderMode === 'mesh') {
      this.renderMesh(pass, renderer, material);
      return;
    }

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    pass.drawIndirect(this.indirectBuffer, 0);
  }

  /**
   * Reconfigure render-time state from the Renderer / SpriteAnimation modules.
   * Cheap — swaps the bind group; also bakes & uploads the sprite frame LUT
   * if SpriteAnimation is present, so frames cycle as soon as it's added.
   * Blend mode changes are picked up on the next render() call.
   */
  applyRendererConfig(): void {
    const sprite = this.findSpriteAnim();
    if (sprite && sprite.enabled) {
      const lut = bakeCurveLUT(sprite.config.frameOverLifetime);
      this.spriteFrameLut.destroy();
      this.spriteFrameLut = uploadCurveFrameLut(this.device, lut, 256);
    }
    this.rebuildRenderBindGroup();
    // Decoding may finish asynchronously, but GPU upload remains staged until
    // commitPendingGpuResources() runs on the host's admitted device lane.
    this.customTextures.stage(this.customTextureSources());
  }

  /** Commit decoded custom textures from the host's admitted device-work lane. */
  commitPendingGpuResources(): void {
    if (this.customTextures.commit(this.device)) this.rebuildRenderBindGroup();
  }

  private customTextureSources(): string[] {
    const renderer = this.findRenderer();
    const sprite = this.findSpriteAnim();
    const sources: string[] = [];
    if (renderer?.config.customTexture) sources.push(renderer.config.customTexture);
    const material = this.findMaterial();
    if (material?.config.baseMap) sources.push(material.config.baseMap);
    const meshSlots = renderer?.config.meshSlots ?? [];
    for (let index = 0; index < Math.min(meshSlots.length, MAX_RENDER_BATCHES); index++) {
      const texture = meshSlots[index]?.texture;
      if (texture) sources.push(texture);
    }
    if (sprite?.config.customAtlas) sources.push(sprite.config.customAtlas);
    return sources;
  }

  /** Upload a new sprite-animation frame curve LUT. Pass the result of `bakeCurveLUT`. */
  setSpriteFrameLut(data: Float32Array, width = 256): void {
    this.spriteFrameLut.destroy();
    this.spriteFrameLut = uploadCurveFrameLut(this.device, data, width);
    this.rebuildRenderBindGroup();
  }

  destroy(): void {
    this.particleBuffer.destroy();
    this.globalBuffer.destroy();
    this.renderUniformBuffer.destroy();
    for (const buffer of this.meshUniformBuffers) buffer.destroy();
    this.visibleIndexBuffer.destroy();
    this.indirectBuffer.destroy();
    this.compactParamsBuffer.destroy();
    this.eventBuffer.destroy();
    this.fieldEffectorBuffer.destroy();
    this.colliderBuffer.destroy();
    this.disposePipeline(this.emit);
    this.disposePipeline(this.simulate);
    this.emit = null;
    this.simulate = null;
    this.spriteFrameLut.destroy();
    for (const tex of this.textureCache.values()) tex.destroy();
    this.textureCache.clear();
    this.customTextures.dispose();
    for (const mesh of this.meshCache.values()) {
      mesh.vertexBuffer.destroy();
      mesh.indexBuffer.destroy();
    }
    this.meshCache.clear();
  }

  // --- internals ----------------------------------------------------------

  private buildCompactPipeline(): void {
    const module = this.device.createShaderModule({ label: 'particle_compact', code: COMPACT_WGSL });
    const layout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    this.compactBindGroup = this.device.createBindGroup({
      label: 'particle_compact_bg',
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.visibleIndexBuffer } },
        { binding: 2, resource: { buffer: this.indirectBuffer } },
        { binding: 3, resource: { buffer: this.compactParamsBuffer } },
      ],
    });
    this.compactPipeline = this.device.createComputePipeline({
      label: 'particle_compact',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: 'main' },
    });
  }

  private compactVisibleParticles(encoder: GPUCommandEncoder): void {
    if (!this.compactPipeline || !this.compactBindGroup) return;
    const renderer = this.findRenderer();
    if (renderer?.config.renderMode === 'none') {
      this.indirectScratch.fill(0);
      this.writeIndirectArgs(this.indirectScratch);
      return;
    }

    const isMesh = renderer?.config.renderMode === 'mesh';
    if (isMesh && renderer) this.meshFrame.update(renderer.config);
    const batchCount = isMesh ? this.meshFrame.slots.length : 1;
    const indirect = this.indirectScratch;
    indirect.fill(0);
    if (isMesh && renderer) {
      for (let i = 0; i < batchCount; i++) {
        const mesh = this.getMesh(this.meshFrame.slots[i]!, renderer);
        const base = i * INDIRECT_ARGS_U32_STRIDE;
        indirect[base] = mesh.indexCount;
      }
    } else {
      indirect[0] = 4;
      indirect[1] = 0;
      indirect[2] = 0;
      indirect[3] = 0;
    }
    this.writeIndirectArgs(indirect);

    this.compactU32[0] = this.system.config.capacity;
    this.compactU32[1] = isMesh ? 1 : 0;
    this.compactU32[2] = batchCount;
    this.compactU32[3] = isMesh && renderer
      ? distributionCode(renderer.config.meshDistribution ?? 'single')
      : 0;
    this.compactF32[4] = isMesh ? this.meshFrame.weights[0]! : 1;
    this.compactF32[5] = isMesh ? this.meshFrame.weights[1]! : 0;
    this.compactF32[6] = isMesh ? this.meshFrame.weights[2]! : 0;
    this.compactF32[7] = isMesh ? this.meshFrame.weights[3]! : 0;
    this.device.queue.writeBuffer(this.compactParamsBuffer, 0, this.compactScratch);

    const pass = encoder.beginComputePass({ label: 'compact_particles' });
    pass.setPipeline(this.compactPipeline);
    pass.setBindGroup(0, this.compactBindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.system.config.capacity / 64));
    pass.end();
  }

  private writeIndirectArgs(indirect: Uint32Array): void {
    this.device.queue.writeBuffer(
      this.indirectBuffer,
      0,
      indirect.buffer as ArrayBuffer,
      indirect.byteOffset,
      indirect.byteLength,
    );
  }

  private makePipeline(shader: CompositeShader): CompiledPipeline {
    const module = this.device.createShaderModule({
      label: 'particle_compute',
      code: shader.code,
    });

    const uniformBuffer = this.device.createBuffer({
      label: 'module_uniforms',
      size: Math.max(16, shader.uniformBufferSize),
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformView = new Float32Array(shader.uniformBufferSize / 4);
    const uniformViewU32 = new Uint32Array(uniformView.buffer);
    for (const u of shader.uniforms) {
      const offset = shader.uniformOffsets.get(u.name)!;
      writeUniform(uniformView, uniformViewU32, offset, u.type, u.value);
    }
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformView);

    const lutTextures: GPUTexture[] = shader.luts.map((l) => this.createLUT(l));

    const entries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ];
    shader.luts.forEach((_, i) => {
      entries.push({
        binding: LUT_BIND_BASE + i,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'unfilterable-float', viewDimension: '2d' },
      });
    });

    const layout = this.device.createBindGroupLayout({ entries });
    const pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: 'main' },
    });

    const bgEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.particleBuffer } },
      { binding: 1, resource: { buffer: this.globalBuffer } },
      { binding: 2, resource: { buffer: uniformBuffer } },
      { binding: 3, resource: { buffer: this.fieldEffectorBuffer } },
      { binding: 4, resource: { buffer: this.colliderBuffer } },
      { binding: 5, resource: { buffer: this.eventBuffer } },
    ];
    lutTextures.forEach((tex, i) => {
      bgEntries.push({ binding: LUT_BIND_BASE + i, resource: tex.createView() });
    });
    const bindGroup = this.device.createBindGroup({ layout, entries: bgEntries });

    return { shader, pipeline, bindGroup, uniformBuffer, uniformView, uniformViewU32, lutTextures };
  }

  private buildRenderPipeline(): void {
    const module = this.device.createShaderModule({ label: 'particle_render', code: RENDER_WGSL });

    const layout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '2d' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.VERTEX,
          texture: { sampleType: 'unfilterable-float', viewDimension: '2d' },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });
    this.renderLayout = layout;
    this.rebuildRenderBindGroup();

    this.renderPipeline = this.device.createRenderPipeline({
      label: 'particle_render',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [
          { format: this.colorFormat, blend: blendFor(this.currentBlend) },
          ...this.extraColorFormats.map((format) => ({ format, writeMask: 0 })),
        ],
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: undefined,
        cullMode: 'none',
      },
      depthStencil: this.depthFormat
        ? {
            format: this.depthFormat,
            depthWriteEnabled: this.currentDepthWrite,
            depthCompare: this.currentDepthTest ? 'less' : 'always',
          }
        : undefined,
      multisample: { count: this.sampleCount },
    });
    this.buildMeshRenderPipeline();
  }

  private buildMeshRenderPipeline(): void {
    const module = this.device.createShaderModule({ label: 'particle_mesh_render', code: MESH_RENDER_WGSL });
    const layout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '2d' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });
    this.meshLayout = layout;
    this.meshBindGroups.fill(null);
    this.meshBindGroupTextures.fill(null);

    this.meshPipeline = this.device.createRenderPipeline({
      label: 'particle_mesh_render',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: {
        module,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 32,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [
          { format: this.colorFormat, blend: blendFor(this.currentBlend) },
          ...this.extraColorFormats.map((format) => ({ format, writeMask: 0 })),
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: this.currentMeshCullMode },
      depthStencil: this.depthFormat
        ? {
            format: this.depthFormat,
            depthWriteEnabled: this.currentDepthWrite,
            depthCompare: this.currentDepthTest ? 'less' : 'always',
          }
        : undefined,
      multisample: { count: this.sampleCount },
    });
  }

  private rebuildRenderBindGroup(): void {
    if (!this.renderLayout) return;
    const tex = this.currentParticleTexture();
    this.renderBindGroup = this.device.createBindGroup({
      label: 'particle_render_bg',
      layout: this.renderLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: this.renderUniformBuffer } },
        { binding: 2, resource: tex.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: this.spriteFrameLut.createView() },
        { binding: 5, resource: { buffer: this.visibleIndexBuffer } },
      ],
    });
  }

  private makeMeshBindGroup(
    tex: GPUTexture,
    uniformBuffer: GPUBuffer = this.renderUniformBuffer,
  ): GPUBindGroup {
    if (!this.meshLayout) throw new Error('Mesh render layout has not been built.');
    return this.device.createBindGroup({
      label: 'particle_mesh_render_bg',
      layout: this.meshLayout,
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffer } },
        { binding: 1, resource: { buffer: uniformBuffer } },
        { binding: 2, resource: tex.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: { buffer: this.visibleIndexBuffer } },
      ],
    });
  }

  private renderMesh(
    pass: GPURenderPassEncoder,
    renderer: RendererModuleLike,
    material: MaterialModuleLike | undefined,
  ): void {
    if (!this.meshPipeline || !this.meshLayout) return;
    this.meshFrame.update(renderer.config);
    const slots = this.meshFrame.slots;
    pass.setPipeline(this.meshPipeline);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      this.writeMeshBatchUniform(
        i,
        slots.length,
        renderer.config.meshDistribution ?? 'single',
        this.meshFrame.weights,
        this.meshFrame.totalWeight,
      );
      const uniformBuffer = this.meshUniformBuffers[i]!;
      this.device.queue.writeBuffer(
        uniformBuffer,
        0,
        this.renderUniformScratch.buffer as ArrayBuffer,
        this.renderUniformScratch.byteOffset,
        this.renderUniformScratch.byteLength,
      );
      const mesh = this.getMesh(slot, renderer);
      const tex = this.textureForUrl(slot.texture ?? material?.config.baseMap);
      if (!this.meshBindGroups[i] || this.meshBindGroupTextures[i] !== tex) {
        this.meshBindGroups[i] = this.makeMeshBindGroup(tex, uniformBuffer);
        this.meshBindGroupTextures[i] = tex;
      }
      pass.setBindGroup(0, this.meshBindGroups[i]!);
      pass.setVertexBuffer(0, mesh.vertexBuffer);
      pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
      pass.drawIndexedIndirect(this.indirectBuffer, i * INDIRECT_ARGS_BYTES_STRIDE);
    }
  }

  private writeMeshBatchUniform(
    index: number,
    count: number,
    distribution: MeshDistribution,
    weights: ArrayLike<number>,
    totalWeight: number,
  ): void {
    const s = this.renderUniformScratch;
    s[64] = index;
    s[65] = count;
    s[66] = distributionCode(distribution);
    s[67] = totalWeight;
    s[68] = weights[0] ?? 1;
    s[69] = weights[1] ?? 0;
    s[70] = weights[2] ?? 0;
    s[71] = weights[3] ?? 0;
  }

  /**
   * Resolve the current particle texture. Custom uploaded images win over
   * built-ins; sprite animation overrides the renderer's choice unless the
   * sprite module has its own custom atlas. Falls back to whatever's cached
   * (or the default circle) while decode waits for an admitted custom upload.
   */
  private currentParticleTexture(): GPUTexture {
    const renderer = this.findRenderer();
    const material = this.findMaterial();
    const sprite = this.findSpriteAnim();

    if (sprite && sprite.enabled) {
      if (sprite.config.customAtlas) {
        const cached = this.customTextures.get(sprite.config.customAtlas);
        if (cached) return cached;
        // Fall through to the procedural atlas as a placeholder.
      }
      const key = `__atlas_${sprite.config.cols}x${sprite.config.rows}` as BuiltinTextureName;
      const cached = this.textureCache.get(key);
      if (cached) return cached;
      const tex = generateAtlasTexture(this.device, sprite.config.cols, sprite.config.rows);
      this.textureCache.set(key, tex);
      return tex;
    }

    const custom = this.textureForUrl(material?.config.baseMap ?? renderer?.config.customTexture);
    if (custom) return custom;
    const name = renderer?.config.texture ?? 'circle';
    const cached = this.textureCache.get(name);
    if (cached) return cached;
    const tex = generateBuiltinTexture(this.device, name);
    this.textureCache.set(name, tex);
    return tex;
  }

  private textureForUrl(url: string | undefined): GPUTexture {
    if (url) {
      const cached = this.customTextures.get(url);
      if (cached) return cached;
    }
    const renderer = this.findRenderer();
    const name = renderer?.config.texture ?? 'circle';
    const cached = this.textureCache.get(name);
    if (cached) return cached;
    const tex = generateBuiltinTexture(this.device, name);
    this.textureCache.set(name, tex);
    return tex;
  }

  private findRenderer(): RendererModuleLike | undefined {
    return this.findModule('renderer') as RendererModuleLike | undefined;
  }

  private findMaterial(): MaterialModuleLike | undefined {
    return this.findModule('material') as MaterialModuleLike | undefined;
  }

  private findSpriteAnim(): SpriteAnimModuleLike | undefined {
    return this.findModule('spriteAnim') as SpriteAnimModuleLike | undefined;
  }

  private findModule(id: string): Module | undefined {
    for (const module of this.system.modules) {
      if (module.id === id) return module;
    }
    return undefined;
  }

  private getMesh(slot: MeshSlotLike, renderer: RendererModuleLike): MeshResource {
    const custom = slot.asset ?? renderer.config.customMesh;
    const hasCustom = !!custom && custom.vertices.length > 0 && custom.indices.length > 0;
    const key = hasCustom
      ? `custom:${custom.name}:${custom.vertices.length}:${custom.indices.length}`
      : `builtin:${slot.builtin ?? renderer.config.mesh ?? 'cube'}`;
    const cached = this.meshCache.get(key);
    if (cached) return cached;
    const data = hasCustom
      ? {
          vertices: new Float32Array(custom!.vertices),
          indices: new Uint16Array(custom!.indices),
        }
      : builtinMeshData(slot.builtin ?? renderer.config.mesh ?? 'cube');
    const vertexBuffer = this.device.createBuffer({
      label: `particle_mesh_${key}_vertices`,
      size: data.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      vertexBuffer,
      0,
      data.vertices.buffer as ArrayBuffer,
      data.vertices.byteOffset,
      data.vertices.byteLength,
    );
    const indexBuffer = this.device.createBuffer({
      label: `particle_mesh_${key}_indices`,
      size: data.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      indexBuffer,
      0,
      data.indices.buffer as ArrayBuffer,
      data.indices.byteOffset,
      data.indices.byteLength,
    );
    const mesh = { key, vertexBuffer, indexBuffer, indexCount: data.indices.length };
    this.meshCache.set(key, mesh);
    return mesh;
  }

  private createLUT(desc: LUTDescriptor): GPUTexture {
    const tex = this.device.createTexture({
      label: `lut_${desc.name}`,
      size: { width: desc.width, height: desc.height },
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.writeLUT(tex, desc, desc.data);
    return tex;
  }

  private writeLUT(tex: GPUTexture, desc: LUTDescriptor, data: Float32Array | Uint8Array): void {
    // Upload as rgba32float regardless of source format. For curves the pair is in r,g; b,a are 0.
    const pixels = new Float32Array(desc.width * desc.height * 4);
    if (desc.kind === 'curve') {
      const src = data as Float32Array;
      for (let i = 0; i < desc.width; i++) {
        pixels[i * 4 + 0] = src[i * 2 + 0]!;
        pixels[i * 4 + 1] = src[i * 2 + 1]!;
      }
    } else {
      const src = data as Uint8Array;
      for (let i = 0; i < src.length; i++) pixels[i] = src[i]! / 255;
    }
    this.device.queue.writeTexture(
      { texture: tex },
      pixels,
      { bytesPerRow: desc.width * 16, rowsPerImage: desc.height },
      { width: desc.width, height: desc.height },
    );
  }

  private disposePipeline(p: CompiledPipeline | null): void {
    if (!p) return;
    p.uniformBuffer.destroy();
    for (const t of p.lutTextures) t.destroy();
  }

  /** Look up a scalar uniform from a module without rebuilding the pipeline. */
  private readScalar(moduleId: string, name: string): number | null {
    if (!this.emit) return null;
    const desc = this.emit.shader.uniforms.find((u) => u.name === `${moduleId}__${name}`);
    if (!desc) return null;
    const offset = this.emit.shader.uniformOffsets.get(desc.name)!;
    return this.emit.uniformView[offset / 4]!;
  }

  private consumeBursts(): number {
    const emission = this.findModule('emission') as
      | (Module & { consumeBursts?: (t: number) => number })
      | undefined;
    if (!emission || typeof emission.consumeBursts !== 'function') return 0;
    return emission.consumeBursts(this.time);
  }

  private writeParticlesAtCursor(floats: Float32Array, count: number): void {
    if (count <= 0) return;
    const capacity = this.system.config.capacity;
    const first = Math.min(count, capacity - this.emitCursor);
    this.device.queue.writeBuffer(
      this.particleBuffer,
      this.emitCursor * PARTICLE_STRIDE,
      floats.buffer,
      floats.byteOffset,
      first * PARTICLE_STRIDE,
    );
    const remaining = count - first;
    if (remaining > 0) {
      this.device.queue.writeBuffer(
        this.particleBuffer,
        0,
        floats.buffer,
        floats.byteOffset + first * PARTICLE_STRIDE,
        remaining * PARTICLE_STRIDE,
      );
    }
    this.emitCursor = (this.emitCursor + count) % capacity;
  }

  private findMainConfig(): {
    startLifetime?: { sample?: (t: number, r?: number) => number };
    startSpeed?: { sample?: (t: number, r?: number) => number };
    startSize?: { sample?: (t: number, r?: number) => number };
    startRotation?: { sample?: (t: number, r?: number) => number };
    startColor?: { sample?: (t: number, r?: number) => readonly [number, number, number, number] };
    infiniteLifetime?: boolean;
  } | null {
    const main = this.findModule('main') as
      | { config?: {
        startLifetime?: { sample?: (t: number, r?: number) => number };
        startSpeed?: { sample?: (t: number, r?: number) => number };
        startSize?: { sample?: (t: number, r?: number) => number };
        startRotation?: { sample?: (t: number, r?: number) => number };
        startColor?: { sample?: (t: number, r?: number) => readonly [number, number, number, number] };
        infiniteLifetime?: boolean;
      } }
      | undefined;
    return main?.config ?? null;
  }

  private findMeshShape(): MeshShapeModuleLike | undefined {
    const shape = this.findModule('shape') as MeshShapeModuleLike | undefined;
    return shape?.config.kind === 'mesh' && shape.config.mesh?.vertices.length && shape.config.mesh.indices.length
      ? shape
      : undefined;
  }

  /** Browser-native counterpart to BrazeFX Mesh Shape emission. Static mesh
   * samples are chosen on the CPU, then injected into the existing GPU pool so
   * lifetime, force, collision, events, and rendering remain identical. */
  private injectMeshShapeParticles(shape: MeshShapeModuleLike, count: number): void {
    const mesh = shape.config.mesh!;
    const source = shape.config.meshEmitSource ?? 'surface';
    const sampler = this.getMeshShapeSampler(mesh);
    const spawns: CpuParticleSpawn[] = [];
    const indexCount = Math.floor(mesh.indices.length / 3) * 3;
    if (indexCount < 3 || mesh.vertices.length < 8) return;

    for (let i = 0; i < count; i++) {
      const seed = hashU32(this.system.config.seed ^ hashU32(this.emitCursor + i));
      const tri = source === 'vertices'
        ? Math.floor(random01(seed) * indexCount / 3)
        : selectTriangle(sampler, random01(seed));
      const base = tri * 3;
      const ia = mesh.indices[base]!;
      const ib = mesh.indices[base + 1]!;
      const ic = mesh.indices[base + 2]!;
      let point: [number, number, number];
      let normal: [number, number, number];
      if (source === 'vertices') {
        const vertex = [ia, ib, ic][Math.min(2, Math.floor(random01(hashU32(seed ^ 0x68bc21eb)) * 3))]!;
        point = meshPosition(mesh.vertices, vertex);
        normal = meshNormal(mesh.vertices, vertex);
      } else if (source === 'edges') {
        const edge = Math.floor(random01(hashU32(seed ^ 0x02e5be93)) * 3);
        const [from, to] = edge === 0 ? [ia, ib] : edge === 1 ? [ib, ic] : [ic, ia];
        const t = random01(hashU32(seed ^ 0x7f4a7c15));
        point = lerp3(meshPosition(mesh.vertices, from), meshPosition(mesh.vertices, to), t);
        normal = normalize3(lerp3(meshNormal(mesh.vertices, from), meshNormal(mesh.vertices, to), t), [0, 1, 0]);
      } else {
        const u = random01(hashU32(seed ^ 0x02e5be93));
        const v = random01(hashU32(seed ^ 0x7f4a7c15));
        const su = Math.sqrt(u);
        const wa = 1 - su;
        const wb = su * (1 - v);
        const wc = su * v;
        point = weighted3(meshPosition(mesh.vertices, ia), meshPosition(mesh.vertices, ib), meshPosition(mesh.vertices, ic), wa, wb, wc);
        normal = normalize3(weighted3(meshNormal(mesh.vertices, ia), meshNormal(mesh.vertices, ib), meshNormal(mesh.vertices, ic), wa, wb, wc), [0, 1, 0]);
      }
      if (this.system.config.simulationSpace === 'world') {
        point = transformPoint(this.emitXform, point);
        normal = normalize3(transformVector(this.emitXform, normal), normal);
      }
      spawns.push({ position: point, velocity: [0, 0, 0], normal, count: 1, align: 'normal', inheritVelocity: 0 });
    }
    this.injectParticles(spawns);
  }

  private getMeshShapeSampler(mesh: NonNullable<MeshShapeModuleLike['config']['mesh']>): MeshShapeSampler {
    const key = `${mesh.name}:${mesh.vertices.length}:${mesh.indices.length}:${mesh.vertices[0] ?? 0}:${mesh.indices[0] ?? 0}`;
    if (this.meshShapeSampler?.key === key) return this.meshShapeSampler;
    const triangles = Math.floor(mesh.indices.length / 3);
    const cumulativeAreas = new Float32Array(triangles);
    let totalArea = 0;
    for (let i = 0; i < triangles; i++) {
      const a = meshPosition(mesh.vertices, mesh.indices[i * 3]!);
      const b = meshPosition(mesh.vertices, mesh.indices[i * 3 + 1]!);
      const c = meshPosition(mesh.vertices, mesh.indices[i * 3 + 2]!);
      totalArea += triangleArea(a, b, c);
      cumulativeAreas[i] = totalArea;
    }
    this.meshShapeSampler = { key, cumulativeAreas, totalArea: Math.max(totalArea, 1e-6) };
    return this.meshShapeSampler;
  }
}

function meshPosition(vertices: readonly number[], index: number): [number, number, number] {
  const i = Math.max(0, index) * 8;
  return [vertices[i] ?? 0, vertices[i + 1] ?? 0, vertices[i + 2] ?? 0];
}

function meshNormal(vertices: readonly number[], index: number): [number, number, number] {
  const i = Math.max(0, index) * 8 + 3;
  return normalize3([vertices[i] ?? 0, vertices[i + 1] ?? 1, vertices[i + 2] ?? 0], [0, 1, 0]);
}

function weighted3(a: readonly number[], b: readonly number[], c: readonly number[], wa: number, wb: number, wc: number): [number, number, number] {
  return [a[0]! * wa + b[0]! * wb + c[0]! * wc, a[1]! * wa + b[1]! * wb + c[1]! * wc, a[2]! * wa + b[2]! * wb + c[2]! * wc];
}

function lerp3(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
}

function triangleArea(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const abx = b[0]! - a[0]!, aby = b[1]! - a[1]!, abz = b[2]! - a[2]!;
  const acx = c[0]! - a[0]!, acy = c[1]! - a[1]!, acz = c[2]! - a[2]!;
  return Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) * 0.5;
}

function selectTriangle(sampler: MeshShapeSampler, value: number): number {
  const target = value * sampler.totalArea;
  let lo = 0, hi = sampler.cumulativeAreas.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sampler.cumulativeAreas[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function transformPoint(m: Float32Array, p: readonly [number, number, number]): [number, number, number] {
  return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];
}

function transformVector(m: Float32Array, p: readonly [number, number, number]): [number, number, number] {
  return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2], m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2], m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2]];
}

/** Map a high-level blend mode to WebGPU blend factors (premultiplied input assumed). */
function blendFor(mode: BlendMode): GPUBlendState {
  switch (mode) {
    case 'additive':
      return {
        color: { srcFactor: 'one', dstFactor: 'one',                    operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one',                    operation: 'add' },
      };
    case 'multiply':
      return {
        color: { srcFactor: 'dst',  dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one',                  operation: 'add' },
      };
    case 'alpha':
    default:
      return {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      };
  }
}

function effectiveBlend(
  renderer: RendererModuleLike | undefined,
  material: MaterialModuleLike | undefined,
): BlendMode {
  if (material) return material.config.blendMode;
  const preset = renderer?.config.material;
  if (preset === 'unlitAdditive') return 'additive';
  if (preset === 'multiply') return 'multiply';
  return renderer?.config.blendMode ?? 'alpha';
}

function sampleCurve(
  curve: { sample?: (t: number, r?: number) => number } | undefined,
  t: number,
  r: number,
  fallback: number,
): number {
  if (!curve || typeof curve.sample !== 'function') return fallback;
  const value = curve.sample(t, r);
  return Number.isFinite(value) ? value : fallback;
}

function sampleGradient(
  gradient: { sample?: (t: number, r?: number) => readonly [number, number, number, number] } | undefined,
  t: number,
  r: number,
): [number, number, number, number] {
  const value = gradient?.sample?.(t, r);
  if (!value || value.length !== 4 || !value.every(Number.isFinite)) return [1, 1, 1, 1];
  return [value[0], value[1], value[2], value[3]];
}

function directionForSpawn(spawn: CpuParticleSpawn, seed: number): [number, number, number] {
  if (spawn.align === 'normal') return normalize3(spawn.normal, randomDirection(seed));
  if (spawn.align === 'velocity') return normalize3(spawn.velocity, randomDirection(seed));
  return randomDirection(seed);
}

function normalize3(v: readonly [number, number, number], fallback: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-5) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function randomDirection(seed: number): [number, number, number] {
  const u = random01(hashU32(seed ^ 0x045d9f3b)) * 2 - 1;
  const theta = random01(hashU32(seed ^ 0x119de1f3)) * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  return [r * Math.cos(theta), r * Math.sin(theta), u];
}

function random01(seed: number): number {
  return (hashU32(seed) >>> 0) / 0x100000000;
}

function hashU32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function cullModeForMeshFaceSide(
  renderer: RendererModuleLike | undefined,
  material: MaterialModuleLike | undefined,
): GPUCullMode {
  if (renderer?.config.renderMode !== 'mesh') return 'none';
  const side = renderer.config.meshFaceSide
    ?? (material?.config.twoSided === false ? 'front' : 'both');
  if (side === 'front') return 'back';
  if (side === 'back') return 'front';
  return 'none';
}

function fieldEffectorTypeCode(type: FieldEffectorType): number {
  if (type === 'directionalForce') return 1;
  if (type === 'radialForce') return 2;
  if (type === 'vortex') return 3;
  if (type === 'drag') return 4;
  return 5;
}

function fieldEffectorShapeCode(shape: FieldEffectorShape): number {
  if (shape === 'sphere') return 1;
  if (shape === 'box') return 2;
  return 0;
}

function fieldEffectorFalloffCode(falloff: FieldEffectorFalloff): number {
  if (falloff === 'linear') return 1;
  if (falloff === 'smooth') return 2;
  return 0;
}

function fieldVortexModeCode(mode: FieldVortexMode): number {
  if (mode === 'core') return 1;
  if (mode === 'orbit') return 2;
  return 0;
}

function particleColliderTypeCode(type: ParticleColliderType): number {
  if (type === 'sphere') return 1;
  if (type === 'box') return 2;
  return 0;
}

function distributionCode(distribution: MeshDistribution): number {
  if (distribution === 'weightedRandom') return 2;
  if (distribution === 'uniformRandom') return 1;
  return 0;
}

function writeRenderUniforms(
  s: Float32Array,
  renderer: RendererModuleLike | undefined,
  viewProj: Float32Array,
  model: Float32Array,
  cameraRight: readonly [number, number, number],
  cameraUp: readonly [number, number, number],
  tint: readonly [number, number, number, number],
  cols: number,
  rows: number,
  cycles: number,
  spriteOn: number,
  material: MaterialModuleLike | undefined,
  capacity: number,
  sprite: SpriteAnimModuleLike | undefined,
): void {
  s.set(viewProj, 0);
  s.set(model, 16);
  s[32] = cameraRight[0]; s[33] = cameraRight[1]; s[34] = cameraRight[2]; s[35] = 0;
  s[36] = cameraUp[0];    s[37] = cameraUp[1];    s[38] = cameraUp[2];    s[39] = 0;
  s[40] = tint[0]; s[41] = tint[1]; s[42] = tint[2]; s[43] = tint[3];
  s[44] = cols; s[45] = rows; s[46] = cycles; s[47] = spriteOn;
  s[48] = renderModeCode(renderer?.config.renderMode ?? 'sprite');
  s[49] = facingCode(renderer?.config.facing ?? 'auto');
    const meshRotationJitter = renderer?.config.meshRotationJitter ?? ZERO_VEC3;
  s[50] = meshRotationJitter[0];
  s[51] = meshRotationJitter[1];
  const pivot = renderer?.config.pivot ?? ZERO_VEC2;
  const flip = renderer?.config.flip ?? ZERO_VEC2;
  s[52] = pivot[0]; s[53] = pivot[1]; s[54] = flip[0]; s[55] = flip[1];
  s[56] = renderer?.config.velocityScale ?? 0.08;
  s[57] = renderer?.config.lengthScale ?? 1;
  s[58] = renderer?.config.rotateWithStretch === false ? 0 : 1;
  s[59] = meshRotationJitter[2];
  const meshScale = renderer?.config.meshScale ?? ONE_VEC3;
  s[60] = meshScale[0]; s[61] = meshScale[1]; s[62] = meshScale[2]; s[63] = capacity;
  s[64] = 0; s[65] = 1; s[66] = 0; s[67] = 1;
  s[68] = 1; s[69] = 0; s[70] = 0; s[71] = 0;
  s[72] = material?.config.alphaCutoff ?? 0;
  s[73] = material?.config.emissiveStrength ?? 1;
  s[74] = material?.config.shading === 'lit' ? 1 : 0;
  const meshFaceSide = renderer?.config.meshFaceSide
    ?? (material?.config.twoSided === false ? 'front' : 'both');
  s[75] = meshFaceSide === 'both' ? 1 : 0;
  s[76] = flipbookTimeCode(sprite?.config.timeMode ?? 'lifetime');
  s[77] = flipbookPlaybackCode(sprite?.config.playback ?? 'loop');
  s[78] = Math.max(0.01, sprite?.config.fps ?? 24);
  s[79] = Math.max(0, Math.floor(sprite?.config.startFrame ?? 0));
  s[80] = sprite?.config.animation === 'singleRow' ? 1 : 0;
  s[81] = sprite?.config.rowMode === 'random' ? 1 : 0;
  s[82] = Math.max(0, Math.floor(sprite?.config.row ?? 0));
  s[83] = sprite?.config.randomStart ? 1 : 0;
  s[84] = sprite?.config.speedRange?.[0] ?? 0;
  s[85] = sprite?.config.speedRange?.[1] ?? 5;
  s[86] = Math.max(0.01, sprite?.config.cycles ?? 1);
  s[87] = 0;
}

function flipbookTimeCode(mode: SpriteAnimModuleLike['config']['timeMode']): number {
  if (mode === 'lifetime') return 1;
  if (mode === 'speed') return 2;
  return 0;
}

function flipbookPlaybackCode(mode: SpriteAnimModuleLike['config']['playback']): number {
  if (mode === 'once') return 0;
  if (mode === 'pingPong') return 2;
  if (mode === 'holdLast') return 3;
  return 1;
}

function renderModeCode(mode: SpriteRenderMode): number {
  switch (mode) {
    case 'stretchedSprite': return 1;
    case 'horizontalBillboard': return 2;
    case 'verticalBillboard': return 3;
    case 'none': return 4;
    case 'mesh': return 5;
    case 'sprite':
    default: return 0;
  }
}

function facingCode(facing: RenderFacing): number {
  switch (facing) {
    case 'camera': return 1;
    case 'velocity': return 2;
    case 'world': return 3;
    case 'local': return 4;
    case 'auto':
    default: return 0;
  }
}

function builtinMeshData(kind: BuiltinMesh): { vertices: Float32Array; indices: Uint16Array } {
  switch (kind) {
    case 'tetrahedron':
      return indexedMesh(
        [
          [0, 0.58, 0],
          [0.55, -0.33, 0.32],
          [-0.55, -0.33, 0.32],
          [0, -0.33, -0.64],
        ],
        [
          [0, 1, 2],
          [0, 3, 1],
          [0, 2, 3],
          [1, 3, 2],
        ],
      );
    case 'diamond':
      return indexedMesh(
        [
          [0, 0.62, 0],
          [0.45, 0, 0],
          [0, 0, 0.45],
          [-0.45, 0, 0],
          [0, 0, -0.45],
          [0, -0.62, 0],
        ],
        [
          [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1],
          [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4],
        ],
      );
    case 'shard':
      return indexedMesh(
        [
          [-0.18, -0.55, -0.08],
          [0.22, -0.42, 0.1],
          [0.08, 0.62, -0.02],
          [-0.12, 0.36, 0.16],
          [0.02, -0.18, -0.2],
        ],
        [
          [0, 1, 2], [0, 2, 3], [0, 4, 1], [1, 4, 2],
          [2, 4, 3], [3, 4, 0],
        ],
      );
    case 'plane':
      return indexedMesh(
        [
          [-0.5, 0, -0.5],
          [0.5, 0, -0.5],
          [0.5, 0, 0.5],
          [-0.5, 0, 0.5],
        ],
        [[0, 1, 2], [0, 2, 3]],
      );
    case 'cube':
    default:
      return indexedMesh(
        [
          [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
          [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
        ],
        [
          [0, 2, 1], [0, 3, 2],
          [4, 5, 6], [4, 6, 7],
          [0, 1, 5], [0, 5, 4],
          [3, 7, 6], [3, 6, 2],
          [1, 2, 6], [1, 6, 5],
          [0, 4, 7], [0, 7, 3],
        ],
      );
  }
}

function indexedMesh(
  positions: Array<readonly [number, number, number]>,
  faces: Array<readonly [number, number, number]>,
): { vertices: Float32Array; indices: Uint16Array } {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const a = positions[face[0]]!;
    const b = positions[face[1]]!;
    const c = positions[face[2]]!;
    const n = faceNormal(a, b, c);
    const base = vertices.length / 8;
    const uvs: Array<readonly [number, number]> = [[0, 0], [1, 0], [0.5, 1]];
    let i = 0;
    for (const p of [a, b, c]) {
      const uv = uvs[i++]!;
      vertices.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]);
    }
    indices.push(base, base + 1, base + 2);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

function faceNormal(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function typeBytes(type: UniformDescriptor['type']): number {
  return type === 'f32' || type === 'u32' || type === 'i32'
    ? 4
    : type === 'vec2f'
      ? 8
      : type === 'vec3f'
        ? 12
        : 16;
}

function eventTypeFromCode(code: number): GpuParticleEventType | null {
  if (code === 0) return 'birth';
  if (code === 1) return 'death';
  if (code === 2) return 'collision';
  return null;
}

function packSeedGeneration(seed: number, generation: number): number {
  const gen = Math.max(0, Math.min(255, Math.floor(generation))) >>> 0;
  return ((gen << 24) | (seed & 0x00ffffff)) >>> 0;
}

function writeUniform(
  viewF: Float32Array,
  viewU: Uint32Array,
  offset: number,
  type: UniformDescriptor['type'],
  value: number | readonly number[],
): void {
  const i = offset / 4;
  if (type === 'u32') {
    viewU[i] = Math.trunc(value as number) >>> 0;
    return;
  }
  if (type === 'i32') {
    viewU[i] = Math.trunc(value as number) | 0;
    return;
  }
  if (type === 'f32') {
    viewF[i] = value as number;
    return;
  }
  const arr = value as readonly number[];
  const n = type === 'vec2f' ? 2 : type === 'vec3f' ? 3 : 4;
  for (let k = 0; k < n; k++) viewF[i + k] = arr[k] ?? 0;
}
