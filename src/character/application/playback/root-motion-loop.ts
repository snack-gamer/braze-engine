import {
  composeRootMotionDeltas,
  extractRootMotionDelta,
  type RootMotionDelta,
  type RootMotionLoopBoundary,
  type RootMotionPose,
} from "../../runtime/root-motion";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

const IDENTITY_DELTA: RootMotionDelta = {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
};

/**
 * Extracts a root delta across any safe signed number of clip cycles.
 * Repeated cycle transforms use exponentiation by squaring, so work remains
 * logarithmic even when an authored speed crosses many cycles in one step.
 */
export function extractLoopedRootMotionDelta(
  previous: RootMotionPose,
  current: RootMotionPose,
  boundary: RootMotionLoopBoundary,
  cycleCrossings: number,
): CharacterRuntimeResult<RootMotionDelta> {
  if (!Number.isSafeInteger(cycleCrossings) || cycleCrossings === 0) {
    return characterRuntimeFailure({
      code: "invalid-root-motion-loop-count",
      severity: "error",
      message: "Root-motion loop correction requires a non-zero safe integer cycle count.",
      details: { cycleCrossings },
    });
  }

  const forward = cycleCrossings > 0;
  const first = extractRootMotionDelta(
    previous,
    forward ? boundary.cycleEnd : boundary.cycleStart,
  );
  const cycle = extractRootMotionDelta(
    forward ? boundary.cycleStart : boundary.cycleEnd,
    forward ? boundary.cycleEnd : boundary.cycleStart,
  );
  const last = extractRootMotionDelta(
    forward ? boundary.cycleStart : boundary.cycleEnd,
    current,
  );
  const diagnostics = [
    ...first.diagnostics,
    ...cycle.diagnostics,
    ...last.diagnostics,
  ];
  if (!first.value || !cycle.value || !last.value) return { value: null, diagnostics };

  const repeated = repeatDelta(cycle.value, Math.abs(cycleCrossings) - 1);
  return characterRuntimeSuccess(
    composeRootMotionDeltas(
      composeRootMotionDeltas(first.value, repeated),
      last.value,
    ),
    diagnostics,
  );
}

function repeatDelta(delta: RootMotionDelta, count: number): RootMotionDelta {
  let remaining = count;
  let result = IDENTITY_DELTA;
  let power = delta;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = composeRootMotionDeltas(result, power);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) power = composeRootMotionDeltas(power, power);
  }
  return result;
}
