import type { PhysicsVec3 } from "../../physics/domain/components";
import type { PhysicsPlaybackState } from "./physics-playback-state";
import { applyKinematicMotorDelta } from "./kinematic-character-motor";
import { inverseCharacterQuaternion, multiplyCharacterQuaternions, rotateCharacterVector } from "../../character/runtime/pose-math";

export function characterMotorState(state: PhysicsPlaybackState) {
  return { runtime: state.runtime, bodyBindings: state.bodyBindings, objectPoses: state.kinematicObjectPoses,
    bodyIndices: state.kinematicBodyIndices, prepareMovement: state.characters?.prepareMovement };
}

/** World-space displacement command; gameplay owns gravity/jump velocities and timing. */
export function movePhysicsCharacter(state: PhysicsPlaybackState, objectId: string, displacement: PhysicsVec3, onChanged: () => void, yawDegrees?: number) {
  const pose = state.kinematicObjectPoses.get(objectId);
  if (!state.characters?.has(objectId) || !pose) throw new Error(`No enabled Character Controller for ${objectId}.`);
  if (displacement.length !== 3 || !displacement.every(Number.isFinite)) throw new Error("Character displacement requires three finite numbers.");
  if (yawDegrees !== undefined && !Number.isFinite(yawDegrees)) throw new Error("Character yaw requires a finite angle in degrees.");
  const inverse = inverseCharacterQuaternion(pose.rotation), halfYaw = (yawDegrees ?? 0) % 360 * Math.PI / 360;
  applyKinematicMotorDelta(characterMotorState(state), objectId, {
    translation: rotateCharacterVector(inverse, displacement),
    rotation: yawDegrees === undefined ? [0, 0, 0, 1] : multiplyCharacterQuaternions(inverse, [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)]),
  }, onChanged);
  return { ...state.characters.result(objectId)!, position: [...state.kinematicObjectPoses.get(objectId)!.position] as PhysicsVec3,
    scope: "static" as const, queued: true as const };
}
