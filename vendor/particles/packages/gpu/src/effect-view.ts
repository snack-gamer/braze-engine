import type { ParticleCollider, ParticleEffect, ParticleEffector, ParticleEmitter, ParticleEmitterEventHandler, ParticleEventType } from '@particles/core';
import * as THREE from 'three';
import { ParticleSystemView } from './view';
import type { BackendOptions, CpuParticleSpawn, GpuParticleEvent, PassTargetState, PlayState } from './backend';
import { ParticleCameraFrame } from './particle-camera-frame';
import { ParticleInfluenceFrame } from './particle-influence-frame';

interface EmitterRuntime {
  emitter: ParticleEmitter;
  view: ParticleSystemView;
  started: boolean;
  killed: boolean;
  eventReady?: ParticleEventBatch;
  eventPending: boolean;
  lastEventReadRequest: number;
  routeCooldowns: Map<string, number>;
  influences: ParticleInfluenceFrame;
  updateOptions: {
    allowEmit: boolean;
    duration: number;
    looping: boolean;
    eventFlags: number;
  };
}

interface EffectorRuntime {
  effector: ParticleEffector;
  object: THREE.Object3D;
}

interface ColliderRuntime {
  collider: ParticleCollider;
  object: THREE.Object3D;
}

interface ParticleEventBatch {
  events: GpuParticleEvent[];
  time: number;
}

interface ParticleEventHit {
  type: ParticleEventType;
  slot: number;
  position: [number, number, number];
  velocity: [number, number, number];
  normal: [number, number, number];
  colliderId: string;
  speed: number;
  generation: number;
}

/** Runtime wrapper composing one ParticleSystemView per emitter. */
export class ParticleEffectView extends THREE.Object3D {
  readonly effect: ParticleEffect;
  readonly backendOptions: BackendOptions;
  private readonly runtimes = new Map<string, EmitterRuntime>();
  private readonly effectorRuntimes = new Map<string, EffectorRuntime>();
  private readonly colliderRuntimes = new Map<string, ColliderRuntime>();
  private readonly reconciliationIds = new Set<string>();
  private readonly cameraFrame = new ParticleCameraFrame();
  private time = 0;
  private state: PlayState = 'stopped';

  constructor(effect: ParticleEffect, opts: BackendOptions) {
    super();
    this.effect = effect;
    this.backendOptions = opts;
    this.name = 'ParticleEffect';
    this.refreshEmitters();
    this.refreshEffectors();
    this.refreshColliders();
  }

  get playState(): PlayState {
    return this.state;
  }

  getEmitterView(id: string): ParticleSystemView | undefined {
    return this.runtimes.get(id)?.view;
  }

  play(): void {
    this.state = 'playing';
    for (const runtime of this.runtimes.values()) {
      if (runtime.started) runtime.view.play();
    }
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    for (const runtime of this.runtimes.values()) runtime.view.pause();
  }

  stop(): void {
    this.state = 'stopped';
    this.time = 0;
    for (const runtime of this.runtimes.values()) {
      runtime.started = false;
      runtime.killed = false;
      runtime.eventReady = undefined;
      runtime.routeCooldowns.clear();
      runtime.view.stop();
    }
  }

  restart(): void {
    this.stop();
    this.play();
  }

  /** Sync runtime views after emitters are added, removed, or reordered. */
  refreshEmitters(): void {
    this.syncEventSpawnModes();
    const liveIds = this.reconciliationIds;
    liveIds.clear();
    for (const emitter of this.effect.emitters) liveIds.add(emitter.id);
    for (const [id, runtime] of this.runtimes) {
      if (!liveIds.has(id)) {
        runtime.view.dispose();
        runtime.view.removeFromParent();
        this.runtimes.delete(id);
      }
    }

    for (const emitter of this.effect.emitters) {
      let runtime = this.runtimes.get(emitter.id);
      if (!runtime) {
        const view = new ParticleSystemView(emitter.system, this.backendOptions);
        view.name = emitter.name;
        runtime = {
          emitter,
          view,
          started: false,
          killed: false,
          eventPending: false,
          lastEventReadRequest: -Infinity,
          routeCooldowns: new Map(),
          influences: new ParticleInfluenceFrame(),
          updateOptions: {
            allowEmit: false,
            duration: 0,
            looping: false,
            eventFlags: 0,
          },
        };
        this.runtimes.set(emitter.id, runtime);
        this.add(view);
      }
      runtime.emitter = emitter;
      runtime.view.name = emitter.name;
      applyEmitterTransform(runtime.view, emitter);
    }
  }

