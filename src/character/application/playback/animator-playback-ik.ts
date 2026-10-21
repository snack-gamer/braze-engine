import type { CharacterQuaternion, CharacterVector3 } from "../../domain/character-values";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

export const HUMANOID_IK_GOALS = ["leftFoot", "rightFoot", "leftHand", "rightHand"] as const;
export type HumanoidIkGoalName = typeof HUMANOID_IK_GOALS[number];

export type HumanoidIkGoal = Readonly<{
  goal: HumanoidIkGoalName;
  position?: CharacterVector3;
  rotation?: CharacterQuaternion;
  positionWeight: number;
  rotationWeight: number;
  hintPosition?: CharacterVector3;
  hintWeight?: number;
}>;

export type AnimatorIkCommandPort = Readonly<{
  setGoal: (
    characterId: string,
    layerId: string,
    value: HumanoidIkGoal,
  ) => CharacterRuntimeResult<void>;
  clearGoal: (characterId: string, layerId: string, goal: HumanoidIkGoalName) => void;
  clearLayer: (characterId: string, layerId: string) => void;
  clearCharacter: (characterId: string) => void;
}>;

export type AnimatorIkGoalStore = Readonly<{
  commands: AnimatorIkCommandPort;
  goals: (characterId: string, layerId: string) => readonly HumanoidIkGoal[];
  dispose: () => void;
}>;

const MAX_IK_CHARACTERS = 32;
const MAX_IK_LAYERS_PER_CHARACTER = 32;

/** Owns bounded, runtime-only IK goals addressed through one world gameplay binding. */
export function createAnimatorIkGoalStore(): AnimatorIkGoalStore {
  const characters = new Map<string, Map<string, Map<HumanoidIkGoalName, HumanoidIkGoal>>>();
  const commands: AnimatorIkCommandPort = {
    setGoal: (characterId, layerId, value) => {
      const validation = validateGoalAddress(characterId, layerId, value);
      if (validation.value === null) return validation;
      let layers = characters.get(characterId);
      if (!layers) {
        if (characters.size >= MAX_IK_CHARACTERS) return capacityFailure("characters", MAX_IK_CHARACTERS);
        layers = new Map();
        characters.set(characterId, layers);
      }
      let goals = layers.get(layerId);
      if (!goals) {
        if (layers.size >= MAX_IK_LAYERS_PER_CHARACTER) {
          return capacityFailure("IK layers per character", MAX_IK_LAYERS_PER_CHARACTER);
        }
        goals = new Map();
        layers.set(layerId, goals);
      }
      goals.set(value.goal, cloneGoal(value));
      return characterRuntimeSuccess(undefined);
    },
    clearGoal: (characterId, layerId, goal) => {
      const layers = characters.get(characterId);
      const goals = layers?.get(layerId);
      goals?.delete(goal);
      if (goals?.size === 0) layers?.delete(layerId);
      if (layers?.size === 0) characters.delete(characterId);
    },
    clearLayer: (characterId, layerId) => {
      const layers = characters.get(characterId);
      layers?.delete(layerId);
      if (layers?.size === 0) characters.delete(characterId);
    },
    clearCharacter: (characterId) => characters.delete(characterId),
  };
  return {
    commands,
    goals: (characterId, layerId) => [...(characters.get(characterId)?.get(layerId)?.values() ?? [])],
    dispose: () => characters.clear(),
  };
}

export function createAnimatorIkCommandProxy(
  resolve: () => AnimatorIkCommandPort | undefined,
): AnimatorIkCommandPort {
  return {
    setGoal: (...args) => resolve()?.setGoal(...args) ?? characterRuntimeFailure({
      code: "animator-ik-unavailable",
      severity: "warning",
      message: "Animator IK commands require an active Play viewport.",
    }),
    clearGoal: (...args) => resolve()?.clearGoal(...args),
    clearLayer: (...args) => resolve()?.clearLayer(...args),
    clearCharacter: (...args) => resolve()?.clearCharacter(...args),
  };
}

function validateGoalAddress(
  characterId: string,
  layerId: string,
  value: HumanoidIkGoal,
): CharacterRuntimeResult<void> {
  if (!characterId || !layerId || !HUMANOID_IK_GOALS.includes(value.goal)) return characterRuntimeFailure(
    "invalid-animator-ik-address",
    "Animator IK requires a character, layer, and supported Humanoid goal.",
  );
  if ((!value.position && !value.rotation)
    || !unitWeight(value.positionWeight)
    || !unitWeight(value.rotationWeight)
    || !unitWeight(value.hintWeight ?? 0)
    || (value.position && !finiteTuple(value.position, 3))
    || (value.rotation && !finiteTuple(value.rotation, 4))
    || (value.hintPosition && !finiteTuple(value.hintPosition, 3))) return characterRuntimeFailure(
    "invalid-animator-ik-goal",
    "Animator IK goals require finite transforms and weights between zero and one.",
  );
  return characterRuntimeSuccess(undefined);
}

function cloneGoal(value: HumanoidIkGoal): HumanoidIkGoal {
  return {
    ...value,
    ...(value.position ? { position: [...value.position] as CharacterVector3 } : {}),
    ...(value.rotation ? { rotation: [...value.rotation] as CharacterQuaternion } : {}),
    ...(value.hintPosition ? { hintPosition: [...value.hintPosition] as CharacterVector3 } : {}),
  };
}

function unitWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function finiteTuple(value: readonly number[], length: number): boolean {
  return value.length === length && value.every(Number.isFinite);
}

function capacityFailure(label: string, limit: number): CharacterRuntimeResult<void> {
  return characterRuntimeFailure(
    "animator-ik-capacity-exceeded",
    `Animator IK cannot exceed ${limit} ${label}.`,
  );
}
