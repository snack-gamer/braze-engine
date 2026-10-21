/**
 * localStorage-backed persistence for a ParticleSystem.
 *
 * Stores system.config + every module's full config (including curve / gradient
 * data) as JSON under a caller-supplied key. On load the existing module list
 * is replaced with modules reconstructed from the saved state — so user-added
 * modules survive reload too.
 */

import {
  DEFAULT_EMITTER_EVENT_ROUTE,
  createDefaultEmitterEventHandlers,
  MinMaxCurve, MinMaxGradient,
  ParticleCollider,
  ParticleEffector,
  ParticleEmitter,
  ParticleSystem,
  type Module,
  type ParticleEffect,
} from '@particles/core';
import {
  CollisionModule, ColorBySpeedModule, ColorOverLifetimeModule, EmissionModule, MainModule, OpacityOverLifetimeModule,
  ParticleMaterialModule, RendererModule, ShapeModule, SizeOverLifetimeModule, SpriteAnimationModule,
  VelocityOverLifetimeModule,
} from '@particles/modules';

/** Factory for reconstructing module instances by id. */
const FACTORIES: Record<string, () => Module> = {
  main: () => new MainModule(),
  emission: () => new EmissionModule(),
  shape: () => new ShapeModule(),
  renderer: () => new RendererModule(),
  material: () => new ParticleMaterialModule(),
  vol: () => new VelocityOverLifetimeModule(),
  col: () => new ColorOverLifetimeModule(),
  cbs: () => new ColorBySpeedModule(),
  opl: () => new OpacityOverLifetimeModule(),
  sol: () => new SizeOverLifetimeModule(),
  spriteAnim: () => new SpriteAnimationModule(),
  collision: () => new CollisionModule(),
};

interface SavedModule {
  id: string;
  enabled: boolean;
  data: Record<string, unknown>;
}

interface SerializedParticleSystem {
  config: Record<string, unknown>;
  modules: SavedModule[];
}

interface SavedState extends SerializedParticleSystem {
  v: 1;
}

interface SavedEmitter {
  id: string;
  name: string;
  enabled: boolean;
  solo: boolean;
  locked: boolean;
  playbackMode?: 'timeline' | 'event';
  eventRoute?: {
    sourceEmitterId?: string;
    event?: 'birth' | 'death' | 'collision';
    colliderId?: string;
    minSpeed?: number;
    probability?: number;
    maxPerFrame?: number;
    cooldown?: number;
    action?: 'emitBurst' | 'none' | 'spawnParticles' | 'spawnSystem' | 'killSource';
    count?: number;
    align?: 'none' | 'velocity' | 'normal';
    inheritVelocity?: number;
    killSource?: boolean;
  };
  eventHandlers?: Partial<Record<'birth' | 'death' | 'collision', {
    enabled?: boolean;
    event?: 'birth' | 'death' | 'collision';
    action?: 'none' | 'spawnParticles' | 'spawnSystem' | 'killSource';
    targetEmitterId?: string;
    colliderId?: string;
    minSpeed?: number;
    probability?: number;
    maxPerFrame?: number;
    cooldown?: number;
    count?: number;
    maxGenerations?: number;
    align?: 'none' | 'velocity' | 'normal';
    inheritVelocity?: number;
    killSource?: boolean;
  }>>;
  startDelay: number;
  clipDuration: number;
  endPolicy: {
    mode: 'stop' | 'loop';
    particles: 'finish' | 'kill';
    killDelay: number;
  };
  timeScale: number;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  system: SerializedParticleSystem;
}

interface SavedEffector {
  id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  type: 'directionalForce' | 'radialForce' | 'vortex' | 'drag' | 'turbulence';
  shape: 'infinite' | 'sphere' | 'box';
  falloff: 'none' | 'linear' | 'smooth';
  vortexMode?: 'free' | 'core' | 'orbit';
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
  startDelay: number;
  clipDuration: number;
  strength: number;
  direction: [number, number, number];
  radius: number;
  size: [number, number, number];
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  affectedEmitterIds: string[];
}

