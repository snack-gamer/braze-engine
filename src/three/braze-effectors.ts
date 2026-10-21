// Public BrazeFX runtime boundary. The implementation remains a 1:1 CPU port
// of the reference HLSL, grouped by math, sampling, application, and lifecycle.
export {
  applyEffectorToInstance,
  identityEffectorState,
} from "./effectors/application";
export {
  axisCorrection,
  eulerQuat,
  hashU32,
  qconj,
  qmul,
  qnormalize,
  qrot,
  quatFromBasis,
  type V3,
  type V4,
} from "./effectors/math";
export { pushApartPass } from "./effectors/push-apart";
export {
  buildEffectorRuntime,
  effectorWeight,
} from "./effectors/runtime-builder";
export type {
  EffectorContext,
  EffectorInstanceState,
  EffectorRuntime,
} from "./effectors/runtime-types";