  private syncEventSpawnModes(): void {
    const targets = this.reconciliationIds;
    targets.clear();
    for (const emitter of this.effect.emitters) {
      for (const eventType of EVENT_TYPES) {
        const handler = emitter.eventHandlers[eventType];
        if (handler.enabled && handler.action === 'spawnSystem' && handler.targetEmitterId) {
          targets.add(handler.targetEmitterId);
        }
      }
    }
    for (const emitter of this.effect.emitters) {
      emitter.playbackMode = targets.has(emitter.id) ? 'event' : 'timeline';
    }
  }

  /** Sync runtime helper objects after effectors are added, removed, or reordered. */
  refreshEffectors(): void {
    const liveIds = this.reconciliationIds;
    liveIds.clear();
    for (const effector of this.effect.effectors) liveIds.add(effector.id);
    for (const [id, runtime] of this.effectorRuntimes) {
      if (!liveIds.has(id)) {
        runtime.object.removeFromParent();
        this.effectorRuntimes.delete(id);
      }
    }

    for (const effector of this.effect.effectors) {
      let runtime = this.effectorRuntimes.get(effector.id);
      if (!runtime) {
        const object = new THREE.Object3D();
        runtime = { effector, object };
        this.effectorRuntimes.set(effector.id, runtime);
        this.add(object);
      }
      runtime.effector = effector;
      runtime.object.name = effector.name;
      updateEffectorHelper(runtime.object, effector);
      applyEffectorTransform(runtime.object, effector, true);
    }
  }

  /** Sync runtime collider helper objects after colliders are added, removed, or reordered. */
  refreshColliders(): void {
    const liveIds = this.reconciliationIds;
    liveIds.clear();
    for (const collider of this.effect.colliders) liveIds.add(collider.id);
    for (const [id, runtime] of this.colliderRuntimes) {
      if (!liveIds.has(id)) {
        runtime.object.removeFromParent();
        this.colliderRuntimes.delete(id);
      }
    }

    for (const collider of this.effect.colliders) {
      let runtime = this.colliderRuntimes.get(collider.id);
      if (!runtime) {
        const object = new THREE.Object3D();
        runtime = { collider, object };
        this.colliderRuntimes.set(collider.id, runtime);
        this.add(object);
      }
      runtime.collider = collider;
      runtime.object.name = collider.name;
      updateColliderHelper(runtime.object, collider);
      applyColliderTransform(runtime.object, collider, true);
    }
  }

  tick(dt: number): void {
    if (this.state !== 'playing') return;

    const scaledDt = dt * this.effect.config.timeScale;
    this.advance(scaledDt);
  }

  private advance(scaledDt: number): void {
    const duration = this.effect.config.duration > 0 ? this.effect.config.duration : 0;
    const hasSolo = hasSoloEmitter(this.effect.emitters);
    this.time += scaledDt;

    if (duration > 0 && this.time >= duration) {
      if (this.effect.config.looping) {
        this.time %= duration;
        for (const runtime of this.runtimes.values()) {
          runtime.started = false;
          runtime.killed = false;
          runtime.view.stop();
          runtime.view.play();
        }
      } else {
        this.time = duration;
      }
    }

    for (const runtime of this.runtimes.values()) {
      const { emitter, view } = runtime;
      if (emitter.playbackMode === 'event') {
        if (!emitter.enabled || (hasSolo && !emitter.solo) || !runtime.started) continue;
        applyEmitterTransform(view, emitter);
        view.updateWorldMatrix(true, false);
        this.uploadInfluences(runtime);
        const options = runtime.updateOptions;
        options.allowEmit = false;
        options.duration = 0;
        options.looping = false;
        options.eventFlags = eventFlagsForEmitter(emitter);
        view.tick(scaledDt * emitter.timeScale, options);
        continue;
      }
      if (!emitter.enabled || (hasSolo && !emitter.solo)) continue;
      if (runtime.killed) continue;

      if (!runtime.started) {
        // Honour the emitter's start delay on the effect timeline (re-applies
        // on each loop of the effect, like a timeline clip offset).
        if (this.time < (emitter.startDelay ?? 0)) continue;
        runtime.started = true;
        view.restart();
      }
      applyEmitterTransform(view, emitter);
      view.updateWorldMatrix(true, false);
      this.uploadInfluences(runtime);
      const options = runtime.updateOptions;
      options.allowEmit = true;
      options.duration = Math.max(0, emitter.system.config.duration);
      options.looping = emitter.system.config.looping;
      options.eventFlags = eventFlagsForEmitter(emitter);
      view.tick(scaledDt * emitter.timeScale, options);
    }

    this.processParticleEvents();
    this.scheduleEventReads();
  }

