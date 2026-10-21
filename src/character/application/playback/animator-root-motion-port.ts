import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { RootMotionApplication, RootMotionSink } from "../../runtime/root-motion";

export type AnimatorRootMotionSubscription = Readonly<{ dispose: () => void }>;

export type AnimatorRootMotionPort = Readonly<{
  registerMotor: (
    characterId: string,
    sink: RootMotionSink,
  ) => CharacterRuntimeResult<AnimatorRootMotionSubscription>;
  subscribe: (
    listener: (application: RootMotionApplication) => void,
  ) => CharacterRuntimeResult<AnimatorRootMotionSubscription>;
}>;

export type AnimatorRootMotionStore = Readonly<{
  port: AnimatorRootMotionPort;
  motorSink: RootMotionSink;
  observerSink: RootMotionSink;
  hasMotor: (characterId: string) => boolean;
  clearCharacter: (characterId: string) => void;
  dispose: () => void;
}>;

const MAX_CHARACTER_MOTORS = 32;
const MAX_ROOT_MOTION_LISTENERS = 32;

/** Routes extracted root motion to one explicit motor owner and bounded observers. */
export function createAnimatorRootMotionStore(
  onDiagnostic?: (diagnostic: CharacterRuntimeDiagnostic) => void,
): AnimatorRootMotionStore {
  const motors = new Map<string, RootMotionSink>();
  const listeners = new Set<(application: RootMotionApplication) => void>();
  let disposed = false;
  const port: AnimatorRootMotionPort = {
    registerMotor: (characterId, sink) => {
      if (disposed || !characterId || typeof sink?.applyRootMotion !== "function") return characterRuntimeFailure(
        "invalid-character-motor",
        "A character motor requires a live root-motion sink and character ID.",
      );
      if (!motors.has(characterId) && motors.size >= MAX_CHARACTER_MOTORS) return characterRuntimeFailure(
        "character-motor-capacity-exceeded",
        `A world cannot register more than ${MAX_CHARACTER_MOTORS} character motors.`,
      );
      if (motors.has(characterId)) return characterRuntimeFailure(
        "duplicate-character-motor",
        `Character ${characterId} already has a root-motion owner.`,
      );
      motors.set(characterId, sink);
      let live = true;
      return characterRuntimeSuccess({ dispose: () => {
        if (!live) return;
        live = false;
        if (motors.get(characterId) === sink) motors.delete(characterId);
      } });
    },
    subscribe: (listener) => {
      if (disposed || typeof listener !== "function" || listeners.size >= MAX_ROOT_MOTION_LISTENERS) {
        return characterRuntimeFailure(
          "root-motion-listener-capacity-exceeded",
          `A world cannot exceed ${MAX_ROOT_MOTION_LISTENERS} extracted root-motion listeners.`,
        );
      }
      listeners.add(listener);
      let live = true;
      return characterRuntimeSuccess({ dispose: () => {
        if (!live) return;
        live = false;
        listeners.delete(listener);
      } });
    },
  };
  const motorSink: RootMotionSink = {
    applyRootMotion: (application) => {
      if (disposed) return;
      const motor = motors.get(application.characterId);
      if (motor) invokeSafely(() => motor.applyRootMotion(application), "character-motor-callback-failed", onDiagnostic);
    },
  };
  const observerSink: RootMotionSink = {
    applyRootMotion: (application) => {
      if (disposed) return;
      for (const listener of [...listeners]) {
        invokeSafely(() => listener(application), "root-motion-listener-failed", onDiagnostic);
      }
    },
  };
  return {
    port,
    motorSink,
    observerSink,
    hasMotor: (characterId) => motors.has(characterId),
    clearCharacter: (characterId) => { motors.delete(characterId); },
    dispose: () => {
      disposed = true;
      motors.clear();
      listeners.clear();
    },
  };
}

function invokeSafely(
  callback: () => void,
  code: string,
  onDiagnostic: ((diagnostic: CharacterRuntimeDiagnostic) => void) | undefined,
): void {
  try {
    callback();
  } catch (error) {
    onDiagnostic?.({
      code,
      severity: "warning",
      message: `Root-motion callback failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
