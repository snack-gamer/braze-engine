import type { EntityHandle } from "../../world/domain/entity-world";
import type { AnimationEvent } from "../../character/domain/animation-clip";

export type GameAnimationSnapshot = Readonly<{
  controllerId: string;
  parameters: Readonly<Record<string, number | boolean>>;
  layers: readonly Readonly<{ layerId: string; currentStateId: string; stateTimeSeconds: number }>[];
}>;
export type GameAnimationEvent = Readonly<{
  entity: EntityHandle;
  kind: "clip" | "state";
  layerId: string;
  event: Readonly<AnimationEvent>;
}>;
/** Runtime-only commands address live entities. A null snapshot means the Animator is still loading or absent. */
export type GameAnimation = Readonly<{
  snapshot: (entity: EntityHandle) => GameAnimationSnapshot | null;
  setFloat: (entity: EntityHandle, parameterId: string, value: number) => void;
  setInt: (entity: EntityHandle, parameterId: string, value: number) => void;
  setBool: (entity: EntityHandle, parameterId: string, value: boolean) => void;
  setTrigger: (entity: EntityHandle, parameterId: string) => void;
  resetTrigger: (entity: EntityHandle, parameterId: string) => void;
  subscribe: (listener: (event: GameAnimationEvent) => void) => () => void;
}>;
