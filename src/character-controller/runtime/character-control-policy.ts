import type { GameInput } from "../../input/domain/action-map";
import type { GameCameraPose, GameVec3 } from "../../gameplay/domain/game-module";
import type { CameraPolicy } from "../../camera/domain/stock-camera-policy";
import type { GameCharacterMovementLease, GameCharacterPose } from "../domain/game-character-commands";
import { DEFAULT_CHARACTER_CONTROL_ACTIONS, DEFAULT_CHARACTER_CONTROL_SETTINGS, type CharacterControlSettings } from "../domain/character-control-settings";
import { createCharacterControlLook, type CharacterControlOrientation } from "./character-control-look";
import { createCharacterLocomotion } from "./character-locomotion";

export type CharacterControlPorts = Readonly<{
  input: Pick<GameInput, "action" | "bindings">;
  movement: Pick<GameCharacterMovementLease, "snapshot" | "move">;
  camera?: Readonly<{ setPose: (pose: GameCameraPose) => void }>;
}>;
export type CharacterControlFacing = (input: GameVec3, orientation: CharacterControlOrientation, pose: GameCharacterPose) => number;
export const faceCharacterView: CharacterControlFacing = (_input, orientation) => orientation.yawDegrees;
export const faceCharacterMovement: CharacterControlFacing = (input, _orientation, pose) => Math.hypot(input[0], input[2]) > 1e-6
  ? Math.atan2(input[0], input[2]) * 180 / Math.PI : pose.yawDegrees;

/** One synchronous orientation→motor→camera step. Ports permit scripted composition/replacement. */
export function createCharacterControlPolicy(ports: CharacterControlPorts, settings: CharacterControlSettings = DEFAULT_CHARACTER_CONTROL_SETTINGS,
  camera?: CameraPolicy, facing: CharacterControlFacing = faceCharacterView) {
  const actions = Object.freeze({ ...settings.actions });
  const map = ports.input.bindings();
  const lookSettings = Object.freeze({ ...settings.look });
  for (const key of Object.keys(DEFAULT_CHARACTER_CONTROL_ACTIONS) as (keyof typeof actions)[]) {
    const name = actions[key];
    const kind = key === "jump" ? "button" : key === "lookX" || key === "lookY" ? "delta" : "axis";
    if (typeof name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(name) || !map.actions.some((action) => action.name === name && action.kind === kind)) throw new Error(`Character control action '${name}' must exist with kind ${kind}.`);
  }
  let initial = ports.movement.snapshot();
  let look = createCharacterControlLook(lookSettings, initial?.yawDegrees ?? 0);
  let commandYaw = initial?.yawDegrees ?? 0;
  const locomotion = createCharacterLocomotion((delta) => ports.movement.move(delta, { yawDegrees: commandYaw }), settings.locomotion);
  const reset = () => {
    initial = ports.movement.snapshot(); commandYaw = initial?.yawDegrees ?? 0;
    look = createCharacterControlLook(lookSettings, commandYaw); locomotion.reset(); camera?.reset();
  };
  return {
    step(deltaSeconds: number) {
      const pose = ports.movement.snapshot();
      if (!pose) return null;
      if (!initial) reset();
      const action = (key: keyof typeof actions) => ports.input.action(actions[key]);
      const orientation = look.step({ deltaX: action("lookX").value, deltaY: action("lookY").value,
        rateX: action("lookRateX").value, rateY: action("lookRateY").value }, deltaSeconds);
      const yaw = orientation.yawDegrees * Math.PI / 180, x = action("moveX").value, z = action("moveZ").value;
      const input: GameVec3 = [x * Math.cos(yaw) + z * Math.sin(yaw), 0, z * Math.cos(yaw) - x * Math.sin(yaw)];
      commandYaw = facing(input, orientation, pose);
      if (!Number.isFinite(commandYaw)) throw new Error("Character facing policy returned an invalid yaw.");
      const movement = locomotion.step({ x: input[0], z: input[2], jump: action("jump").pressed }, deltaSeconds);
      const cameraPose = camera?.sample(movement.position, orientation, deltaSeconds) ?? null;
      if (cameraPose) ports.camera?.setPose(cameraPose);
      return Object.freeze({ orientation, movement, camera: cameraPose });
    }, reset,
  };
}
