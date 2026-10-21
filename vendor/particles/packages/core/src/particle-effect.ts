import { ParticleSystem } from './particle-system';
import type { Vec3 } from './types';

export type ClipEndMode = 'stop' | 'loop';
export type ClipParticleEndMode = 'finish' | 'kill';
export type ParticleEffectorType = 'directionalForce' | 'radialForce' | 'vortex' | 'drag' | 'turbulence';
export type ParticleEffectorShape = 'infinite' | 'sphere' | 'box';
export type ParticleEffectorFalloff = 'none' | 'linear' | 'smooth';
export type ParticleVortexMode = 'free' | 'core' | 'orbit';
export type ParticleColliderType = 'plane' | 'sphere' | 'box';
export type ParticleEmitterPlaybackMode = 'timeline' | 'event';
export type ParticleEventType = 'birth' | 'death' | 'collision';
export type ParticleEventAction = 'none' | 'spawnParticles' | 'spawnSystem' | 'killSource';
export type ParticleEventAlign = 'none' | 'velocity' | 'normal';

export interface ClipEndPolicy {
  /** What happens when the emitter clip reaches its end. */
  mode: ClipEndMode;
  /** What happens to particles that are already alive when the clip ends. */
  particles: ClipParticleEndMode;
  /** Delay after clip end before killing live particles, if particles === 'kill'. */
  killDelay: number;
}

export interface ParticleEffectConfig {
  /** Master seed used to derive emitter seeds when an emitter does not provide one. */
  seed: number;
  /** Loop the whole effect timeline. */
  looping: boolean;
  /** Master duration in seconds. 0 means derive from child emitters. */
  duration: number;
  /** Playback speed multiplier for the whole effect. */
  timeScale: number;
}

export interface ParticleEmitterTransform {
  position: Vec3;
  /** Euler rotation in radians, XYZ order. */
  rotation: Vec3;
  scale: Vec3;
}

export interface ParticleEmitterEventRoute {
  /** Emitter whose particle event should trigger this emitter. Empty means unassigned. */
  sourceEmitterId: string;
  event: ParticleEventType;
  /** Collision source filter. Empty means any collider. Used only when event === 'collision'. */
  colliderId: string;
  minSpeed: number;
  probability: number;
  maxPerFrame: number;
  cooldown: number;
  action: ParticleEventAction;
  count: number;
  align: ParticleEventAlign;
  inheritVelocity: number;
  killSource: boolean;
}

export interface ParticleEmitterEventHandler {
  enabled: boolean;
  event: ParticleEventType;
  action: ParticleEventAction;
  /** Target particle system template. Used when action === 'spawnSystem'. */
  targetEmitterId: string;
  /** Collision source filter. Empty means any collider. Used only when event === 'collision'. */
  colliderId: string;
  minSpeed: number;
  probability: number;
  maxPerFrame: number;
  cooldown: number;
  count: number;
  /** Highest event generation allowed to trigger this handler. 1 allows master particles only. */
  maxGenerations: number;
  align: ParticleEventAlign;
  inheritVelocity: number;
  killSource: boolean;
}

export type ParticleEmitterEventHandlers = Record<ParticleEventType, ParticleEmitterEventHandler>;

export interface ParticleEmitterConfig {
  id: string;
  name: string;
  enabled: boolean;
  solo: boolean;
  locked: boolean;
  /** Delay from effect start before this emitter begins ticking. */
  startDelay: number;
  /** Timeline clip length in seconds. Controls emitter playback, not per-particle lifetime. */
  clipDuration: number;
  endPolicy: ClipEndPolicy;
  /** Per-emitter playback multiplier, applied after the effect time scale. */
  timeScale: number;
  playbackMode: ParticleEmitterPlaybackMode;
  eventRoute: ParticleEmitterEventRoute;
  eventHandlers: ParticleEmitterEventHandlers;
  transform: ParticleEmitterTransform;
}

export interface ParticleEmitterInit extends Partial<ParticleEmitterConfig> {
  system?: ParticleSystem;
}