  private processParticleEvents(): void {
    for (const source of this.runtimes.values()) {
      const ready = source.eventReady;
      if (!ready) continue;
      source.eventReady = undefined;

      this.stageInfluences(source);
      const colliderIds = source.influences.colliderIds;

      for (const eventType of EVENT_TYPES) {
        const handler = source.emitter.eventHandlers[eventType];
        if (!handler.enabled || handler.action === 'none') continue;
        this.processHandlerEvents(source, handler, ready, colliderIds);
      }
    }
  }

  private processHandlerEvents(
    source: EmitterRuntime,
    handler: ParticleEmitterEventHandler,
    batch: ParticleEventBatch,
    colliderIds: readonly string[],
  ): void {
    const target = handler.action === 'spawnSystem'
      ? this.runtimes.get(handler.targetEmitterId)
      : source;
    if ((handler.action === 'spawnSystem' || handler.action === 'spawnParticles') && !target) return;

    const routeKey = `${handler.event}:${handler.action}:${handler.targetEmitterId}:${handler.colliderId}`;
    const lastFire = source.routeCooldowns.get(routeKey) ?? -Infinity;
    if (handler.cooldown > 0 && batch.time - lastFire < handler.cooldown) return;

    const maxEvents = Math.max(1, Math.floor(handler.maxPerFrame));
    const spawns: CpuParticleSpawn[] = [];
    const killSlots: number[] = [];
    let eventCount = 0;

    for (const event of batch.events) {
      if (eventCount >= maxEvents) break;
      const hit = particleHitFromGpuEvent(event, handler.event, colliderIds);
      if (!hit || hit.speed < handler.minSpeed) continue;
      if (hit.generation >= Math.max(0, Math.floor(handler.maxGenerations))) continue;
      if (handler.colliderId && hit.colliderId !== handler.colliderId) continue;
      if (handler.probability < 1 && random01(hashU32(hit.slot ^ hashU32(Math.floor(batch.time * 1000)) ^ hashU32(handler.event.length))) > handler.probability) {
        continue;
      }
      if (handler.action === 'spawnSystem' || handler.action === 'spawnParticles') {
        const spawn = this.eventHitToSpawn(source, target!, hit);
        spawn.count = Math.max(1, Math.floor(handler.count));
        spawn.align = handler.align;
        spawn.inheritVelocity = handler.inheritVelocity;
        spawn.generation = hit.generation + 1;
        spawns.push(spawn);
      }
      if (handler.killSource || handler.action === 'killSource') killSlots.push(hit.slot);
      eventCount++;
      if (handler.cooldown > 0) break;
    }

    const killBeforeSpawn = killSlots.length > 0 && target === source;
    if (killBeforeSpawn) source.view.killParticleSlots(killSlots);

    if (spawns.length > 0 && target) {
      target.started = true;
      target.killed = false;
      target.view.play();
      applyEmitterTransform(target.view, target.emitter);
      target.view.updateWorldMatrix(true, false);
      target.view.injectParticles(spawns);
    }
    if (killSlots.length > 0 && !killBeforeSpawn) source.view.killParticleSlots(killSlots);
    if (spawns.length > 0 || killSlots.length > 0) source.routeCooldowns.set(routeKey, batch.time);
  }

