import type { BehaviorComponent } from "../../behaviors/domain/behavior-component";
import type { RuntimeModel } from "./runtime-model";
import type { RuntimePrimitive } from "./runtime-primitive";
import type { EntityTransform } from "./entity-transform";
import type { EntityTagQuery } from "./entity-tags";
import type { RuntimeCharacter } from "../../character-controller/domain/runtime-character";
/** Runtime-only identity. Never serialize handles or use them across Play sessions. */
export type EntityHandle = Readonly<{ world: symbol; slot: number; generation: number }>;
export type WorldEntity = Readonly<{
  handle: EntityHandle;
  name: string;
  tags: readonly string[];
  authoredId?: string;
  /** Captured saved declarations; runtime instances belong to the behavior host. */
  behaviors?: BehaviorComponent;
  components: readonly string[];
  model?: RuntimeModel;
  primitive?: RuntimePrimitive;
  character?: RuntimeCharacter;
  parent?: EntityHandle;
  transform?: EntityTransform;
}>;
export type EntityCommand =
  | Readonly<{ op: "create"; key: string; name: string; tags?: readonly string[]; behaviors?: BehaviorComponent; components?: readonly string[]; model?: RuntimeModel; primitive?: RuntimePrimitive; character?: RuntimeCharacter; parentKey?: string; transform?: EntityTransform }>
  | Readonly<{ op: "setTags"; handle: EntityHandle; tags: readonly string[] }>
  | Readonly<{ op: "destroy" | "destroySubtree"; handle: EntityHandle }>;
export type EntityErrorCode = "world-ended" | "stale-handle" | "invalid-command" | "capacity"
  | "unsupported-component" | "missing-dependency" | "missing-asset" | "authored-entity" | "backend-failed";
export class EntityWorldError extends Error {
  constructor(readonly code: EntityErrorCode, message: string) { super(message); this.name = "EntityWorldError"; }
}
export type EntityBatchState =
  | Readonly<{ status: "queued" | "preparing" | "ready" }>
  | Readonly<{ status: "committed"; tick: number; created: Readonly<Record<string, EntityHandle>>; removed: number }>
  | Readonly<{ status: "rejected"; code: EntityErrorCode; message: string }>;
export type EntityBatch = Readonly<{ read: () => EntityBatchState }>;
export type EntityWorldStats = Readonly<{
  alive: number; runtime: number; allocatedSlots: number; capacity: number;
  retiring: number; quarantined: number; dormant: number; reserved: number; queuedCommands: number; ended: boolean;
  tagKinds: number; tagMemberships: number;
}>;
export type EntityWorld = Readonly<{
  /** Definitions captured from project settings for this Play session. */
  tagNames: readonly string[];
  findByAuthoredId: (id: string) => EntityHandle | undefined;
  isAlive: (handle: EntityHandle) => boolean;
  inspect: (handle: EntityHandle) => WorldEntity;
  /** Active entities only; explicit bounded snapshot, with total/overflow information. */
  queryTag: (tag: string, limit: number) => EntityTagQuery;
  /** FIFO, atomic batches; at most one batch begins/commits per fixed tick. */
  submit: (commands: readonly EntityCommand[]) => EntityBatch;
  /** Destroy an object and its descendants atomically at a fixed tick (128 nodes maximum). */
  destroy: (handle: EntityHandle) => EntityBatch;
  stats: () => EntityWorldStats;
}>;
