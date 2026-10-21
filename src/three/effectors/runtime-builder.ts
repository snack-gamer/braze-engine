import * as THREE from "three";
import {
  buildCurveLut,
  EFFECTOR_SHAPE_INDEX,
  sampleLut,
} from "../../lib/effector";
import type { EffectorSettings } from "../../types";
import {
  dot3,
  length3,
  normalize3,
  qconj,
  qrot,
  saturate,
  sub3,
  type V3,
  type V4,
} from "./math";
import type { EffectorRuntime } from "./runtime-types";

const temporaryVector = new THREE.Vector3();
const temporaryQuaternion = new THREE.Quaternion();
const temporaryScale = new THREE.Vector3();

let cachedIdentityLut: Float32Array | null = null;

function identityLut(): Float32Array {
  if (!cachedIdentityLut) {
    cachedIdentityLut = new Float32Array(256);
    for (let index = 0; index < 256; index++) cachedIdentityLut[index] = index / 255;
  }
  return cachedIdentityLut;
}

export function buildEffectorRuntime(
  settings: EffectorSettings,
  node: THREE.Object3D,
  objectMap: Map<string, THREE.Object3D>,
): EffectorRuntime {
  node.updateMatrixWorld(true);
  node.matrixWorld.decompose(temporaryVector, temporaryQuaternion, temporaryScale);
  const position: V3 = [temporaryVector.x, temporaryVector.y, temporaryVector.z];
  const rotation: V4 = [
    temporaryQuaternion.x,
    temporaryQuaternion.y,
    temporaryQuaternion.z,
    temporaryQuaternion.w,
  ];

  let boxHalf: V3 = [
    settings.boxSize[0] * 0.5,
    settings.boxSize[1] * 0.5,
    settings.boxSize[2] * 0.5,
  ];
  let radius = settings.radius;
  if (settings.shape === "capsule" || settings.shape === "cylinder" || settings.shape === "cone") {
    boxHalf = [settings.radius, settings.height * 0.5, settings.radius];
  } else if (settings.shape === "torus") {
    boxHalf = [settings.torusMinorRadius, 0, 0];
    radius = settings.torusMajorRadius;
  } else if (settings.shape === "plane") {
    boxHalf = [
      settings.planeSize[0] * 0.5,
      settings.planeThickness * 0.5,
      settings.planeSize[1] * 0.5,
    ];
  }

  let targetPosition: V3 = position;
  let targetUpSource: V3 = [0, 1, 0];
  const targetNode = settings.targetObjectId
    ? objectMap.get(settings.targetObjectId)
    : undefined;
  if (settings.type === "target") {
    if (targetNode) {
      targetNode.updateMatrixWorld(true);
      targetNode.matrixWorld.decompose(temporaryVector, temporaryQuaternion, temporaryScale);
      targetPosition = [temporaryVector.x, temporaryVector.y, temporaryVector.z];
    }
    if (settings.upMode === "effector") {
      targetUpSource = qrot(rotation, [0, 1, 0]);
    } else if (settings.upMode === "target") {
      if (targetNode) {
        targetNode.matrixWorld.decompose(temporaryVector, temporaryQuaternion, temporaryScale);
        targetUpSource = qrot([
          temporaryQuaternion.x,
          temporaryQuaternion.y,
          temporaryQuaternion.z,
          temporaryQuaternion.w,
        ], [0, 1, 0]);
      } else {
        targetUpSource = qrot(rotation, [0, 1, 0]);
      }
    } else if (settings.upMode === "custom") {
      targetUpSource = [...settings.customUp] as V3;
    }
    if (dot3(targetUpSource, targetUpSource) <= 1e-8) targetUpSource = [0, 1, 0];
    targetUpSource = normalize3(targetUpSource, [0, 1, 0]);
  }

  const functionSource = settings.type === "step"
    ? settings.stepCurve
    : settings.type === "shader"
      ? settings.remapCurve
      : null;
  return {
    settings,
    position,
    rotation,
    boxHalf,
    radius,
    falloffLut: buildCurveLut(settings.falloff),
    functionLut: functionSource ? buildCurveLut(functionSource) : identityLut(),
    targetPosition,
    targetUp: targetUpSource,
  };
}

function effectorShapeDistance(effector: EffectorRuntime, point: V3, shape: number): number {
  const epsilon = 1e-5;
  if (shape === 1) {
    return length3(sub3(point, effector.position)) / Math.max(effector.radius, epsilon);
  }
  const inverseRotation = qconj(effector.rotation);
  const localPoint = qrot(inverseRotation, sub3(point, effector.position));
  if (shape === 2 || shape === 7) {
    return Math.max(
      Math.abs(localPoint[0]) / Math.max(effector.boxHalf[0], epsilon),
      Math.abs(localPoint[1]) / Math.max(effector.boxHalf[1], epsilon),
      Math.abs(localPoint[2]) / Math.max(effector.boxHalf[2], epsilon),
    );
  }
  if (shape === 3) {
    const capsuleRadius = Math.max(effector.radius, epsilon);
    const halfHeight = Math.max(effector.boxHalf[1], capsuleRadius);
    const segment = Math.max(halfHeight - capsuleRadius, 0);
    const capsulePoint: V3 = [
      localPoint[0],
      Math.max(Math.abs(localPoint[1]) - segment, 0),
      localPoint[2],
    ];
    return length3(capsulePoint) / capsuleRadius;
  }
  if (shape === 4) {
    const radial = Math.hypot(localPoint[0], localPoint[2]) / Math.max(effector.radius, epsilon);
    const vertical = Math.abs(localPoint[1]) / Math.max(effector.boxHalf[1], epsilon);
    return Math.max(radial, vertical);
  }
  if (shape === 5) {
    const halfHeight = Math.max(effector.boxHalf[1], epsilon);
    const height = saturate((localPoint[1] + halfHeight) / (2 * halfHeight));
    const availableRadius = Math.max(effector.radius * (1 - height), epsilon);
    const radial = Math.hypot(localPoint[0], localPoint[2]) / availableRadius;
    const vertical = Math.abs(localPoint[1]) / halfHeight;
    return Math.max(radial, vertical);
  }
  if (shape === 6) {
    const tubeDistance = Math.hypot(
      Math.hypot(localPoint[0], localPoint[2]) - effector.radius,
      localPoint[1],
    );
    return tubeDistance / Math.max(effector.boxHalf[0], epsilon);
  }
  return 0;
}

export function effectorWeight(effector: EffectorRuntime, point: V3): number {
  const shape = EFFECTOR_SHAPE_INDEX[effector.settings.shape];
  if (shape === 0) return effector.settings.strength;
  const distance = effectorShapeDistance(effector, point, shape);
  if (distance > 1) return 0;
  return sampleLut(effector.falloffLut, distance) * effector.settings.strength;
}
