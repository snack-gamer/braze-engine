import type { ParticleSystem } from '@particles/core';
import * as THREE from 'three';
import {
  ParticleBackend,
  type BackendOptions,
  type BackendUpdateOptions,
  type CpuParticleSpawn,
  type GpuParticleEvent,
  type PassTargetState,
  type PlayState,
} from './backend';
import { ParticleCameraFrame } from './particle-camera-frame';

const _identity = new THREE.Matrix4();
const EMPTY_UPDATE_OPTIONS: BackendUpdateOptions = {};

/**
 * High-level wrapper. Extends THREE.Object3D so it composes naturally into any
 * Three.js scene graph: parent it to a car wheel, a hand bone, a planet — the
 * particle system follows along.
 *
 * Two simulation spaces are supported (via system.config.simulationSpace):
 *  - 'local'  — particles store local-space positions; render applies the world matrix,
 *               so moving the parent moves all live particles with it.
 *  - 'world'  — the world matrix is baked into the spawn so particles detach once born;
 *               new particles spawn at the parent's current world position but old ones
 *               stay where they were (Unity-style trail / smoke behavior).
 */
export class ParticleSystemView extends THREE.Object3D {
  readonly system: ParticleSystem;
  readonly backend: ParticleBackend;
  private directCameraFrame: ParticleCameraFrame | null = null;
  private readonly emitTransform = new Float32Array(16);
  private readonly renderModel = new Float32Array(16);

  constructor(system: ParticleSystem, opts: BackendOptions) {
    super();
    this.system = system;
    this.backend = new ParticleBackend(system, opts);
    this.name = 'ParticleSystem';
  }

  // --- transport ----------------------------------------------------------

  play(): void {
    this.backend.playState = 'playing';
  }

  pause(): void {
    if (this.backend.playState === 'playing') this.backend.playState = 'paused';
  }

  stop(): void {
    this.backend.playState = 'stopped';
    this.backend.reset();
  }

  get playState(): PlayState {
    return this.backend.playState;
  }

  /** True iff this is a non-looping system that has reached its duration. */
  get hasFinished(): boolean {
    return this.backend.hasFinished;
  }

  /** Stop + play. Re-auditions a one-shot from frame zero with current configs. */
  restart(): void {
    this.stop();
    this.play();
  }

  // --- frame loop ---------------------------------------------------------

  /** Run emit + simulate compute passes. Submits its own encoder. */
  tick(dt: number, opts: BackendUpdateOptions = EMPTY_UPDATE_OPTIONS): void {
    // Make sure our world matrix is current for the emit transform.
    this.updateWorldMatrix(true, false);
    this.bakeEmitTransform();

    const encoder = this.backend.device.createCommandEncoder({ label: 'particles_tick' });
    this.backend.update(dt, encoder, opts);
    this.backend.device.queue.submit([encoder.finish()]);
  }

  readParticleEvents(): Promise<GpuParticleEvent[]> {
    return this.backend.readParticleEvents();
  }

  injectParticles(spawns: CpuParticleSpawn[]): number {
    return this.backend.injectParticles(spawns);
  }

  killParticleSlots(slots: Iterable<number>): void {
    this.backend.killParticleSlots(slots);
  }

  /** Match render pipelines to the attachment state of the host pass. */
  setPassTargetState(state: PassTargetState): void {
    this.backend.setPassTargetState(state);
  }

  /** Commit decoded resources from the host's admitted device-work lane. */
  commitPendingGpuResources(): void {
    this.backend.commitPendingGpuResources();
  }

  /** Record draw commands into an existing render pass. */
  render(pass: GPURenderPassEncoder, camera: THREE.Camera): void {
    const cameraFrame = this.directCameraFrame ??= new ParticleCameraFrame();
    cameraFrame.capture(camera);
    this.renderWithCameraFrame(pass, cameraFrame);
  }

  /** Record using camera data captured once by a multi-emitter effect. */
  renderWithCameraFrame(pass: GPURenderPassEncoder, cameraFrame: ParticleCameraFrame): void {
    this.updateWorldMatrix(true, false);
    // In local mode the model matrix transforms the locally-stored particles into world.
    // In world mode positions are already in world space — render with identity.
    const useIdentity = this.system.config.simulationSpace === 'world';
    const modelSrc = useIdentity ? _identity.elements : this.matrixWorld.elements;
    this.renderModel.set(modelSrc);

    this.backend.render(
      pass,
      cameraFrame.viewProjection,
      this.renderModel,
      cameraFrame.right,
      cameraFrame.up,
    );
  }

  /** Rebuild compute pipelines after adding/removing/toggling modules. */
  rebuild(): void {
    this.backend.compile();
  }

  dispose(): void {
    this.backend.destroy();
  }

  // --- internals ----------------------------------------------------------

  private bakeEmitTransform(): void {
    // 'world' simulation bakes the parent's transform into the spawn.
    // 'local' simulation spawns in local space and applies the transform at render time.
    if (this.system.config.simulationSpace === 'world') {
      this.emitTransform.set(this.matrixWorld.elements);
    } else {
      this.emitTransform.set(_identity.elements);
    }
    this.backend.setEmitTransform(this.emitTransform);
  }
}
