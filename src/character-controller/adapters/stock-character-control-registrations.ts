import type { BehaviorRegistration, RegisteredBehaviorScope } from "../../behaviors/domain/behavior-registration";
import type { BehaviorValues } from "../../behaviors/domain/behavior-component";
import type { EntityBehaviorTick } from "../../behaviors/domain/entity-behaviors";
import type { GameContext } from "../../gameplay/domain/game-module";
import type { GameCameraLease } from "../../camera/domain/game-camera";
import type { CameraConstraint, StockCameraSettings } from "../../camera/domain/stock-camera-policy";
import type { GameCharacterMovementLease } from "../domain/game-character-commands";
import { STOCK_CHARACTER_CONTROL_DEFINITIONS } from "../domain/stock-character-control-definitions";
import { DEFAULT_FIRST_PERSON_CONTROL_SETTINGS, type StockCharacterControlOptions } from "../domain/stock-character-control-settings";
import { createFirstPersonControl, createThirdPersonControl, createTopDownControl } from "../runtime/stock-character-controls";
import type { CharacterControlPorts } from "../runtime/character-control-policy";

function options(values: BehaviorValues, firstPersonCamera?: StockCameraSettings): StockCharacterControlOptions {
  const number = (key: string) => { if (typeof values[key] !== "number") throw new Error(`Stock control '${key}' must be numeric.`); return values[key] as number; };
  const text = (key: string) => { if (typeof values[key] !== "string") throw new Error(`Stock control '${key}' must be an action name.`); return values[key] as string; };
  return { actions: { moveX: text("moveXAction"), moveZ: text("moveZAction"), jump: text("jumpAction"),
    lookX: text("lookXAction"), lookY: text("lookYAction"), lookRateX: text("lookRateXAction"), lookRateY: text("lookRateYAction") },
    locomotion: { speed: number("speed"), gravity: number("gravity"), jumpSpeed: number("jumpSpeed") },
    look: { mouseSensitivity: number("mouseSensitivity"), gamepadLookSpeed: number("gamepadLookSpeed"), yawOffset: number("yawOffset"),
      initialPitch: number("initialPitch"), pitchMin: number("pitchMin"), pitchMax: number("pitchMax") },
    camera: { pivotHeight: number("pivotHeight"), shoulderOffset: firstPersonCamera?.shoulderOffset ?? number("shoulderOffset"),
      distance: firstPersonCamera?.distance ?? number("distance"), fov: number("fov"), sharpness: number("sharpness"),
      collisionRadius: firstPersonCamera?.collisionRadius ?? number("collisionRadius") } };
}
type Factory = (ports: CharacterControlPorts, options?: StockCharacterControlOptions, constrain?: CameraConstraint) => ReturnType<typeof createFirstPersonControl>;
const factories: readonly Factory[] = [createFirstPersonControl, createThirdPersonControl, createTopDownControl];
export const STOCK_CHARACTER_CONTROL_REGISTRATIONS: readonly BehaviorRegistration[] = Object.freeze(STOCK_CHARACTER_CONTROL_DEFINITIONS.map((definition, index) => Object.freeze({
  ...definition,
  description: "Caller-clocked movement against static geometry with an optional owned camera. Disable applied Animator root motion when using this movement policy.",
  create(scope: RegisteredBehaviorScope, values: BehaviorValues, context: GameContext) {
    const settings = options(values, index === 0 ? DEFAULT_FIRST_PERSON_CONTROL_SETTINGS.camera : undefined);
    const factory = factories[index];
    if (!factory) throw new Error("Unsupported stock character control registration.");
    if (typeof values.cameraEnabled !== "boolean") throw new Error("Stock control cameraEnabled must be boolean.");
    const cameraEnabled = values.cameraEnabled;
    let movement: GameCharacterMovementLease | undefined, camera: GameCameraLease | undefined;
    let gesture: (() => void) | undefined, policy: ReturnType<typeof createFirstPersonControl> | undefined;
    let disposed = false;
    const release = () => {
      const jobs = [gesture, camera?.release, movement?.release];
      gesture = undefined; camera = undefined; movement = undefined; policy = undefined;
      let failure: unknown;
      for (const cleanup of jobs) { try { cleanup?.(); } catch (error) { failure ??= error; } }
      if (failure) throw failure;
    };
    scope.defer(release);
    return {
      onEnable() {
        if (disposed || scope.signal.aborted) return;
        try {
          const ownedMovement = context.characters.acquire(scope.entity, definition.label);
          movement = ownedMovement;
          if (cameraEnabled) {
            camera = context.camera.acquire(definition.label);
            if (index !== 2) gesture = context.input.capturePointerLock(true);
          }
          policy = factory({ input: context.input, movement: ownedMovement, camera }, settings, context.camera.constrain);
        } catch (error) { release(); throw error; }
      },
      fixedUpdate(tick: EntityBehaviorTick) { policy?.step(tick.deltaSeconds); },
      onDisable: release,
      dispose() { disposed = true; release(); },
    };
  },
})));