interface SavedCollider {
  id: string;
  name: string;
  enabled: boolean;
  locked: boolean;
  type: 'plane' | 'sphere' | 'box';
  bounce: number;
  friction: number;
  stickiness: number;
  settleSpeed: number;
  radius: number;
  size: [number, number, number];
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  affectedEmitterIds: string[];
}

interface SavedEffectState {
  v: 1;
  config: Record<string, unknown>;
  emitters: SavedEmitter[];
  effectors?: SavedEffector[];
  colliders?: SavedCollider[];
}

const SCHEMA_VERSION = 1 as const;

export function saveState(system: ParticleSystem, key: string): void {
  const state: SavedState = {
    v: SCHEMA_VERSION,
    ...serializeParticleSystem(system),
  };
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.warn('[particles] persist failed:', e);
  }
}

/**
 * Try to restore state from localStorage. Returns true if anything was applied.
 * Caller should re-compile their backend afterwards.
 */
export function loadState(system: ParticleSystem, key: string): boolean {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { return false; }
  if (!raw) return false;
  let state: SavedState;
  try { state = JSON.parse(raw); } catch { return false; }
  if (!state || state.v !== SCHEMA_VERSION) return false;

  applyParticleSystemState(system, state);
  return true;
}

export function saveEffectState(effect: ParticleEffect, key: string): void {
  const state: SavedEffectState = {
    v: SCHEMA_VERSION,
    config: { ...effect.config },
    emitters: effect.emitters.map((emitter) => ({
      id: emitter.id,
      name: emitter.name,
      enabled: emitter.enabled,
      solo: emitter.solo,
      locked: emitter.locked,
      playbackMode: emitter.playbackMode,
      eventRoute: { ...emitter.eventRoute },
      eventHandlers: {
        birth: { ...emitter.eventHandlers.birth },
        collision: { ...emitter.eventHandlers.collision },
        death: { ...emitter.eventHandlers.death },
      },
      startDelay: emitter.startDelay,
      clipDuration: emitter.clipDuration,
      endPolicy: emitter.endPolicy,
      timeScale: emitter.timeScale,
      transform: {
        position: [...emitter.transform.position],
        rotation: [...emitter.transform.rotation],
        scale: [...emitter.transform.scale],
      },
      system: serializeParticleSystem(emitter.system),
    })),
    effectors: effect.effectors.map((effector) => ({
      id: effector.id,
      name: effector.name,
      enabled: effector.enabled,
      locked: effector.locked,
      type: effector.type,
      shape: effector.shape,
      falloff: effector.falloff,
      vortexMode: effector.vortexMode,
      vortexPull: effector.vortexPull,
      vortexOrbitRadius: effector.vortexOrbitRadius,
      vortexLift: effector.vortexLift,
      vortexAxialDamping: effector.vortexAxialDamping,
      vortexLiftVariation: effector.vortexLiftVariation,
      turbulenceDetail: effector.turbulenceDetail,
      turbulenceScale: effector.turbulenceScale,
      turbulenceScaleRandom: effector.turbulenceScaleRandom,
      randomStrength: effector.randomStrength,
      randomPosition: effector.randomPosition,
      randomDirection: effector.randomDirection,
      startDelay: effector.startDelay,
      clipDuration: effector.clipDuration,
      strength: effector.strength,
      direction: [...effector.direction],
      radius: effector.radius,
      size: [...effector.size],
      transform: {
        position: [...effector.transform.position],
        rotation: [...effector.transform.rotation],
        scale: [...effector.transform.scale],
      },
      affectedEmitterIds: [...effector.affectedEmitterIds],
    })),
    colliders: effect.colliders.map((collider) => ({
      id: collider.id,
      name: collider.name,
      enabled: collider.enabled,
      locked: collider.locked,
      type: collider.type,
      bounce: collider.bounce,
      friction: collider.friction,
      stickiness: collider.stickiness,
      settleSpeed: collider.settleSpeed,
      radius: collider.radius,
      size: [...collider.size],
      transform: {
        position: [...collider.transform.position],
        rotation: [...collider.transform.rotation],
        scale: [...collider.transform.scale],
      },
      affectedEmitterIds: [...collider.affectedEmitterIds],
    })),
  };
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.warn('[particles] effect persist failed:', e);
  }
}