export interface ParticleEffectorConfig {
  id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  type: ParticleEffectorType;
  shape: ParticleEffectorShape;
  falloff: ParticleEffectorFalloff;
  /** Delay from effect start before this field becomes active. */
  startDelay: number;
  /** Timeline clip length in seconds. */
  clipDuration: number;
  /** Force magnitude or damping strength, depending on type. */
  strength: number;
  /** Direction for directional force and vortex axis. */
  direction: Vec3;
  /** Vortex radial behavior. */
  vortexMode: ParticleVortexMode;
  /** Attraction strength used by vortex core/orbit modes. */
  vortexPull: number;
  /** Target distance from vortex axis when vortexMode === 'orbit'. */
  vortexOrbitRadius: number;
  /** BrazeFX vortex axial target velocity. */
  vortexLift: number;
  /** BrazeFX vortex axial response, 0..1. */
  vortexAxialDamping: number;
  /** Stable per-particle vortex lift variation, 0..1. */
  vortexLiftVariation: number;
  /** Fine turbulence octave contribution, 0..1. */
  turbulenceDetail: number;
  /** Turbulence wave size in world units. */
  turbulenceScale: number;
  /** Stable per-particle turbulence wave-size variation, 0..1. */
  turbulenceScaleRandom: number;
  /** Per-particle strength variation, 0..1. */
  randomStrength: number;
  /** Per-particle effector-center offset in world/local units. */
  randomPosition: number;
  /** Per-particle direction/axis jitter, 0..1. */
  randomDirection: number;
  /** Sphere radius. */
  radius: number;
  /** Box dimensions. */
  size: Vec3;
  transform: ParticleEmitterTransform;
  /** Empty means all emitters are affected. */
  affectedEmitterIds: string[];
}

export interface ParticleEffectorInit extends Partial<ParticleEffectorConfig> {}

export interface ParticleColliderConfig {
  id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  type: ParticleColliderType;
  /** Elasticity of normal collision response, 0 = no bounce, 1 = full bounce. */
  bounce: number;
  /** Tangential velocity damping on contact, 0..1. */
  friction: number;
  /** Extra damping when a particle is close to rest on the surface, 0..1. */
  stickiness: number;
  /** Contact speed below this value is snapped to rest. */
  settleSpeed: number;
  /** Sphere radius. */
  radius: number;
  /** Box dimensions. */
  size: Vec3;
  transform: ParticleEmitterTransform;
  /** Empty means all emitters collide. */
  affectedEmitterIds: string[];
}

export interface ParticleColliderInit extends Partial<ParticleColliderConfig> {}

export const DEFAULT_EFFECT_CONFIG: ParticleEffectConfig = {
  seed: 1,
  looping: true,
  duration: 0,
  timeScale: 1,
};

export const DEFAULT_EMITTER_TRANSFORM: ParticleEmitterTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export const DEFAULT_CLIP_END_POLICY: ClipEndPolicy = {
  mode: 'stop',
  particles: 'finish',
  killDelay: 0,
};

export const DEFAULT_EMITTER_EVENT_ROUTE: ParticleEmitterEventRoute = {
  sourceEmitterId: '',
  event: 'collision',
  colliderId: '',
  minSpeed: 0,
  probability: 1,
  maxPerFrame: 64,
  cooldown: 0,
  action: 'spawnSystem',
  count: 1,
  align: 'normal',
  inheritVelocity: 0.5,
  killSource: false,
};

export function createDefaultEmitterEventHandler(event: ParticleEventType): ParticleEmitterEventHandler {
  return {
    enabled: false,
    event,
    action: 'none',
    targetEmitterId: '',
    colliderId: '',
    minSpeed: 0,
    probability: 1,
    maxPerFrame: 64,
    cooldown: event === 'collision' ? 0.05 : 0,
    count: 1,
    maxGenerations: 1,
    align: event === 'collision' ? 'normal' : 'velocity',
    inheritVelocity: event === 'collision' ? 0.5 : 0,
    killSource: false,
  };
}

export function createDefaultEmitterEventHandlers(): ParticleEmitterEventHandlers {
  return {
    birth: createDefaultEmitterEventHandler('birth'),
    collision: createDefaultEmitterEventHandler('collision'),
    death: createDefaultEmitterEventHandler('death'),
  };
}

let nextEmitterId = 1;
let nextEffectorId = 1;
let nextColliderId = 1;

export class ParticleEmitter {
  readonly id: string;
  name: string;
  enabled: boolean;
  solo: boolean;
  locked: boolean;
  startDelay: number;
  clipDuration: number;
  endPolicy: ClipEndPolicy;
  timeScale: number;
  playbackMode: ParticleEmitterPlaybackMode;
  eventRoute: ParticleEmitterEventRoute;
  eventHandlers: ParticleEmitterEventHandlers;
  transform: ParticleEmitterTransform;
  system: ParticleSystem;

