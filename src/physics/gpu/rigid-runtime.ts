import type { RigidBodyCommand } from "./rigid-body-commands";
import type { RigidRuntimeResources } from "./rigid-runtime-resources";
import { RIGID_LAYOUT } from "./rigid-layout";

type PoseTargets = { position: GPUBuffer; orientation: GPUBuffer };

/** Owns one GPU world. Every submission is invoked by the shared device-task lane. */
export class RigidGpuRuntime {
  get bodySlots() { return this.resources.bodySlots; }
  readonly initialPositions: Float32Array;
  readonly initialOrientations: Float32Array;
  readonly capacity: { bodyCount: number; maxPairs: number; maxManifolds: number };
  private targets: PoseTargets | null = null;
  private disposed = false;
  private retirement: Promise<void> | null = null;
  private lastSubmission: Promise<unknown> = Promise.resolve();

  constructor(private readonly device: GPUDevice, private readonly resources: RigidRuntimeResources) {
    this.initialPositions = this.resources.initialPositions;
    this.initialOrientations = this.resources.initialOrientations;
    this.capacity = this.resources.capacity;
  }

  runRigidSolverBatch(stepCount: number): void {
    this.assertLive();
    if (!Number.isInteger(stepCount) || stepCount < 1 || stepCount > 64) throw new Error("Rigid batch requires 1–64 fixed ticks.");
    const encoder = this.device.createCommandEncoder({ label: "physics.impulse.ticks" });
    this.resources.checkHealth?.();
    this.resources.encode(encoder, stepCount);
    this.encodePoseCopy(encoder);
    this.device.queue.submit([encoder.finish()]);
    this.resources.afterSubmit?.();
  }

  setPoseTargets(targets: PoseTargets | null): void {
    const bytes = this.capacity.bodyCount * RIGID_LAYOUT.poseBytes;
    if (targets && (targets.position.size < bytes || targets.orientation.size < bytes)) {
      throw new Error("Rigid pose targets are smaller than the world's body capacity.");
    }
    this.targets = targets;
  }

  publishPoseTargets(): void {
    this.assertLive();
    if (!this.targets) return;
    const encoder = this.device.createCommandEncoder({ label: "physics.impulse.publish" });
    this.encodePoseCopy(encoder);
    this.device.queue.submit([encoder.finish()]);
  }

  queueBodyCommand(command: RigidBodyCommand): void {
    this.assertLive();
    if (!this.resources.queueBodyCommand) throw new Error("Runtime body commands are unavailable.");
    this.resources.queueBodyCommand(command);
  }
  readEvents() {
    this.assertLive();
    if (!this.resources.readEvents) throw new Error("Physics events are unavailable.");
    return this.resources.readEvents().then((batch) => ({ ...batch, events: batch.events.filter((event) =>
      (event.aGeneration ?? 0) === (this.bodySlots?.generation(event.a) ?? 0)
      && (event.bGeneration ?? 0) === (this.bodySlots?.generation(event.b) ?? 0)) }));
  }

  writeKinematicBodyPose(body: number, position: readonly [number, number, number], orientation: readonly [number, number, number, number]): void {
    this.queueBodyCommand({ kind: "kinematic-target", body, position, orientation });
  }

  retainUntil(retirement: Promise<unknown>): void {
    this.lastSubmission = retirement;
  }

  disposeWhenIdle(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.retirement ??= this.lastSubmission.then(() => undefined).finally(() => this.dispose());
    return this.retirement;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.targets = null;
    this.resources.destroy();
  }

  private encodePoseCopy(encoder: GPUCommandEncoder): void {
    if (!this.targets) return;
    const bytes = this.capacity.bodyCount * RIGID_LAYOUT.poseBytes;
    encoder.copyBufferToBuffer(this.resources.position, 0, this.targets.position, 0, bytes);
    encoder.copyBufferToBuffer(this.resources.orientation, 0, this.targets.orientation, 0, bytes);
  }

  private assertLive(): void {
    if (this.disposed || this.retirement) throw new Error("Rigid GPU world has been released.");
  }
}