export function loadEffectState(effect: ParticleEffect, key: string): boolean {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { return false; }
  if (!raw) return false;
  let state: SavedEffectState;
  try { state = JSON.parse(raw); } catch { return false; }
  if (!state || state.v !== SCHEMA_VERSION) return false;
  if (!Array.isArray(state.emitters) || state.emitters.length === 0) return false;

  if (state.config && typeof state.config === 'object') {
    Object.assign(effect.config, state.config);
  }
  effect.emitters.length = 0;
  effect.effectors.length = 0;
  effect.colliders.length = 0;
  for (const saved of state.emitters ?? []) {
    const system = new ParticleSystem();
    applyParticleSystemState(system, saved.system);
    const eventHandlers = createDefaultEmitterEventHandlers();
    eventHandlers.birth = { ...eventHandlers.birth, ...(saved.eventHandlers?.birth ?? {}) };
    eventHandlers.collision = { ...eventHandlers.collision, ...(saved.eventHandlers?.collision ?? {}) };
    eventHandlers.death = { ...eventHandlers.death, ...(saved.eventHandlers?.death ?? {}) };
    effect.emitters.push(new ParticleEmitter({
      id: saved.id,
      name: saved.name,
      enabled: saved.enabled,
      solo: saved.solo,
      locked: saved.locked,
      playbackMode: saved.playbackMode ?? 'timeline',
      eventRoute: normalizeLegacyEventRoute(saved.eventRoute),
      eventHandlers,
      startDelay: saved.startDelay,
      clipDuration: saved.clipDuration,
      endPolicy: saved.endPolicy,
      timeScale: saved.timeScale,
      transform: saved.transform,
      system,
    }));
  }
  migrateLegacyEventRoutes(effect);
  for (const saved of state.effectors ?? []) {
    effect.effectors.push(new ParticleEffector({
      id: saved.id,
      name: saved.name,
      enabled: saved.enabled,
      locked: saved.locked,
      type: saved.type,
      shape: saved.shape,
      falloff: saved.falloff,
      vortexMode: saved.vortexMode,
      vortexPull: saved.vortexPull,
      vortexOrbitRadius: saved.vortexOrbitRadius,
      vortexLift: saved.vortexLift,
      vortexAxialDamping: saved.vortexAxialDamping,
      vortexLiftVariation: saved.vortexLiftVariation,
      turbulenceDetail: saved.turbulenceDetail,
      turbulenceScale: saved.turbulenceScale,
      turbulenceScaleRandom: saved.turbulenceScaleRandom,
      randomStrength: saved.randomStrength,
      randomPosition: saved.randomPosition,
      randomDirection: saved.randomDirection,
      startDelay: saved.startDelay,
      clipDuration: saved.clipDuration,
      strength: saved.strength,
      direction: saved.direction,
      radius: saved.radius,
      size: saved.size,
      transform: saved.transform,
      affectedEmitterIds: saved.affectedEmitterIds,
    }));
  }
  for (const saved of state.colliders ?? []) {
    effect.colliders.push(new ParticleCollider({
      id: saved.id,
      name: saved.name,
      enabled: saved.enabled,
      locked: saved.locked,
      type: saved.type,
      bounce: saved.bounce,
      friction: saved.friction,
      stickiness: saved.stickiness,
      settleSpeed: saved.settleSpeed,
      radius: saved.radius,
      size: saved.size,
      transform: saved.transform,
      affectedEmitterIds: saved.affectedEmitterIds,
    }));
  }
  return effect.emitters.length > 0;
}