  private eventHitToSpawn(source: EmitterRuntime, target: EmitterRuntime, hit: ParticleEventHit): CpuParticleSpawn {
    _eventPos.set(hit.position[0], hit.position[1], hit.position[2]);
    _eventVel.set(hit.velocity[0], hit.velocity[1], hit.velocity[2]);
    _eventNormal.set(hit.normal[0], hit.normal[1], hit.normal[2]);

    if (source.emitter.system.config.simulationSpace === 'local') {
      source.view.updateWorldMatrix(true, false);
      _normal.getNormalMatrix(source.view.matrixWorld);
      _eventPos.applyMatrix4(source.view.matrixWorld);
      _eventVel.applyMatrix3(_normal);
      _eventNormal.applyMatrix3(_normal).normalize();
    }

    if (target.emitter.system.config.simulationSpace === 'local') {
      target.view.updateWorldMatrix(true, false);
      _matrix.copy(target.view.matrixWorld).invert();
      _normal.getNormalMatrix(_matrix);
      _eventPos.applyMatrix4(_matrix);
      _eventVel.applyMatrix3(_normal);
      _eventNormal.applyMatrix3(_normal).normalize();
    }

    return {
      position: [_eventPos.x, _eventPos.y, _eventPos.z],
      velocity: [_eventVel.x, _eventVel.y, _eventVel.z],
      normal: [_eventNormal.x, _eventNormal.y, _eventNormal.z],
      count: 1,
      align: 'normal',
      inheritVelocity: 0,
      generation: hit.generation + 1,
    };
  }

  private scheduleEventReads(): void {
    for (const runtime of this.runtimes.values()) {
      if (!hasEnabledEventHandlers(runtime.emitter)) continue;
      if (runtime.eventPending) continue;
      if (this.time - runtime.lastEventReadRequest < EVENT_READ_RATE) continue;
      runtime.eventPending = true;
      runtime.lastEventReadRequest = this.time;
      const stamp = this.time;
      runtime.view.readParticleEvents()
        .then((events) => {
          if (this.runtimes.get(runtime.emitter.id) === runtime) {
            runtime.eventReady = { events, time: stamp };
          }
        })
        .catch((error) => {
          console.warn('[particles] event snapshot failed:', error);
        })
        .finally(() => {
          runtime.eventPending = false;
        });
    }
  }

  render(pass: GPURenderPassEncoder, camera: THREE.Camera, targetState?: PassTargetState): void {
    const hasSolo = hasSoloEmitter(this.effect.emitters);
    let cameraCaptured = false;
    for (const runtime of this.runtimes.values()) {
      if (!runtime.emitter.enabled || (hasSolo && !runtime.emitter.solo) || !runtime.started) continue;
      if (!cameraCaptured) {
        this.cameraFrame.capture(camera);
        cameraCaptured = true;
      }
      if (targetState) runtime.view.setPassTargetState(targetState);
      runtime.view.renderWithCameraFrame(pass, this.cameraFrame);
    }
  }

  /** Commit decoded resources from the host's admitted device-work lane. */
  commitPendingGpuResources(): void {
    for (const runtime of this.runtimes.values()) runtime.view.commitPendingGpuResources();
  }

  rebuild(): void {
    this.refreshEmitters();
    this.refreshEffectors();
    this.refreshColliders();
    for (const runtime of this.runtimes.values()) runtime.view.rebuild();
  }

  dispose(): void {
    for (const runtime of this.runtimes.values()) runtime.view.dispose();
    this.runtimes.clear();
    this.effectorRuntimes.clear();
    this.colliderRuntimes.clear();
  }

  private uploadInfluences(runtime: EmitterRuntime): void {
    this.stageInfluences(runtime);
    runtime.view.backend.setFieldEffectors(runtime.influences.fieldEffectors);
    runtime.view.backend.setParticleColliders(runtime.influences.colliders);
  }

  private stageInfluences(runtime: EmitterRuntime): void {
    const { emitter, influences, view } = runtime;
    influences.update(
      this.effect.effectors,
      this.effect.colliders,
      emitter.id,
      view.system.config.simulationSpace,
      view.matrixWorld,
    );
  }
}

function applyEmitterTransform(view: ParticleSystemView, emitter: ParticleEmitter): void {
  const { position, rotation, scale } = emitter.transform;
  view.position.set(position[0], position[1], position[2]);
  view.rotation.set(rotation[0], rotation[1], rotation[2]);
  view.scale.set(scale[0], scale[1], scale[2]);
}

function applyEffectorTransform(
  object: THREE.Object3D,
  effector: ParticleEffector,
  helpersVisible: boolean,
): void {
  const { position, rotation, scale } = effector.transform;
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  object.scale.set(scale[0], scale[1], scale[2]);
  object.visible = effector.enabled && helpersVisible;
}

function applyColliderTransform(
  object: THREE.Object3D,
  collider: ParticleCollider,
  helpersVisible: boolean,
): void {
  const { position, rotation, scale } = collider.transform;
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  object.scale.set(scale[0], scale[1], scale[2]);
  object.visible = collider.enabled && helpersVisible;
}

