import type { RigidBodyCommand } from "./rigid-body-commands";
import type { RigidEventBatch } from "./rigid-events";
import type { RigidBodySlotPort } from "../runtime/rigid-body-slots";
/** A solver schedule owns its buffers; the shared runtime owns submission and publication. */
export type RigidRuntimeResources = {
  position: GPUBuffer;
  orientation: GPUBuffer;
  initialPositions: Float32Array;
  initialOrientations: Float32Array;
  capacity: { bodyCount: number; maxPairs: number; maxManifolds: number };
  bodySlots?: RigidBodySlotPort;
  queueBodyCommand?: (command: RigidBodyCommand) => void;
  readEvents?: () => Promise<RigidEventBatch>;
  encode: (encoder: GPUCommandEncoder, ticks: number) => void;
  checkHealth?: () => void;
  afterSubmit?: () => void;
  destroy: () => void;
};
