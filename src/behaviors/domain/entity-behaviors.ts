import type { EntityHandle } from "../../world/domain/entity-world";

export const ENTITY_BEHAVIOR_LIMITS = Object.freeze({ attachments: 256, perEntity: 8, cleanups: 32, queuedCommands: 256 });
export type EntityBehaviorTick = Readonly<{ index: number; deltaSeconds: number; elapsedSeconds: number }>;
export type EntityBehaviorDisposeReason = "detached" | "entity-removed" | "world-ended" | "failed";
export type EntityBehaviorPhase = "create" | "onEnable" | "start" | "fixedUpdate" | "onDisable" | "dispose" | "cleanup";
export type EntityBehaviorDiagnostic = Readonly<{
  entity: EntityHandle; name: string; phase: EntityBehaviorPhase; message: string;
}>;
export type EntityBehaviorScope = Readonly<{
  entity: EntityHandle;
  signal: AbortSignal;
  /** Attachment-owned resources; late registrations are cleaned immediately. */
  defer: (cleanup: () => void) => void;
}>;
export type EntityBehaviorInstance = Readonly<{
  start?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
  fixedUpdate?: (tick: EntityBehaviorTick) => void;
  dispose: (reason: EntityBehaviorDisposeReason) => void;
}>;
export type EntityBehaviorDefinition = Readonly<{
  name: string;
  /** All lifecycle callbacks, including this factory, are synchronous. */
  create: (scope: EntityBehaviorScope) => EntityBehaviorInstance;
}>;
export type EntityBehaviorState = Readonly<{
  status: "queued" | "active" | "disabled" | "disposed" | "failed";
  enabled: boolean; started: boolean;
  reason?: EntityBehaviorDisposeReason; message?: string;
}>;
export type EntityBehaviorAttachment = Readonly<{
  entity: EntityHandle; name: string;
  read: () => EntityBehaviorState;
  /** Requests preserve FIFO order and apply at the next beginTick boundary. */
  setEnabled: (enabled: boolean) => void;
  detach: () => void;
}>;
export type EntityBehaviorStats = Readonly<{
  attached: number; pending: number; enabled: number; capacity: number; ended: boolean;
}>;
export type EntityBehaviors = Readonly<{
  attach: (entity: EntityHandle, definition: EntityBehaviorDefinition, options?: Readonly<{ enabled?: boolean }>) => EntityBehaviorAttachment;
  /** O(1) live attachment lookup. Saved declaration names are `saved:${entry.id}`. */
  find: (entity: EntityHandle, name: string) => EntityBehaviorAttachment | undefined;
  stats: () => EntityBehaviorStats;
}>;
export class EntityBehaviorError extends Error {
  constructor(readonly code: "world-ended" | "stale-attachment" | "invalid-behavior" | "capacity", message: string) {
    super(message); this.name = "EntityBehaviorError";
  }
}