function updateEffectorHelper(object: THREE.Object3D, effector: ParticleEffector): void {
  const key = `${effector.shape}:${effector.radius}:${effector.size.join(',')}:${effector.direction.join(',')}`;
  if (object.userData.helperKey === key) return;
  for (const child of object.children) {
    const line = child as THREE.LineSegments;
    line.geometry?.dispose();
    const material = line.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material?.dispose();
    }
  }
  object.clear();
  const geometry = effector.shape === 'box'
    ? new THREE.EdgesGeometry(new THREE.BoxGeometry(effector.size[0], effector.size[1], effector.size[2]))
    : new THREE.WireframeGeometry(new THREE.SphereGeometry(effector.radius, 16, 8));
  const material = new THREE.LineBasicMaterial({ color: 0x74c69d, transparent: true, opacity: 0.7 });
  object.add(new THREE.LineSegments(geometry, material));
  const axis = new THREE.Vector3(effector.direction[0], effector.direction[1], effector.direction[2]).normalize();
  const length = effector.shape === 'box'
    ? Math.max(effector.size[0], effector.size[1], effector.size[2])
    : effector.radius * 2;
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    axis.clone().multiplyScalar(-length * 0.5),
    axis.clone().multiplyScalar(length * 0.5),
  ]);
  const axisMaterial = new THREE.LineBasicMaterial({ color: 0x7fb3ff, transparent: true, opacity: 0.95 });
  object.add(new THREE.LineSegments(axisGeometry, axisMaterial));
  object.userData.helperKey = key;
}

function updateColliderHelper(object: THREE.Object3D, collider: ParticleCollider): void {
  const key = `${collider.type}:${collider.radius}:${collider.size.join(',')}`;
  if (object.userData.helperKey === key) return;
  disposeChildren(object);
  object.clear();
  const material = new THREE.LineBasicMaterial({ color: 0xd8a050, transparent: true, opacity: 0.82 });
  if (collider.type === 'sphere') {
    object.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(collider.radius, 16, 8)), material));
  } else if (collider.type === 'box') {
    object.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(collider.size[0], collider.size[1], collider.size[2])), material));
  } else {
    const grid = new THREE.GridHelper(6, 12, 0xd8a050, 0x6b5135);
    grid.material = material;
    object.add(grid);
  }
  object.userData.helperKey = key;
}

function particleHitFromGpuEvent(
  event: GpuParticleEvent,
  expected: ParticleEventType,
  colliderIds: readonly string[],
): ParticleEventHit | null {
  if (event.type !== expected) return null;
  const colliderId = event.colliderIndex === 0xffffffff ? undefined : colliderIds[event.colliderIndex];
  if (event.type === 'collision' && colliderId === undefined) return null;
  return {
    type: event.type,
    slot: event.slot,
    position: event.position,
    velocity: event.velocity,
    normal: event.normal,
    colliderId: colliderId ?? '',
    speed: event.speed,
    generation: event.generation,
  };
}

function hasEnabledEventHandlers(emitter: ParticleEmitter): boolean {
  for (const eventType of EVENT_TYPES) {
    const handler = emitter.eventHandlers[eventType];
    if (handler.enabled && handler.action !== 'none') return true;
  }
  return false;
}

function hasSoloEmitter(emitters: readonly ParticleEmitter[]): boolean {
  for (const emitter of emitters) {
    if (emitter.solo) return true;
  }
  return false;
}

function eventFlagsForEmitter(emitter: ParticleEmitter): number {
  let flags = 0;
  if (emitter.eventHandlers.birth.enabled && emitter.eventHandlers.birth.action !== 'none') flags |= 1;
  if (emitter.eventHandlers.death.enabled && emitter.eventHandlers.death.action !== 'none') flags |= 2;
  if (emitter.eventHandlers.collision.enabled && emitter.eventHandlers.collision.action !== 'none') flags |= 4;
  return flags;
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

function disposeChildren(object: THREE.Object3D): void {
  for (const child of object.children) {
    const maybe = child as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    maybe.geometry?.dispose();
    const material = maybe.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material?.dispose();
    }
  }
}

const _matrix = new THREE.Matrix4();
const _normal = new THREE.Matrix3();
const _eventPos = new THREE.Vector3();
const _eventVel = new THREE.Vector3();
const _eventNormal = new THREE.Vector3();
const EVENT_TYPES = ['birth', 'collision', 'death'] as const;
const EVENT_READ_RATE = 1 / 30;