function serializeParticleSystem(system: ParticleSystem): SerializedParticleSystem {
  return {
    config: { ...system.config },
    modules: system.modules.map((m) => ({
      id: m.id,
      enabled: m.enabled,
      data: serializeModule(m),
    })),
  };
}

function applyParticleSystemState(
  system: ParticleSystem,
  state: SerializedParticleSystem,
): void {
  // System-level config — overlay so unknown keys (added later) stay at defaults.
  if (state.config && typeof state.config === 'object') {
    Object.assign(system.config, state.config);
  }

  // Replace module list. Skip any unknown ids; preserve order from the saved state.
  system.modules.length = 0;
  for (const sm of state.modules ?? []) {
    const factory = FACTORIES[sm.id];
    if (!factory) {
      console.warn('[particles] persist: unknown module id', sm.id);
      continue;
    }
    const m = factory();
    m.enabled = sm.enabled !== false;
    applyModuleData(m, sm.data);
    system.add(m);
  }
}

function migrateLegacyEventRoutes(effect: ParticleEffect): void {
  for (const target of effect.emitters) {
    if (target.playbackMode !== 'event' || !target.eventRoute.sourceEmitterId) continue;
    const source = effect.getEmitter(target.eventRoute.sourceEmitterId);
    if (!source) continue;
    const handler = source.eventHandlers[target.eventRoute.event];
    handler.enabled = true;
    handler.action = 'spawnSystem';
    handler.targetEmitterId = target.id;
    handler.colliderId = target.eventRoute.colliderId;
    handler.minSpeed = target.eventRoute.minSpeed;
    handler.probability = target.eventRoute.probability;
    handler.maxPerFrame = target.eventRoute.maxPerFrame;
    handler.cooldown = target.eventRoute.cooldown;
    handler.count = target.eventRoute.count;
    handler.align = target.eventRoute.align;
    handler.inheritVelocity = target.eventRoute.inheritVelocity;
    handler.killSource = target.eventRoute.killSource;
  }
}

function normalizeLegacyEventRoute(saved: SavedEmitter['eventRoute']): typeof DEFAULT_EMITTER_EVENT_ROUTE {
  return {
    ...DEFAULT_EMITTER_EVENT_ROUTE,
    ...(saved ?? {}),
    action: saved?.action === 'emitBurst' ? 'spawnSystem' : saved?.action ?? DEFAULT_EMITTER_EVENT_ROUTE.action,
  };
}

/** Walk a module's config; serialize MinMaxCurve / MinMaxGradient via their `.data` field. */
function serializeModule(m: Module): Record<string, unknown> {
  const cfg = (m as unknown as { config?: Record<string, unknown> }).config;
  if (!cfg) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v instanceof MinMaxCurve)      out[k] = { __t: 'curve', d: v.data };
    else if (v instanceof MinMaxGradient) out[k] = { __t: 'grad',  d: v.data };
    else                                out[k] = v;  // scalars, vectors, plain objects
  }
  return out;
}

function applyModuleData(m: Module, data: Record<string, unknown> | undefined): void {
  const cfg = (m as unknown as { config?: Record<string, unknown> }).config;
  if (!cfg || !data) return;
  for (const [k, v] of Object.entries(data)) {
    const tagged = v as { __t?: string; d?: unknown };
    if (tagged && typeof tagged === 'object' && tagged.__t === 'curve') {
      const current = cfg[k];
      if (current instanceof MinMaxCurve) current.data = tagged.d as never;
      else cfg[k] = new MinMaxCurve(tagged.d as never);
    } else if (tagged && typeof tagged === 'object' && tagged.__t === 'grad') {
      const current = cfg[k];
      if (current instanceof MinMaxGradient) current.data = tagged.d as never;
      else cfg[k] = new MinMaxGradient(tagged.d as never);
    } else {
      cfg[k] = v;
    }
  }
}
