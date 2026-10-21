import type { BehaviorRegistration } from "../../behaviors/domain/behavior-registration";
import type { GameInput, InputActionMap } from "../../input/domain/action-map";
import type { EntityWorld } from "../../world/domain/entity-world";
import type { RuntimePrefabs } from "../../prefabs/domain/runtime-prefab";
import type { EntityBehaviors, EntityBehaviorDiagnostic } from "../../behaviors/domain/entity-behaviors";
import type { GameCamera } from "../../camera/domain/game-camera";
import type { GameUi } from "../../game-ui/domain/game-ui";

import type { GameAnimation } from "./game-animation";
import type { GameCharacters } from "../../character-controller/domain/game-character-commands";
export type { GameCharacterResult } from "../../character-controller/domain/game-character-commands";

export type GameVec3 = readonly [number, number, number];
export type GameCameraPose = Readonly<{ position: GameVec3; target: GameVec3; fov: number }>;
export type GameEntity = Readonly<{
  id: string;
  name: string;
  parentId?: string | null;
  /** Authored tags captured at Play; world.inspect/queryTag observe runtime edits. */
  tags?: readonly string[];
  kind: string;
  /** Authored local position at session capture; never a live dynamic pose. */
  authoredPosition: GameVec3;
  character: boolean;
}>;
export type GameEvent = Readonly<{ type: string; targetId?: string; payload?: Readonly<Record<string, string | number | boolean | null>> }>;
export type GameEventPort = Readonly<{
  emit: (event: GameEvent) => void;
  subscribe: (type: string, listener: (event: GameEvent) => void) => () => void;
}>;
export type GameContext = Readonly<{
  signal: AbortSignal;
  entities: readonly GameEntity[];
  world: EntityWorld;
  prefabs: RuntimePrefabs;
  animation: GameAnimation;
  behaviors: EntityBehaviors;
  input: GameInput;
  events: GameEventPort;
  camera: GameCamera;
  characters: GameCharacters;
  ui: GameUi;
  /** Register ownership immediately, even while asynchronous create() is pending. */
  defer: (cleanup: () => void) => void;
}>;
export type GameTick = Readonly<{ index: number; deltaSeconds: number; elapsedSeconds: number }>;
export type GameFrame = Readonly<{ deltaSeconds: number; interpolationAlpha: number }>;
export type GameInstance = Readonly<{
  fixedUpdate?: (tick: GameTick) => void;
  update?: (frame: GameFrame) => void;
  dispose: () => void;
}>;
export type GameModule = Readonly<{
  version: 1;
  input?: InputActionMap;
  /** Project factories for saved per-object behavior declarations. Captured once per Play. */
  behaviors?: readonly BehaviorRegistration[];
  create: (context: GameContext) => GameInstance | Promise<GameInstance>;
}>;
export type GameplayDiagnostic = Readonly<{
  code: "gameplay-start-failed" | "gameplay-update-failed" | "gameplay-cleanup-failed" | "gameplay-time-dropped" | "entity-behavior-failed";
  message: string;
  behavior?: EntityBehaviorDiagnostic;
}>;
