import type { GameContext } from "../../gameplay/domain/game-module";
import type { EntityHandle } from "../../world/domain/entity-world";
import type { BehaviorEntityReference, BehaviorValues } from "./behavior-component";
import type { EntityBehaviorInstance, EntityBehaviorScope } from "./entity-behaviors";

type BehaviorFieldIdentity = Readonly<{ key: string; label: string }>;
export type BehaviorField = BehaviorFieldIdentity & (
  | Readonly<{ kind: "number"; default: number; min?: number; max?: number }>
  | Readonly<{ kind: "string"; default: string; maxLength?: number }>
  | Readonly<{ kind: "boolean"; default: boolean }>
  | Readonly<{ kind: "entity"; default: BehaviorEntityReference | null }>
);
export type RegisteredBehaviorScope = EntityBehaviorScope & Readonly<{
  /** References resolve within the captured scene or this prefab instance only. */
  resolveEntity: (reference: BehaviorEntityReference | null) => EntityHandle | undefined;
}>;
export type BehaviorRegistration = Readonly<{
  id: string;
  label: string;
  description?: string;
  version: number;
  fields: readonly BehaviorField[];
  create: (scope: RegisteredBehaviorScope, values: BehaviorValues, context: GameContext) => EntityBehaviorInstance;
}>;