  constructor(init: ParticleEmitterInit = {}) {
    this.id = init.id ?? `emitter_${nextEmitterId++}`;
    this.name = init.name ?? 'Emitter';
    this.enabled = init.enabled ?? true;
    this.solo = init.solo ?? false;
    this.locked = init.locked ?? false;
    this.startDelay = init.startDelay ?? 0;
    this.clipDuration = init.clipDuration ?? init.system?.config.duration ?? 5;
    this.endPolicy = {
      mode: init.endPolicy?.mode ?? DEFAULT_CLIP_END_POLICY.mode,
      particles: init.endPolicy?.particles ?? DEFAULT_CLIP_END_POLICY.particles,
      killDelay: init.endPolicy?.killDelay ?? DEFAULT_CLIP_END_POLICY.killDelay,
    };
    this.timeScale = init.timeScale ?? 1;
    this.playbackMode = init.playbackMode ?? 'timeline';
    this.eventRoute = {
      ...DEFAULT_EMITTER_EVENT_ROUTE,
      ...(init.eventRoute ?? {}),
    };
    const defaults = createDefaultEmitterEventHandlers();
    this.eventHandlers = {
      birth: { ...defaults.birth, ...(init.eventHandlers?.birth ?? {}) },
      collision: { ...defaults.collision, ...(init.eventHandlers?.collision ?? {}) },
      death: { ...defaults.death, ...(init.eventHandlers?.death ?? {}) },
    };
    this.transform = {
      position: cloneVec3(init.transform?.position ?? DEFAULT_EMITTER_TRANSFORM.position),
      rotation: cloneVec3(init.transform?.rotation ?? DEFAULT_EMITTER_TRANSFORM.rotation),
      scale: cloneVec3(init.transform?.scale ?? DEFAULT_EMITTER_TRANSFORM.scale),
    };
    this.system = init.system ?? new ParticleSystem();
  }
}

export class ParticleEffector {
  readonly id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  type: ParticleEffectorType;
  shape: ParticleEffectorShape;
  falloff: ParticleEffectorFalloff;
  startDelay: number;
  clipDuration: number;
  strength: number;
  direction: Vec3;
  vortexMode: ParticleVortexMode;
  vortexPull: number;
  vortexOrbitRadius: number;
  vortexLift: number;
  vortexAxialDamping: number;
  vortexLiftVariation: number;
  turbulenceDetail: number;
  turbulenceScale: number;
  turbulenceScaleRandom: number;
  randomStrength: number;
  randomPosition: number;
  randomDirection: number;
  radius: number;
  size: Vec3;
  transform: ParticleEmitterTransform;
  affectedEmitterIds: string[];

  constructor(init: ParticleEffectorInit = {}) {
    this.id = init.id ?? `effector_${nextEffectorId++}`;
    this.name = init.name ?? 'Effector';
    this.enabled = init.enabled ?? true;
    this.locked = init.locked ?? false;
    this.type = init.type ?? 'directionalForce';
    this.shape = init.shape ?? 'sphere';
    this.falloff = init.falloff ?? 'smooth';
    this.startDelay = init.startDelay ?? 0;
    this.clipDuration = init.clipDuration ?? 1;
    this.strength = init.strength ?? 4;
    this.direction = cloneVec3(init.direction ?? [1, 0, 0]);
    this.vortexMode = init.vortexMode ?? 'free';
    this.vortexPull = init.vortexPull ?? 6;
    this.vortexOrbitRadius = init.vortexOrbitRadius ?? 1;
    this.vortexLift = init.vortexLift ?? 0;
    this.vortexAxialDamping = init.vortexAxialDamping ?? 0;
    this.vortexLiftVariation = init.vortexLiftVariation ?? 0;
    this.turbulenceDetail = init.turbulenceDetail ?? 1;
    this.turbulenceScale = init.turbulenceScale ?? 10;
    this.turbulenceScaleRandom = init.turbulenceScaleRandom ?? 0.3;
    this.randomStrength = init.randomStrength ?? 0;
    this.randomPosition = init.randomPosition ?? 0;
    this.randomDirection = init.randomDirection ?? 0;
    this.radius = init.radius ?? 3;
    this.size = cloneVec3(init.size ?? [3, 3, 3]);
    this.transform = {
      position: cloneVec3(init.transform?.position ?? DEFAULT_EMITTER_TRANSFORM.position),
      rotation: cloneVec3(init.transform?.rotation ?? DEFAULT_EMITTER_TRANSFORM.rotation),
      scale: cloneVec3(init.transform?.scale ?? DEFAULT_EMITTER_TRANSFORM.scale),
    };
    this.affectedEmitterIds = [...(init.affectedEmitterIds ?? [])];
  }
}

