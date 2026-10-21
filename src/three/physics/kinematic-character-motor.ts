import type { PhysicsPlaybackSolver } from "./playback-backend";
import {
  inverseCharacterQuaternion,
  multiplyCharacterQuaternions,
  rotateCharacterVector,
  subtractCharacterVectors,
} from "../../character/runtime/pose-math";
import {
  applyRootMotionDelta,
  type RootMotionDelta,
  type RootMotionPose,
  type RootMotionSink,
} from "../../character/runtime/root-motion";
import type { PhysicsBodyBinding } from "../../physics/runtime/pose-binding";
import type { PreparedCharacterMovement } from "../../character-controller/runtime/character-motor-world";

export type KinematicCharacterMotorState = Readonly<{
  runtime: Pick<PhysicsPlaybackSolver, "writeKinematicBodyPose">;
  bodyBindings: readonly PhysicsBodyBinding[];
  objectPoses: Map<string, RootMotionPose>;
  bodyIndices?: ReadonlyMap<string, readonly number[]>;
  constrain?: (objectId: string, current: RootMotionPose, target: RootMotionPose) => RootMotionPose;
  prepareMovement?: (objectId: string, current: RootMotionPose, target: RootMotionPose) => PreparedCharacterMovement;
}>;

export function indexKinematicBindings(bindings: readonly PhysicsBodyBinding[]) {
  const indices = new Map<string, number[]>();
  bindings.forEach((binding, index) => {
    if (binding.bodyType !== "kinematic") return;
    const owned = indices.get(binding.objectId) ?? [];
    owned.push(index); indices.set(binding.objectId, owned);
  });
  return indices;
}

export function initialKinematicObjectPoses(
  bindings: readonly PhysicsBodyBinding[],
): Map<string, RootMotionPose> {
  const poses = new Map<string, RootMotionPose>();
  for (const binding of bindings) {
    if (binding.bodyType !== "kinematic" || poses.has(binding.objectId)) continue;
    poses.set(binding.objectId, {
      position: [...binding.objectPosition],
      rotation: [...binding.objectOrientation],
    });
  }
  return poses;
}

export function flushPendingKinematicMotorDeltas(
  state: KinematicCharacterMotorState,
  pending: Map<string, RootMotionDelta>,
  onChanged: () => void,
): void {
  for (const [objectId, delta] of pending) {
    if (state.objectPoses.has(objectId)) {
      applyKinematicMotorDelta(state, objectId, delta, onChanged);
    }
    pending.delete(objectId);
  }
}

/** Drops Play-session motor references and deltas before authored state resumes. */
export function resetKinematicMotorSession(
  pending: Map<string, RootMotionDelta>,
  sinks: Map<string, RootMotionSink>,
): void {
  pending.clear();
  sinks.clear();
}

/** Writes root motion to every collider owned by one kinematic scene object. */
export function applyKinematicMotorDelta(
  state: KinematicCharacterMotorState,
  objectId: string,
  delta: RootMotionDelta,
  onChanged: () => void,
): void {
  const current = state.objectPoses.get(objectId);
  if (!current) return;
  const applied = applyRootMotionDelta(current, delta);
  if (!applied.value) return;
  const prepared = state.prepareMovement?.(objectId, current, applied.value);
  const target = prepared?.pose ?? state.constrain?.(objectId, current, applied.value) ?? applied.value;

  for (const index of (state.bodyIndices ?? indexKinematicBindings(state.bodyBindings)).get(objectId) ?? []) {
    const binding = state.bodyBindings[index];
    if (binding?.objectId !== objectId || binding.bodyType !== "kinematic") continue;
    const bodyRotation = multiplyCharacterQuaternions(
      target.rotation,
      inverseCharacterQuaternion(binding.objectLocalOrientation),
    );
    const bodyPosition = subtractCharacterVectors(
      target.position,
      rotateCharacterVector(bodyRotation, binding.objectLocalOffset),
    );
    state.runtime.writeKinematicBodyPose(
      index,
      [...bodyPosition],
      [...bodyRotation],
    );
  }
  state.objectPoses.set(objectId, target);
  prepared?.commit();
  onChanged();
}
