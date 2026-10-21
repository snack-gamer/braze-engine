import {
  addCharacterVectors,
  finiteQuaternion,
  finiteVector3,
  inverseCharacterQuaternion,
  multiplyCharacterQuaternions,
  normalizeCharacterQuaternion,
  rotateCharacterVector,
  subtractCharacterVectors,
  type CharacterQuaternion,
  type CharacterVector3,
} from "./pose-math";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";

export type RootMotionPose = Readonly<{
  position: CharacterVector3;
  rotation: CharacterQuaternion;
}>;

/** A root delta expressed in the previous root's local coordinate frame. */
export type RootMotionDelta = Readonly<{
  translation: CharacterVector3;
  rotation: CharacterQuaternion;
}>;

export type RootMotionLoopBoundary = Readonly<{
  cycleStart: RootMotionPose;
  cycleEnd: RootMotionPose;
}>;

export type RootMotionApplication = Readonly<{
  characterId: string;
  delta: RootMotionDelta;
  fixedDeltaSeconds: number;
}>;

/** Runtime port implemented by a character motor or physics adapter. */
export type RootMotionSink = {
  applyRootMotion: (application: RootMotionApplication) => void;
};

export function extractRootMotionDelta(
  previous: RootMotionPose,
  current: RootMotionPose,
  wrappedLoop?: RootMotionLoopBoundary,
): CharacterRuntimeResult<RootMotionDelta> {
  const invalid = validatePose(previous, "previous") ?? validatePose(current, "current")
    ?? (wrappedLoop
      ? validatePose(wrappedLoop.cycleStart, "cycleStart") ?? validatePose(wrappedLoop.cycleEnd, "cycleEnd")
      : null);
  if (invalid) return characterRuntimeFailure(invalid);

  const delta = wrappedLoop
    ? composeRootMotionDeltas(
        relativeRootMotion(previous, wrappedLoop.cycleEnd),
        relativeRootMotion(wrappedLoop.cycleStart, current),
      )
    : relativeRootMotion(previous, current);
  return characterRuntimeSuccess(delta);
}

export function applyRootMotionDelta(
  pose: RootMotionPose,
  delta: RootMotionDelta,
): CharacterRuntimeResult<RootMotionPose> {
  const invalid = validatePose(pose, "pose");
  if (invalid || !finiteVector3(delta.translation) || !finiteQuaternion(delta.rotation)) {
    return characterRuntimeFailure(invalid ?? {
      code: "invalid-root-motion-delta",
      severity: "error",
      message: "Root-motion delta contains a non-finite translation or invalid quaternion.",
    });
  }
  return characterRuntimeSuccess({
    position: addCharacterVectors(pose.position, rotateCharacterVector(pose.rotation, delta.translation)),
    rotation: multiplyCharacterQuaternions(pose.rotation, delta.rotation),
  });
}

export function composeRootMotionDeltas(
  first: RootMotionDelta,
  second: RootMotionDelta,
): RootMotionDelta {
  return {
    translation: addCharacterVectors(first.translation, rotateCharacterVector(first.rotation, second.translation)),
    rotation: multiplyCharacterQuaternions(first.rotation, second.rotation),
  };
}

function relativeRootMotion(previous: RootMotionPose, current: RootMotionPose): RootMotionDelta {
  const previousInverse = inverseCharacterQuaternion(previous.rotation);
  return {
    translation: rotateCharacterVector(
      previousInverse,
      subtractCharacterVectors(current.position, previous.position),
    ),
    rotation: multiplyCharacterQuaternions(previousInverse, current.rotation),
  };
}

function validatePose(pose: RootMotionPose, path: string) {
  if (finiteVector3(pose.position) && normalizeCharacterQuaternion(pose.rotation)) return null;
  return {
    code: "invalid-root-motion-pose",
    severity: "error" as const,
    message: `Root-motion ${path} pose contains a non-finite position or invalid quaternion.`,
    path,
  };
}
