import { EFFECTOR_AIM_AXIS_INDEX } from "../../lib/effector";
import {
  add3,
  axisCorrection,
  cross,
  dot3,
  eulerQuat,
  length3,
  mul3,
  normalize3,
  qconj,
  qmul,
  qnlerp,
  qnormalize,
  qrot,
  quatFromBasis,
  scale3,
  sub3,
  type V3,
  type V4,
} from "./math";
import { effectorWeight } from "./runtime-builder";
import type {
  EffectorContext,
  EffectorInstanceState,
  EffectorRuntime,
} from "./runtime-types";
import { sampleEffector } from "./sampling";

function applyTargetEffector(
  effector: EffectorRuntime,
  weight: number,
  baseRotation: V4,
  pivot: V3,
  state: EffectorInstanceState,
): void {
  const target = effector.targetPosition;
  let up = normalize3(effector.targetUp, [0, 1, 0]);
  const currentWorld = qnormalize(qmul(state.rotation, baseRotation));
  let currentPivot = pivot;

  if (effector.settings.repel
      && effector.settings.repelDistance > 0
      && effector.settings.repelStrength > 0) {
    let away = sub3(currentPivot, target);
    const distanceToTarget = length3(away);
    if (distanceToTarget < effector.settings.repelDistance) {
      away = distanceToTarget > 1e-6
        ? scale3(away, 1 / distanceToTarget)
        : qrot(currentWorld, [0, 0, 1]);
      const delta = scale3(
        normalize3(away, [0, 0, 1]),
        (effector.settings.repelDistance - distanceToTarget)
          * effector.settings.repelStrength
          * weight,
      );
      state.position = add3(state.position, delta);
      currentPivot = add3(currentPivot, delta);
    }
  }

  let direction = sub3(target, currentPivot);
  if (!effector.settings.usePitch) {
    direction = sub3(direction, scale3(up, dot3(direction, up)));
    if (dot3(direction, direction) <= 1e-8) {
      direction = qrot(currentWorld, [0, 0, 1]);
      direction = sub3(direction, scale3(up, dot3(direction, up)));
    }
  }
  if (dot3(direction, direction) <= 1e-8) return;
  direction = normalize3(direction, [0, 0, 1]);

  if (Math.abs(dot3(direction, up)) > 0.999) {
    up = qrot(currentWorld, [0, 1, 0]);
    up = sub3(up, scale3(direction, dot3(up, direction)));
  }
  if (dot3(up, up) <= 1e-8) {
    up = cross(direction, Math.abs(direction[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0]);
  }
  up = normalize3(up, [0, 1, 0]);

  const right = normalize3(cross(up, direction), [1, 0, 0]);
  const stableUp = cross(direction, right);
  const look = quatFromBasis(right, stableUp, direction);
  const desiredWorld = qnormalize(qmul(
    look,
    axisCorrection(EFFECTOR_AIM_AXIS_INDEX[effector.settings.aimAxis]),
  ));
  const blendedWorld = qnlerp(currentWorld, desiredWorld, weight);
  state.rotation = qnormalize(qmul(blendedWorld, qconj(baseRotation)));
}

export function applyEffectorToInstance(
  effector: EffectorRuntime,
  context: EffectorContext,
  fragmentId: number,
  stackIndex: number,
  basePosition: V3,
  baseRotation: V4,
  state: EffectorInstanceState,
): void {
  const pivot = add3(basePosition, state.position);
  const weight = effectorWeight(effector, pivot);
  if (Math.abs(weight) <= 1e-6) return;

  if (effector.settings.type === "target") {
    applyTargetEffector(effector, weight, baseRotation, pivot, state);
    return;
  }
  if (effector.settings.type === "pushApart") return;

  const sample = sampleEffector(effector, context, fragmentId, stackIndex, pivot);
  const localSpace = effector.settings.transformSpace === "effector";
  const frame: V4 = localSpace ? effector.rotation : [0, 0, 0, 1];
  const inverseFrame = qconj(frame);

  if (effector.settings.affectPosition) {
    state.position = add3(
      state.position,
      scale3(qrot(frame, mul3(sample.position, effector.settings.positionAmount)), weight),
    );
  }
  if (effector.settings.affectRotation) {
    const radians: V3 = [
      sample.rotation[0] * effector.settings.rotationAmount[0] * (Math.PI / 180) * weight,
      sample.rotation[1] * effector.settings.rotationAmount[1] * (Math.PI / 180) * weight,
      sample.rotation[2] * effector.settings.rotationAmount[2] * (Math.PI / 180) * weight,
    ];
    const rotation = qmul(frame, qmul(eulerQuat(radians), inverseFrame));
    state.rotation = qnormalize(qmul(rotation, state.rotation));
  }
  if (effector.settings.affectScale) {
    const scaleSample: V3 = effector.settings.uniformScale
      ? [sample.scale[0], sample.scale[0], sample.scale[0]]
      : sample.scale;
    const targetScale: V3 = [
      Math.max(0.001, 1 + scaleSample[0] * effector.settings.scaleAmount[0]),
      Math.max(0.001, 1 + scaleSample[1] * effector.settings.scaleAmount[1]),
      Math.max(0.001, 1 + scaleSample[2] * effector.settings.scaleAmount[2]),
    ];
    state.scale = [
      state.scale[0] * (1 + (targetScale[0] - 1) * weight),
      state.scale[1] * (1 + (targetScale[1] - 1) * weight),
      state.scale[2] * (1 + (targetScale[2] - 1) * weight),
    ];
  }
}

export function identityEffectorState(): EffectorInstanceState {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}
