import type { BehaviorRegistration, RegisteredBehaviorScope } from "../../behaviors/domain/behavior-registration";
import type { BehaviorValues } from "../../behaviors/domain/behavior-component";
import type { EntityBehaviorDisposeReason, EntityBehaviorInstance } from "../../behaviors/domain/entity-behaviors";
import type { GameContext, GameModule } from "../../gameplay/domain/game-module";

/** Optional base for project JavaScript classes. The existing behavior host owns its lifetime. */
export class ScriptBehavior implements EntityBehaviorInstance {
  constructor(
    readonly scope: RegisteredBehaviorScope,
    readonly values: BehaviorValues,
    readonly context: GameContext,
  ) {}

  /** Override to release resources; scope.defer also participates in the host's cleanup. */
  dispose(_reason: EntityBehaviorDisposeReason): void {}
}

export type ScriptBehaviorConstructor = new (
  scope: RegisteredBehaviorScope, values: BehaviorValues, context: GameContext,
) => EntityBehaviorInstance;
export type ScriptBehaviorMetadata = Omit<BehaviorRegistration, "create">;

/** Register a class with the same versioned fields and Inspector as factory behaviors. */
export function defineBehavior(metadata: ScriptBehaviorMetadata, Behavior: ScriptBehaviorConstructor): BehaviorRegistration {
  return Object.freeze({ ...metadata, create: (scope: RegisteredBehaviorScope, values: BehaviorValues, context: GameContext) =>
    new Behavior(scope, values, context) });
}

/** JavaScript-friendly entry declaration; instances still belong to the ordinary Play host. */
export function defineGame(module: Omit<GameModule, "version">): GameModule {
  return Object.freeze({ ...module, version: 1 });
}