export class ParticleCollider {
  readonly id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  type: ParticleColliderType;
  bounce: number;
  friction: number;
  stickiness: number;
  settleSpeed: number;
  radius: number;
  size: Vec3;
  transform: ParticleEmitterTransform;
  affectedEmitterIds: string[];

  constructor(init: ParticleColliderInit = {}) {
    this.id = init.id ?? `collider_${nextColliderId++}`;
    this.name = init.name ?? 'Collider';
    this.enabled = init.enabled ?? true;
    this.locked = init.locked ?? false;
    this.type = init.type ?? 'plane';
    this.bounce = init.bounce ?? 0;
    this.friction = init.friction ?? 0.65;
    this.stickiness = init.stickiness ?? 0.45;
    this.settleSpeed = init.settleSpeed ?? 0.08;
    this.radius = init.radius ?? 1;
    this.size = cloneVec3(init.size ?? [2, 2, 2]);
    this.transform = {
      position: cloneVec3(init.transform?.position ?? DEFAULT_EMITTER_TRANSFORM.position),
      rotation: cloneVec3(init.transform?.rotation ?? DEFAULT_EMITTER_TRANSFORM.rotation),
      scale: cloneVec3(init.transform?.scale ?? DEFAULT_EMITTER_TRANSFORM.scale),
    };
    this.affectedEmitterIds = [...(init.affectedEmitterIds ?? [])];
  }
}

export class ParticleEffect {
  config: ParticleEffectConfig;
  readonly emitters: ParticleEmitter[] = [];
  readonly effectors: ParticleEffector[] = [];
  readonly colliders: ParticleCollider[] = [];

  constructor(init: Partial<ParticleEffectConfig> = {}) {
    this.config = { ...DEFAULT_EFFECT_CONFIG, ...init };
  }

  addEmitter(init: ParticleEmitter | ParticleEmitterInit = {}): ParticleEmitter {
    const emitter = init instanceof ParticleEmitter ? init : new ParticleEmitter(init);
    if (emitter.system.config.seed === DEFAULT_EFFECT_CONFIG.seed) {
      emitter.system.config.seed = deriveEmitterSeed(this.config.seed, this.emitters.length);
    }
    this.emitters.push(emitter);
    return emitter;
  }

  getEmitter(id: string): ParticleEmitter | undefined {
    return this.emitters.find((e) => e.id === id);
  }

  removeEmitter(id: string): void {
    const i = this.emitters.findIndex((e) => e.id === id);
    if (i >= 0) this.emitters.splice(i, 1);
    for (const emitter of this.emitters) {
      if (emitter.eventRoute.sourceEmitterId === id) {
        emitter.eventRoute.sourceEmitterId = '';
      }
      for (const handler of Object.values(emitter.eventHandlers)) {
        if (handler.targetEmitterId === id) handler.targetEmitterId = '';
      }
    }
    for (const effector of this.effectors) {
      effector.affectedEmitterIds = effector.affectedEmitterIds.filter((targetId) => targetId !== id);
    }
    for (const collider of this.colliders) {
      collider.affectedEmitterIds = collider.affectedEmitterIds.filter((targetId) => targetId !== id);
    }
  }

  addEffector(init: ParticleEffector | ParticleEffectorInit = {}): ParticleEffector {
    const effector = init instanceof ParticleEffector ? init : new ParticleEffector(init);
    this.effectors.push(effector);
    return effector;
  }

  getEffector(id: string): ParticleEffector | undefined {
    return this.effectors.find((e) => e.id === id);
  }

  removeEffector(id: string): void {
    const i = this.effectors.findIndex((e) => e.id === id);
    if (i >= 0) this.effectors.splice(i, 1);
  }

  addCollider(init: ParticleCollider | ParticleColliderInit = {}): ParticleCollider {
    const collider = init instanceof ParticleCollider ? init : new ParticleCollider(init);
    this.colliders.push(collider);
    return collider;
  }

  getCollider(id: string): ParticleCollider | undefined {
    return this.colliders.find((c) => c.id === id);
  }

  removeCollider(id: string): void {
    const i = this.colliders.findIndex((c) => c.id === id);
    if (i >= 0) this.colliders.splice(i, 1);
    for (const emitter of this.emitters) {
      if (emitter.eventRoute.colliderId === id) {
        emitter.eventRoute.colliderId = '';
      }
      for (const handler of Object.values(emitter.eventHandlers)) {
        if (handler.colliderId === id) handler.colliderId = '';
      }
    }
  }
}

function deriveEmitterSeed(effectSeed: number, emitterIndex: number): number {
  let x = (effectSeed ^ ((emitterIndex + 1) * 0x9e3779b9)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x || 1;
}

function cloneVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}
