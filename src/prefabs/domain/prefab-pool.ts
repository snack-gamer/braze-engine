import type { EntityBatch } from "../../world/domain/entity-world";
import type { PrefabBatch, PrefabInstance, PrefabPlacement } from "./runtime-prefab";

export type PrefabPoolStats = Readonly<{
  capacity: number; active: number; available: number; pending: number; quarantined: number;
  retained: number; acquisitions: number; reuses: number; disposed: boolean; ended: boolean;
}>;
/** Fixed maximum, lazy allocation, retained slots. Release is atomic at a fixed tick. */
export type PrefabPool = Readonly<{
  acquire: (placement?: PrefabPlacement) => PrefabBatch;
  release: (instance: PrefabInstance) => EntityBatch;
  isAlive: (instance: PrefabInstance) => boolean;
  stats: () => PrefabPoolStats;
  /** Requires every lease returned and its retirement complete. Stop owns unconditional cleanup. */
  dispose: () => void;
}>;
