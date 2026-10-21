/** Commands run inside device admission, immediately before each solver submission. */
export type PhysicsFixedStepDriver = Readonly<{
  runtimeBodyCapacity?: number;
  ready: () => boolean;
  /** False stops this batch, e.g. after a gameplay failure. No GPU completion wait. */
  beforeStep: (tick: Readonly<{ index: number; deltaSeconds: number; elapsedSeconds: number }>) => boolean;
}>;
