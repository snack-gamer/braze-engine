import type { RuntimePrefabResources } from "./runtime-prefab-resources";
import type { PrefabPool } from "./prefab-pool";
import type { AssetRef } from "../../assets/domain/asset-reference";
import type { EntityBatch, EntityBatchState, EntityHandle } from "../../world/domain/entity-world";
import type { EntityTransform } from "../../world/domain/entity-transform";

/** Saved source captured at Play startup; never an editor draft or a URL identity. */
export type RuntimePrefabSource = Readonly<{ asset: AssetRef; name: string; revision: string; document: unknown; resources?: RuntimePrefabResources }>;
export type PrefabPlacement = Readonly<Partial<EntityTransform>>;
export type PrefabInstance = Readonly<{
  asset: Readonly<AssetRef>; revision: string; root: EntityHandle;
  /** Saved node IDs map to this instance's fresh, world-scoped handles. */
  entities: Readonly<Record<string, EntityHandle>>;
}>;
export type PrefabBatchState = Exclude<EntityBatchState, { status: "committed" }>
  | Readonly<{ status: "committed"; tick: number; instance: PrefabInstance }>;
export type PrefabBatch = Readonly<{ read: () => PrefabBatchState }>;
export type RuntimePrefabs = Readonly<{
  list: () => readonly Readonly<{ asset: Readonly<AssetRef>; name: string; revision: string; nodes: number }>[];
  instantiate: (asset: AssetRef, placement?: PrefabPlacement) => PrefabBatch;
  destroy: (instance: PrefabInstance) => EntityBatch;
  isAlive: (instance: PrefabInstance) => boolean;
  createPool: (asset: AssetRef, options: Readonly<{ capacity: number }>) => PrefabPool;
}>;
