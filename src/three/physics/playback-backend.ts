import type { RigidBodyCommand } from "../../physics/gpu/rigid-body-commands";
import type { RigidEventBatch } from "../../physics/gpu/rigid-events";
import type { CompiledPhysicsScene } from "../../physics/runtime/contracts";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import type { RigidBodySlotPort } from "../../physics/runtime/rigid-body-slots";

/** GPU adapter port. GPU objects never escape into authoring/gameplay contracts. */
export type PhysicsPlaybackSolver = {
  initialPositions: Float32Array;
  initialOrientations: Float32Array;
  capacity: { bodyCount: number; maxPairs: number; maxManifolds: number };
  bodySlots?: RigidBodySlotPort;
  runRigidSolverBatch: (stepCount: number) => void;
  setPoseTargets: (targets: { position: GPUBuffer; orientation: GPUBuffer } | null) => void;
  queueBodyCommand?: (command: RigidBodyCommand) => void;
  readEvents?: () => Promise<RigidEventBatch>;
  publishPoseTargets: () => void;
  retainUntil?: (retirement: Promise<unknown>) => void;
  /** Existing character adapter supplies editor-space targets. */
  writeKinematicBodyPose: (index: number, position: readonly [number, number, number], orientation: readonly [number, number, number, number]) => void;
  dispose: () => void;
  disposeWhenIdle: () => Promise<void>;
};

export type PhysicsPlaybackFactory = {
  createWorld: (compiled: CompiledPhysicsScene, runtimeBodyCapacity?: number) => {
    runtime: PhysicsPlaybackSolver;
    bodyBindings: PhysicsBodyBinding[];
  };
};

export type PhysicsPlaybackBackend = {
  id: "impulse";
  prepare: (device: GPUDevice) => Promise<PhysicsPlaybackFactory>;
};
